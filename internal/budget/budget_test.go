package budget

import (
	"strings"
	"testing"
)

func TestNormalizeLedger(t *testing.T) {
	got, err := NormalizeLedger(Ledger{Name: " 학급 운영비 ", SchoolYear: "2026", Planned: 500000, Categories: []string{"간식", " 간식", "", "물품"}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "학급 운영비" || strings.Join(got.Categories, ",") != "간식,물품,기타" {
		t.Fatalf("다듬기·기타 항목 자동 추가: %+v", got)
	}
	empty, _ := NormalizeLedger(Ledger{Name: "동아리", SchoolYear: "2026"})
	if len(empty.Categories) != len(DefaultCategories) {
		t.Fatalf("항목이 없으면 기본 항목: %v", empty.Categories)
	}
	for name, bad := range map[string]Ledger{
		"이름 없음": {SchoolYear: "2026"}, "학년도": {Name: "a", SchoolYear: "26"}, "음수 예산": {Name: "a", SchoolYear: "2026", Planned: -1},
		"긴 항목": {Name: "a", SchoolYear: "2026", Categories: []string{strings.Repeat("가", 21)}},
	} {
		if _, err := NormalizeLedger(bad); err == nil {
			t.Errorf("%s: 오류여야 합니다", name)
		}
	}
}

func TestNormalizeEntry와합계(t *testing.T) {
	ledger, _ := NormalizeLedger(Ledger{ID: "L", Name: "학급", SchoolYear: "2026", Planned: 500000})
	entry, err := NormalizeEntry(Entry{Date: "2026-11-09", Type: "아무거나", Category: "간식", Title: " 간식 구입 ", Amount: 32000, LedgerID: "다른"}, ledger)
	if err != nil {
		t.Fatal(err)
	}
	if entry.Type != TypeExpense || entry.Title != "간식 구입" || entry.Payment != "카드" || entry.LedgerID != "L" {
		t.Fatalf("기본값: %+v", entry)
	}
	for name, bad := range map[string]Entry{
		"날짜": {Date: "2026-13-01", Title: "a", Amount: 1}, "내용 없음": {Date: "2026-11-09", Amount: 1}, "금액 0": {Date: "2026-11-09", Title: "a"},
		"없는 항목": {Date: "2026-11-09", Title: "a", Amount: 1, Category: "주유"}, "결제 방법": {Date: "2026-11-09", Title: "a", Amount: 1, Payment: "외상"},
	} {
		if _, err := NormalizeEntry(bad, ledger); err == nil {
			t.Errorf("%s: 오류여야 합니다", name)
		}
	}
	summary := Summarize(ledger, []Entry{
		{LedgerID: "L", Type: TypeExpense, Category: "간식", Amount: 32000},
		{LedgerID: "L", Type: TypeExpense, Category: "물품", Amount: 18000},
		{LedgerID: "L", Type: TypeIncome, Amount: 10000},
		{LedgerID: "다른", Type: TypeExpense, Amount: 99999},
	})
	if summary.Expense != 50000 || summary.Income != 10000 || summary.Remaining != 460000 || summary.ByCategory["간식"] != 32000 || summary.Count != 3 {
		t.Fatalf("합계: %+v", summary)
	}
}
