// Package budget는 학급·동아리·부서 예산 장부의 규칙(검사·합계)을 담는다. 저장은 internal/vault/budget.go가 맡는다.
package budget

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MaxLedgers         = 50
	MaxEntries         = 5000
	MaxReceiptsPer     = 3
	maxAmount          = 1_000_000_000
	maxPlanned         = 10_000_000_000
	maxName            = 40
	maxTitle           = 60
	maxNote            = 500
	maxCategories      = 20
	maxCategoryLength  = 20
	TypeExpense        = "지출"
	TypeIncome         = "수입"
	DefaultCategoryEtc = "기타"
)

// DefaultCategories는 새 장부의 항목이다(교사가 고칠 수 있음).
var DefaultCategories = []string{"물품", "간식", "행사", "인쇄", "교통", "기타"}

// Payments는 결제 방법이다.
var Payments = []string{"카드", "현금", "계좌이체", "기타"}

// Ledger는 장부 하나(예: 2026학년도 학급 운영비)다.
type Ledger struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	SchoolYear string   `json:"schoolYear"`
	Planned    int64    `json:"planned"`
	Categories []string `json:"categories"`
	Note       string   `json:"note,omitempty"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
}

// Receipt는 영수증 사진 정보다(사진은 암호화 파일로 따로 둔다).
type Receipt struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	MIME string `json:"mime"`
	Size int    `json:"size"`
}

// Entry는 수입·지출 내역 한 줄이다.
type Entry struct {
	ID        string    `json:"id"`
	LedgerID  string    `json:"ledgerId"`
	Date      string    `json:"date"`
	Type      string    `json:"type"`
	Category  string    `json:"category"`
	Title     string    `json:"title"`
	Amount    int64     `json:"amount"`
	Payment   string    `json:"payment"`
	Note      string    `json:"note,omitempty"`
	Receipts  []Receipt `json:"receipts"`
	CreatedAt string    `json:"createdAt"`
	UpdatedAt string    `json:"updatedAt"`
}

// Book은 장부와 내역 전체다.
type Book struct {
	Ledgers []Ledger `json:"ledgers"`
	Entries []Entry  `json:"entries"`
}

// Summary는 장부 합계다. Remaining = 편성 + 수입 - 지출.
type Summary struct {
	Planned    int64            `json:"planned"`
	Income     int64            `json:"income"`
	Expense    int64            `json:"expense"`
	Remaining  int64            `json:"remaining"`
	ByCategory map[string]int64 `json:"byCategory"`
	Count      int              `json:"count"`
}

func runeLen(value string) int { return utf8.RuneCountInString(value) }

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// NormalizeLedger는 장부를 검사하고 다듬는다.
func NormalizeLedger(ledger Ledger) (Ledger, error) {
	ledger.Name = strings.TrimSpace(ledger.Name)
	ledger.Note = strings.TrimSpace(ledger.Note)
	if ledger.Name == "" {
		return Ledger{}, errors.New("장부 이름을 입력해 주세요")
	}
	if runeLen(ledger.Name) > maxName {
		return Ledger{}, fmt.Errorf("장부 이름은 %d자까지 쓸 수 있습니다", maxName)
	}
	if len(ledger.SchoolYear) != 4 || strings.Trim(ledger.SchoolYear, "0123456789") != "" {
		return Ledger{}, errors.New("학년도를 네 자리 숫자로 입력해 주세요")
	}
	if ledger.Planned < 0 || ledger.Planned > maxPlanned {
		return Ledger{}, errors.New("편성 예산을 확인해 주세요")
	}
	if runeLen(ledger.Note) > maxNote {
		return Ledger{}, fmt.Errorf("메모는 %d자까지 쓸 수 있습니다", maxNote)
	}
	categories := []string{}
	for _, raw := range ledger.Categories {
		category := strings.TrimSpace(raw)
		if category == "" || contains(categories, category) {
			continue
		}
		if runeLen(category) > maxCategoryLength {
			return Ledger{}, fmt.Errorf("항목 이름은 %d자까지 쓸 수 있습니다", maxCategoryLength)
		}
		categories = append(categories, category)
	}
	if len(categories) == 0 {
		categories = append([]string{}, DefaultCategories...)
	}
	if !contains(categories, DefaultCategoryEtc) {
		categories = append(categories, DefaultCategoryEtc)
	}
	if len(categories) > maxCategories {
		return Ledger{}, fmt.Errorf("항목은 %d개까지 만들 수 있습니다", maxCategories)
	}
	ledger.Categories = categories
	return ledger, nil
}

// NormalizeEntry는 내역을 장부에 맞춰 검사한다. 영수증 정보는 저장 쪽이 관리한다.
func NormalizeEntry(entry Entry, ledger Ledger) (Entry, error) {
	entry.Title = strings.TrimSpace(entry.Title)
	entry.Note = strings.TrimSpace(entry.Note)
	if _, err := time.Parse("2006-01-02", entry.Date); err != nil {
		return Entry{}, errors.New("날짜를 확인해 주세요")
	}
	if entry.Type != TypeIncome {
		entry.Type = TypeExpense
	}
	if entry.Title == "" {
		return Entry{}, errors.New("내용을 입력해 주세요")
	}
	if runeLen(entry.Title) > maxTitle {
		return Entry{}, fmt.Errorf("내용은 %d자까지 쓸 수 있습니다", maxTitle)
	}
	if entry.Amount <= 0 || entry.Amount > maxAmount {
		return Entry{}, errors.New("금액을 1원 이상 10억 원 이하로 입력해 주세요")
	}
	if entry.Category == "" {
		entry.Category = DefaultCategoryEtc
	}
	if !contains(ledger.Categories, entry.Category) {
		return Entry{}, errors.New("이 장부에 없는 항목입니다. 항목을 다시 골라 주세요")
	}
	if entry.Payment == "" {
		entry.Payment = "카드"
	}
	if !contains(Payments, entry.Payment) {
		return Entry{}, errors.New("결제 방법을 다시 골라 주세요")
	}
	if runeLen(entry.Note) > maxNote {
		return Entry{}, fmt.Errorf("메모는 %d자까지 쓸 수 있습니다", maxNote)
	}
	entry.LedgerID = ledger.ID
	return entry, nil
}

// Summarize는 장부의 수입·지출·남은 금액과 항목별 지출을 계산한다.
func Summarize(ledger Ledger, entries []Entry) Summary {
	summary := Summary{Planned: ledger.Planned, ByCategory: map[string]int64{}}
	for _, entry := range entries {
		if entry.LedgerID != ledger.ID {
			continue
		}
		summary.Count++
		if entry.Type == TypeIncome {
			summary.Income += entry.Amount
		} else {
			summary.Expense += entry.Amount
			summary.ByCategory[entry.Category] += entry.Amount
		}
	}
	summary.Remaining = summary.Planned + summary.Income - summary.Expense
	return summary
}
