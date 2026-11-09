package main

import (
	"strings"
	"testing"
)

func Test예산바인딩알림과CSV(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	ledger, err := app.SaveBudgetLedger(BudgetLedger{Name: "학급 운영비", SchoolYear: "2026", Planned: 100000})
	if err != nil {
		t.Fatal(err)
	}
	entry, err := app.SaveBudgetEntry(BudgetEntry{LedgerID: ledger.ID, Date: "2026-11-09", Category: "간식", Title: "=간식", Amount: 30000})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveBudgetEntry(BudgetEntry{LedgerID: ledger.ID}); err == nil {
		t.Fatal("빈 내역은 오류")
	}
	app.DeleteBudgetEntry("없음", ledger.ID)
	got := sent()
	if len(got) != 2 || got[0].Name != "budget:변경" || got[1].Notice.ID != ledger.ID {
		t.Fatalf("성공 때만, 장부 번호로 알림: %+v", got)
	}
	book, _ := app.GetBudgetBook()
	name, data, err := budgetCSV(book, ledger.ID)
	text := string(data)
	if err != nil || !strings.HasPrefix(text, "\ufeff날짜") || !strings.Contains(text, "'=간식") || !strings.Contains(text, "남은 금액,70000") || name != "2026-학급 운영비-집행내역.csv" {
		t.Fatalf("CSV: %s %q %v", name, text, err)
	}
	_ = entry
}
