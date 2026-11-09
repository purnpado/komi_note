package vault

import (
	"errors"
	"sort"
	"time"

	"TeacherNote/internal/budget"
)

// BudgetLedger·BudgetEntry·BudgetBook은 예산 장부 자료입니다.
type BudgetLedger = budget.Ledger
type BudgetEntry = budget.Entry
type BudgetBook = budget.Book

func copyBudgetBook(book budget.Book) budget.Book {
	ledgers := make([]budget.Ledger, len(book.Ledgers))
	for i, ledger := range book.Ledgers {
		ledgers[i] = ledger
		ledgers[i].Categories = append([]string{}, ledger.Categories...)
	}
	entries := make([]budget.Entry, len(book.Entries))
	for i, entry := range book.Entries {
		entries[i] = entry
		entries[i].Receipts = append([]budget.Receipt{}, entry.Receipts...)
	}
	return budget.Book{Ledgers: ledgers, Entries: entries}
}

// GetBudgetBook은 장부(학년도 최근 순)와 내역(날짜 최근 순)을 돌려줍니다.
func (s *VaultStore) GetBudgetBook() (BudgetBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return BudgetBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Budget == nil {
		return BudgetBook{Ledgers: []budget.Ledger{}, Entries: []budget.Entry{}}, nil
	}
	book := copyBudgetBook(*s.session.Budget)
	sort.SliceStable(book.Ledgers, func(i, j int) bool {
		if book.Ledgers[i].SchoolYear != book.Ledgers[j].SchoolYear {
			return book.Ledgers[i].SchoolYear > book.Ledgers[j].SchoolYear
		}
		return book.Ledgers[i].CreatedAt < book.Ledgers[j].CreatedAt
	})
	sort.SliceStable(book.Entries, func(i, j int) bool {
		if book.Entries[i].Date != book.Entries[j].Date {
			return book.Entries[i].Date > book.Entries[j].Date
		}
		return book.Entries[i].CreatedAt > book.Entries[j].CreatedAt
	})
	return book, nil
}

// changeBudgetLocked는 예산 자료를 바꾸고 저장합니다. 실패하면 되돌립니다.
func (s *VaultStore) changeBudgetLocked(change func(book *budget.Book) error) error {
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	previous, previousUpdated := s.session.Budget, s.session.UpdatedAt
	book := budget.Book{Ledgers: []budget.Ledger{}, Entries: []budget.Entry{}}
	if previous != nil {
		book = copyBudgetBook(*previous)
	}
	if err := change(&book); err != nil {
		return err
	}
	s.session.Budget = &book
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Budget, s.session.UpdatedAt = previous, previousUpdated
		return err
	}
	return nil
}

func ledgerIndex(book *budget.Book, id string) int {
	for i := range book.Ledgers {
		if book.Ledgers[i].ID == id {
			return i
		}
	}
	return -1
}

func entryIndex(book *budget.Book, id string) int {
	for i := range book.Entries {
		if book.Entries[i].ID == id {
			return i
		}
	}
	return -1
}

// SaveBudgetLedger는 장부를 만들거나 고칩니다. 쓰는 중인 항목은 지울 수 없습니다.
func (s *VaultStore) SaveBudgetLedger(ledger BudgetLedger) (BudgetLedger, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	normalized, err := budget.NormalizeLedger(ledger)
	if err != nil {
		return BudgetLedger{}, err
	}
	err = s.changeBudgetLocked(func(book *budget.Book) error {
		now := nowLocal()
		normalized.UpdatedAt = now
		index := ledgerIndex(book, normalized.ID)
		if normalized.ID == "" {
			if len(book.Ledgers) >= budget.MaxLedgers {
				return errors.New("장부는 50개까지 만들 수 있습니다")
			}
			id, err := newStudentID()
			if err != nil {
				return err
			}
			normalized.ID, normalized.CreatedAt = id, now
			book.Ledgers = append(book.Ledgers, normalized)
			return nil
		}
		if index < 0 {
			return errors.New("장부를 찾지 못했습니다. 화면을 다시 열어 주세요")
		}
		for _, entry := range book.Entries {
			if entry.LedgerID == normalized.ID && !containsString(normalized.Categories, entry.Category) {
				return errors.New("내역에서 쓰는 항목 ‘" + entry.Category + "’은 지울 수 없습니다")
			}
		}
		normalized.CreatedAt = book.Ledgers[index].CreatedAt
		book.Ledgers[index] = normalized
		return nil
	})
	return normalized, err
}

func containsString(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// DeleteBudgetLedger는 확인 문구를 받은 뒤 장부와 그 내역·영수증을 모두 지웁니다.
func (s *VaultStore) DeleteBudgetLedger(id, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if confirmation != "장부 삭제" {
		return errors.New("확인 문구를 정확히 입력해 주세요")
	}
	var removed []budget.Receipt
	err := s.changeBudgetLocked(func(book *budget.Book) error {
		index := ledgerIndex(book, id)
		if index < 0 {
			return errors.New("장부를 찾지 못했습니다")
		}
		book.Ledgers = append(book.Ledgers[:index], book.Ledgers[index+1:]...)
		kept := []budget.Entry{}
		for _, entry := range book.Entries {
			if entry.LedgerID == id {
				removed = append(removed, entry.Receipts...)
				continue
			}
			kept = append(kept, entry)
		}
		book.Entries = kept
		return nil
	})
	if err == nil {
		s.removeReceiptFiles(removed)
	}
	return err
}

// SaveBudgetEntry는 내역을 만들거나 고칩니다. 영수증 목록은 보관함 값을 유지합니다.
func (s *VaultStore) SaveBudgetEntry(entry BudgetEntry) (BudgetEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var saved budget.Entry
	err := s.changeBudgetLocked(func(book *budget.Book) error {
		li := ledgerIndex(book, entry.LedgerID)
		if li < 0 {
			return errors.New("장부를 먼저 골라 주세요")
		}
		normalized, err := budget.NormalizeEntry(entry, book.Ledgers[li])
		if err != nil {
			return err
		}
		now := nowLocal()
		normalized.UpdatedAt = now
		if normalized.ID == "" {
			if len(book.Entries) >= budget.MaxEntries {
				return errors.New("내역은 5000개까지 둘 수 있습니다")
			}
			id, err := newStudentID()
			if err != nil {
				return err
			}
			normalized.ID, normalized.CreatedAt, normalized.Receipts = id, now, []budget.Receipt{}
			book.Entries = append(book.Entries, normalized)
			saved = normalized
			return nil
		}
		index := entryIndex(book, normalized.ID)
		if index < 0 {
			return errors.New("내역을 찾지 못했습니다. 화면을 다시 열어 주세요")
		}
		normalized.CreatedAt, normalized.Receipts = book.Entries[index].CreatedAt, book.Entries[index].Receipts
		book.Entries[index] = normalized
		saved = normalized
		return nil
	})
	return saved, err
}

// DeleteBudgetEntry는 내역과 그 영수증을 지웁니다.
func (s *VaultStore) DeleteBudgetEntry(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	var removed []budget.Receipt
	err := s.changeBudgetLocked(func(book *budget.Book) error {
		index := entryIndex(book, id)
		if index < 0 {
			return errors.New("내역을 찾지 못했습니다")
		}
		removed = book.Entries[index].Receipts
		book.Entries = append(book.Entries[:index], book.Entries[index+1:]...)
		return nil
	})
	if err == nil {
		s.removeReceiptFiles(removed)
	}
	return err
}
