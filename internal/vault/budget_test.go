package vault

import (
	"encoding/base64"
	"os"
	"strings"
	"testing"

	"TeacherNote/internal/budget"
)

// 1x1 PNG
var tinyPNG, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")

func budgetStore(t *testing.T) (*VaultStore, BudgetLedger, BudgetEntry) {
	t.Helper()
	store := newTestVault(t, t.TempDir())
	ledger, err := store.SaveBudgetLedger(BudgetLedger{Name: "학급 운영비", SchoolYear: "2026", Planned: 500000})
	if err != nil {
		t.Fatal(err)
	}
	entry, err := store.SaveBudgetEntry(BudgetEntry{LedgerID: ledger.ID, Date: "2026-11-09", Category: "간식", Title: "간식", Amount: 30000, Receipts: []budget.Receipt{{ID: "화면값"}}})
	if err != nil {
		t.Fatal(err)
	}
	return store, ledger, entry
}

func TestBudget장부와내역(t *testing.T) {
	store, ledger, entry := budgetStore(t)
	if len(entry.Receipts) != 0 {
		t.Fatal("화면이 보낸 영수증 목록은 무시")
	}
	if _, err := store.SaveBudgetEntry(BudgetEntry{LedgerID: "없음", Date: "2026-11-09", Title: "x", Amount: 1}); err == nil {
		t.Fatal("없는 장부는 거부")
	}
	if _, err := store.SaveBudgetLedger(BudgetLedger{ID: ledger.ID, Name: "학급 운영비", SchoolYear: "2026", Categories: []string{"물품"}}); err == nil || !strings.Contains(err.Error(), "간식") {
		t.Fatalf("쓰는 항목은 지울 수 없음: %v", err)
	}
	edited, err := store.SaveBudgetEntry(BudgetEntry{ID: entry.ID, LedgerID: ledger.ID, Date: "2026-11-10", Category: "물품", Title: "물품", Amount: 12000})
	if err != nil || edited.CreatedAt != entry.CreatedAt {
		t.Fatalf("고치기: %+v %v", edited, err)
	}
	book, _ := store.GetBudgetBook()
	if len(book.Ledgers) != 1 || len(book.Entries) != 1 || book.Entries[0].Amount != 12000 {
		t.Fatalf("읽기: %+v", book)
	}
	if err := store.DeleteBudgetLedger(ledger.ID, "삭제"); err == nil {
		t.Fatal("확인 문구 필요")
	}
	if err := store.DeleteBudgetLedger(ledger.ID, "장부 삭제"); err != nil {
		t.Fatal(err)
	}
	book, _ = store.GetBudgetBook()
	if len(book.Ledgers)+len(book.Entries) != 0 {
		t.Fatalf("장부와 내역 모두 지움: %+v", book)
	}
}

func TestBudget영수증암호화저장과삭제(t *testing.T) {
	store, ledger, entry := budgetStore(t)
	data := base64.StdEncoding.EncodeToString(tinyPNG)
	withReceipt, err := store.AddBudgetReceipt(entry.ID, "../../영수증.png", data)
	if err != nil {
		t.Fatal(err)
	}
	receipt := withReceipt.Receipts[0]
	if receipt.Name != "영수증.png" || receipt.MIME != "image/png" {
		t.Fatalf("영수증 정보: %+v", receipt)
	}
	raw, _ := os.ReadFile(store.receiptPath(receipt.ID))
	if strings.Contains(string(raw), "iVBOR") || len(raw) == 0 {
		t.Fatal("파일은 암호화되어야 합니다")
	}
	url, err := store.GetBudgetReceipt(entry.ID, receipt.ID)
	if err != nil || !strings.HasPrefix(url, "data:image/png;base64,") {
		t.Fatalf("열기: %v", err)
	}
	other, _ := store.SaveBudgetEntry(BudgetEntry{LedgerID: ledger.ID, Date: "2026-11-09", Title: "다른", Amount: 1})
	otherWith, _ := store.AddBudgetReceipt(other.ID, "b.png", data)
	// 다른 내역의 영수증 파일로 바꿔 끼우면 열리지 않는다
	swapped, _ := os.ReadFile(store.receiptPath(otherWith.Receipts[0].ID))
	os.WriteFile(store.receiptPath(receipt.ID), swapped, 0o600)
	if _, err := store.GetBudgetReceipt(entry.ID, receipt.ID); err == nil {
		t.Fatal("바꿔 끼운 파일은 열리면 안 됩니다")
	}
	if _, err := store.AddBudgetReceipt(entry.ID, "x.txt", base64.StdEncoding.EncodeToString([]byte("hello"))); err == nil {
		t.Fatal("사진이 아니면 거부")
	}
	store.AddBudgetReceipt(entry.ID, "2.png", data)
	store.AddBudgetReceipt(entry.ID, "3.png", data)
	if _, err := store.AddBudgetReceipt(entry.ID, "4.png", data); err == nil {
		t.Fatal("내역마다 3장까지")
	}
	if _, err := store.DeleteBudgetReceipt(entry.ID, receipt.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(store.receiptPath(receipt.ID)); !os.IsNotExist(err) {
		t.Fatal("영수증 파일도 지워야 합니다")
	}
	book, _ := store.GetBudgetBook()
	var remaining []string
	for _, e := range book.Entries {
		for _, r := range e.Receipts {
			remaining = append(remaining, r.ID)
		}
	}
	store.DeleteBudgetEntry(entry.ID)
	store.DeleteBudgetEntry(other.ID)
	for _, id := range remaining {
		if _, err := os.Stat(store.receiptPath(id)); !os.IsNotExist(err) {
			t.Fatal("내역을 지우면 영수증 파일도 지움")
		}
	}
}
