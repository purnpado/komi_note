package vault

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"TeacherNote/internal/budget"
)

// 영수증 사진: 학생 사진과 같은 방식으로 data\receipts\ 아래 암호화 파일로 둔다.
// 암호문을 내역 번호·영수증 번호에 묶어, 다른 내역의 파일로 바꿔 끼우면 열리지 않는다.
// 학생 사진처럼 암호화 백업(.kkomi-backup)에는 들어가지 않는다.

const maxReceiptSize = 5 << 20

type receiptPayload struct {
	MIME string `json:"mime"`
	Data string `json:"data"`
}

func receiptAAD(entryID, receiptID string) string { return "budget-receipt-v1:" + entryID + ":" + receiptID }

func (s *VaultStore) receiptPath(receiptID string) string {
	return filepath.Join(filepath.Dir(s.filePath), "receipts", receiptID+".receipt")
}

func (s *VaultStore) removeReceiptFiles(receipts []budget.Receipt) {
	for _, receipt := range receipts {
		_ = os.Remove(s.receiptPath(receipt.ID))
	}
}

// AddBudgetReceipt는 화면이 보낸 사진(base64)을 검사해 암호화 저장하고 내역에 붙입니다.
func (s *VaultStore) AddBudgetReceipt(entryID, fileName, dataBase64 string) (BudgetEntry, error) {
	contents, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return BudgetEntry{}, errors.New("사진 파일을 읽지 못했습니다")
	}
	defer zeroBytes(contents)
	if len(contents) == 0 || len(contents) > maxReceiptSize {
		return BudgetEntry{}, errors.New("영수증 사진은 5MB 이하만 붙일 수 있습니다")
	}
	mime := http.DetectContentType(contents)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		return BudgetEntry{}, errors.New("JPG, PNG, WEBP 사진만 붙일 수 있습니다")
	}
	name := strings.TrimSpace(filepath.Base(fileName))
	if name == "" || name == "." {
		name = "영수증"
	}
	if utf8.RuneCountInString(name) > 60 {
		name = string([]rune(name)[:60])
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return BudgetEntry{}, errors.New("먼저 보관함을 열어 주세요")
	}
	receiptID, err := newStudentID()
	if err != nil {
		return BudgetEntry{}, err
	}
	var saved budget.Entry
	err = s.changeBudgetLocked(func(book *budget.Book) error {
		index := entryIndex(book, entryID)
		if index < 0 {
			return errors.New("내역을 먼저 저장해 주세요")
		}
		if len(book.Entries[index].Receipts) >= budget.MaxReceiptsPer {
			return errors.New("영수증은 내역마다 3장까지 붙일 수 있습니다")
		}
		payload, err := json.Marshal(receiptPayload{MIME: mime, Data: base64.StdEncoding.EncodeToString(contents)})
		if err != nil {
			return errors.New("사진 저장을 준비하지 못했습니다")
		}
		defer zeroBytes(payload)
		encrypted, err := seal(s.sessionKey, payload, receiptAAD(entryID, receiptID))
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(s.receiptPath(receiptID)), 0o700); err != nil {
			return err
		}
		if err := writeJSONSecure(s.receiptPath(receiptID), encrypted); err != nil {
			return errors.New("영수증 사진을 저장하지 못했습니다")
		}
		book.Entries[index].Receipts = append(book.Entries[index].Receipts, budget.Receipt{ID: receiptID, Name: name, MIME: mime, Size: len(contents)})
		book.Entries[index].UpdatedAt = nowLocal()
		saved = book.Entries[index]
		return nil
	})
	if err != nil {
		_ = os.Remove(s.receiptPath(receiptID))
	}
	return saved, err
}

func (s *VaultStore) findReceiptLocked(entryID, receiptID string) bool {
	if s.session == nil || s.session.Budget == nil {
		return false
	}
	for _, entry := range s.session.Budget.Entries {
		if entry.ID != entryID {
			continue
		}
		for _, receipt := range entry.Receipts {
			if receipt.ID == receiptID {
				return true
			}
		}
	}
	return false
}

// GetBudgetReceipt는 영수증 사진을 data URL로 돌려줍니다.
func (s *VaultStore) GetBudgetReceipt(entryID, receiptID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return "", errors.New("먼저 보관함을 열어 주세요")
	}
	if !s.findReceiptLocked(entryID, receiptID) {
		return "", errors.New("영수증을 찾지 못했습니다")
	}
	var encrypted encryptedBlob
	if err := readJSON(s.receiptPath(receiptID), &encrypted); err != nil {
		return "", errors.New("영수증 사진 파일이 없습니다. data 폴더를 함께 옮겼는지 확인해 주세요")
	}
	payload, err := open(s.sessionKey, encrypted, receiptAAD(entryID, receiptID))
	if err != nil {
		return "", errors.New("영수증 사진을 열지 못했습니다")
	}
	defer zeroBytes(payload)
	var photo receiptPayload
	if err := json.Unmarshal(payload, &photo); err != nil {
		return "", errors.New("영수증 사진을 열지 못했습니다")
	}
	return "data:" + photo.MIME + ";base64," + photo.Data, nil
}

// DeleteBudgetReceipt는 영수증 하나를 지웁니다.
func (s *VaultStore) DeleteBudgetReceipt(entryID, receiptID string) (BudgetEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var saved budget.Entry
	err := s.changeBudgetLocked(func(book *budget.Book) error {
		index := entryIndex(book, entryID)
		if index < 0 {
			return errors.New("내역을 찾지 못했습니다")
		}
		kept := []budget.Receipt{}
		for _, receipt := range book.Entries[index].Receipts {
			if receipt.ID != receiptID {
				kept = append(kept, receipt)
			}
		}
		if len(kept) == len(book.Entries[index].Receipts) {
			return errors.New("영수증을 찾지 못했습니다")
		}
		book.Entries[index].Receipts = kept
		book.Entries[index].UpdatedAt = nowLocal()
		saved = book.Entries[index]
		return nil
	})
	if err == nil {
		_ = os.Remove(s.receiptPath(receiptID))
	}
	return saved, err
}
