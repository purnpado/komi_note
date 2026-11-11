package attendance

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestReasonCategoriesMatchScreenList(t *testing.T) {
	source, err := os.ReadFile("../../frontend/src/features/attendance/attendanceReasonState.ts")
	if err != nil {
		t.Fatal(err)
	}
	match := regexp.MustCompile(`REASON_CATEGORIES = \[([^\]]*)\]`).FindSubmatch(source)
	if match == nil {
		t.Fatal("화면 사유 목록을 찾지 못했습니다")
	}
	screen := []string{}
	for _, item := range regexp.MustCompile(`"([^"]+)"`).FindAllSubmatch(match[1], -1) {
		screen = append(screen, string(item[1]))
	}
	if strings.Join(screen, ",") != strings.Join(AttendanceReasonCategoryList, ",") {
		t.Fatalf("화면 %v, Go %v", screen, AttendanceReasonCategoryList)
	}
}

func TestNormaliseReasonCategory(t *testing.T) {
	cases := map[string]string{" 인정 ": "출석인정", "출석인정": "출석인정", "질병": "질병", "직접 입력": "직접 입력", "": ""}
	for input, want := range cases {
		if got := NormaliseReasonCategory(input); got != want {
			t.Fatalf("%q → %q, want %q", input, got, want)
		}
	}
	if AttendanceReasonCategories["인정"] {
		t.Fatal("'인정'은 더 이상 그대로 받지 않고 '출석인정'으로 바꿔야 합니다")
	}
	if !AttendanceReasonCategories[LegacyCustomReasonCategory] {
		t.Fatal("예전 '직접 입력' 기록은 다시 저장해도 받아야 합니다")
	}
}

func TestUpgradeLegacyReasonCategories(t *testing.T) {
	days := []AttendanceDay{{Date: "2026-04-01", Entries: []AttendanceEntry{
		{StudentID: "a", Status: "결석", ReasonCategory: "인정"},
		{StudentID: "b", Status: "결석", ReasonCategory: "직접 입력"},
	}}}
	UpgradeLegacyReasonCategories(days)
	if days[0].Entries[0].ReasonCategory != "출석인정" || days[0].Entries[1].ReasonCategory != "직접 입력" {
		t.Fatalf("got %+v", days[0].Entries)
	}
	if !SameAttendanceDocumentGroup(days[0].Entries[0], AttendanceEntry{Status: "결석", ReasonCategory: "출석인정"}) {
		t.Fatal("바꾼 뒤에는 '출석인정' 기록과 같은 서류 기간으로 묶여야 합니다")
	}
	if got := AttendanceMarkTokens(AttendanceEntry{Status: "결석", ReasonCategory: "인정"})["출석인정표시"]; got != "○" {
		t.Fatalf("출석인정표시 %q", got)
	}
}
