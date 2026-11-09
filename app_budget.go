package main

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	"os"
	"strings"

	"TeacherNote/internal/budget"
	"TeacherNote/internal/vault"
)

// 예산 관리 바인딩. 저장에 성공하면 budget:변경 알림(종류·장부 번호만)을 보냅니다.

type BudgetLedger = vault.BudgetLedger
type BudgetEntry = vault.BudgetEntry
type BudgetBook = vault.BudgetBook

func ledgerOf(entry BudgetEntry) string { return entry.LedgerID }

// GetBudgetBook은 장부와 내역 전체를 돌려줍니다.
func (a *App) GetBudgetBook() (BudgetBook, error) { return a.vault.GetBudgetBook() }

// SaveBudgetLedger는 장부를 만들거나 고칩니다.
func (a *App) SaveBudgetLedger(ledger BudgetLedger) (BudgetLedger, error) {
	kind := changeUpdated
	if ledger.ID == "" {
		kind = changeAdded
	}
	saved, err := a.vault.SaveBudgetLedger(ledger)
	return notifyAfter(eventBudgetChanged, kind, func(v BudgetLedger) string { return v.ID }, saved, err)
}

// DeleteBudgetLedger는 확인 문구("장부 삭제")를 받은 뒤 장부와 내역·영수증을 지웁니다.
func (a *App) DeleteBudgetLedger(id, confirmation string) error {
	if err := a.vault.DeleteBudgetLedger(id, confirmation); err != nil {
		return err
	}
	notifyChange(eventBudgetChanged, changeDeleted, id)
	return nil
}

// SaveBudgetEntry는 수입·지출 내역을 만들거나 고칩니다.
func (a *App) SaveBudgetEntry(entry BudgetEntry) (BudgetEntry, error) {
	kind := changeUpdated
	if entry.ID == "" {
		kind = changeAdded
	}
	saved, err := a.vault.SaveBudgetEntry(entry)
	return notifyAfter(eventBudgetChanged, kind, ledgerOf, saved, err)
}

// DeleteBudgetEntry는 내역과 영수증을 지웁니다.
func (a *App) DeleteBudgetEntry(id, ledgerID string) error {
	if err := a.vault.DeleteBudgetEntry(id); err != nil {
		return err
	}
	notifyChange(eventBudgetChanged, changeDeleted, ledgerID)
	return nil
}

// AddBudgetReceipt는 영수증 사진(화면에서 고른 파일의 base64)을 암호화해 붙입니다.
func (a *App) AddBudgetReceipt(entryID, fileName, dataBase64 string) (BudgetEntry, error) {
	saved, err := a.vault.AddBudgetReceipt(entryID, fileName, dataBase64)
	return notifyAfter(eventBudgetChanged, changeUpdated, ledgerOf, saved, err)
}

// GetBudgetReceipt는 영수증 사진을 보여 줄 data URL을 돌려줍니다.
func (a *App) GetBudgetReceipt(entryID, receiptID string) (string, error) {
	return a.vault.GetBudgetReceipt(entryID, receiptID)
}

// DeleteBudgetReceipt는 영수증 하나를 지웁니다.
func (a *App) DeleteBudgetReceipt(entryID, receiptID string) (BudgetEntry, error) {
	saved, err := a.vault.DeleteBudgetReceipt(entryID, receiptID)
	return notifyAfter(eventBudgetChanged, changeUpdated, ledgerOf, saved, err)
}

// budgetCSV는 장부 내역을 엑셀에서 한글이 깨지지 않는 CSV(UTF-8 BOM)로 만든다.
func budgetCSV(book BudgetBook, ledgerID string) (string, []byte, error) {
	var ledger *budget.Ledger
	for i := range book.Ledgers {
		if book.Ledgers[i].ID == ledgerID {
			ledger = &book.Ledgers[i]
		}
	}
	if ledger == nil {
		return "", nil, errors.New("장부를 찾지 못했습니다")
	}
	var buffer bytes.Buffer
	buffer.WriteString("\ufeff")
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"날짜", "구분", "항목", "내용", "금액", "결제 방법", "영수증", "메모"})
	for _, entry := range book.Entries {
		if entry.LedgerID != ledgerID {
			continue
		}
		receipt := ""
		if len(entry.Receipts) > 0 {
			receipt = fmt.Sprintf("%d장", len(entry.Receipts))
		}
		_ = writer.Write([]string{entry.Date, entry.Type, entry.Category, csvSafe(entry.Title), fmt.Sprint(entry.Amount), entry.Payment, receipt, csvSafe(entry.Note)})
	}
	summary := budget.Summarize(*ledger, book.Entries)
	_ = writer.Write([]string{})
	_ = writer.Write([]string{"편성", fmt.Sprint(summary.Planned), "수입", fmt.Sprint(summary.Income), "지출", fmt.Sprint(summary.Expense), "남은 금액", fmt.Sprint(summary.Remaining)})
	writer.Flush()
	return ledger.SchoolYear + "-" + ledger.Name + "-집행내역.csv", buffer.Bytes(), writer.Error()
}

// csvSafe는 엑셀이 수식으로 읽지 않게 =,+,-,@로 시작하는 칸 앞에 '를 붙인다.
func csvSafe(value string) string {
	if value != "" && strings.ContainsRune("=+-@", rune(value[0])) {
		return "'" + value
	}
	return value
}

// ExportBudgetCSV는 장부 집행 내역을 CSV 파일로 저장합니다(파일은 암호화되지 않습니다).
func (a *App) ExportBudgetCSV(ledgerID string) (string, error) {
	book, err := a.vault.GetBudgetBook()
	if err != nil {
		return "", err
	}
	name, data, err := budgetCSV(book, ledgerID)
	if err != nil {
		return "", err
	}
	path, err := a.saveFileDialog("집행 내역 CSV 저장", name, "CSV 파일", "*.csv")
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return "", errors.New("CSV 파일을 저장하지 못했습니다")
	}
	return path, nil
}
