package timetable

import (
	"strings"
	"testing"
)

func fixedID() func() (string, error) {
	count := 0
	return func() (string, error) {
		count++
		return "id" + string(rune('0'+count)), nil
	}
}

func TestComputePeriodsWithLunch(t *testing.T) {
	periods, err := ComputePeriods(BellRule{FirstStart: "8:40", LessonMinutes: 45, BreakMinutes: 10, LunchAfter: 4, LunchMinutes: 50, PeriodCount: 7})
	if err != nil {
		t.Fatal(err)
	}
	want := []Period{
		{1, "08:40", "09:25"}, {2, "09:35", "10:20"}, {3, "10:30", "11:15"}, {4, "11:25", "12:10"},
		{5, "13:00", "13:45"}, {6, "13:55", "14:40"}, {7, "14:50", "15:35"},
	}
	if len(periods) != len(want) {
		t.Fatalf("교시 수 %d", len(periods))
	}
	for index := range want {
		if periods[index] != want[index] {
			t.Fatalf("%d교시: %+v, 기대 %+v", index+1, periods[index], want[index])
		}
	}
}

func TestComputePeriodsRejectsBadRule(t *testing.T) {
	cases := []BellRule{
		{FirstStart: "아홉시", LessonMinutes: 45, PeriodCount: 7},
		{FirstStart: "09:00", LessonMinutes: 45, PeriodCount: 0},
		{FirstStart: "09:00", LessonMinutes: 5, PeriodCount: 7},
		{FirstStart: "09:00", LessonMinutes: 45, PeriodCount: 7, LunchAfter: 7, LunchMinutes: 50},
		{FirstStart: "09:00", LessonMinutes: 45, PeriodCount: 7, LunchAfter: 4, LunchMinutes: 0},
		{FirstStart: "22:00", LessonMinutes: 120, PeriodCount: 3},
	}
	for index, rule := range cases {
		if _, err := ComputePeriods(rule); err == nil {
			t.Fatalf("%d번 규칙은 거부해야 합니다: %+v", index, rule)
		}
	}
}

func baseBook() Book {
	periods, _ := ComputePeriods(BellRule{FirstStart: "09:00", LessonMinutes: 45, BreakMinutes: 10, LunchAfter: 4, LunchMinutes: 50, PeriodCount: 7})
	return Book{Periods: periods, ActiveSchoolYear: "2026", ActiveSemester: "2"}
}

func TestNormaliseCleansCellsAndSorts(t *testing.T) {
	book := baseBook()
	book.Timetables = []Timetable{{
		ID: "엉뚱한값", Kind: KindTeacher, SchoolYear: "2026", Semester: "2",
		Cells: []Cell{
			{Day: 3, Period: 2, Subject: "  과학 ", ClassName: " 2-3 "},
			{Day: 1, Period: 5, Subject: "과학", ClassName: "2-1", CourseRosterID: "r1"},
			{Day: 2, Period: 1},
		},
	}}
	got, err := Normalise(book, fixedID())
	if err != nil {
		t.Fatal(err)
	}
	table := got.Timetables[0]
	if table.ID != "teacher-2026-2" {
		t.Fatalf("식별값 %q", table.ID)
	}
	if len(table.Cells) != 2 || table.Cells[0].Day != 1 || table.Cells[1].Subject != "과학" || table.Cells[1].ClassName != "2-3" {
		t.Fatalf("칸 정리 결과 %+v", table.Cells)
	}
}

func TestNormaliseRejectsInvalidInput(t *testing.T) {
	cases := map[string]func(*Book){
		"요일": func(b *Book) {
			b.Timetables = []Timetable{{Kind: KindTeacher, SchoolYear: "2026", Semester: "1", Cells: []Cell{{Day: 6, Period: 1, Subject: "국어"}}}}
		},
		"교시 설정에 없습니다": func(b *Book) {
			b.Timetables = []Timetable{{Kind: KindTeacher, SchoolYear: "2026", Semester: "1", Cells: []Cell{{Day: 1, Period: 8, Subject: "국어"}}}}
		},
		"두 수업": func(b *Book) {
			b.Timetables = []Timetable{{Kind: KindClass, SchoolYear: "2026", Semester: "1", Cells: []Cell{{Day: 1, Period: 1, Subject: "국어"}, {Day: 1, Period: 1, Subject: "수학"}}}}
		},
		"두 번": func(b *Book) {
			b.Timetables = []Timetable{{Kind: KindClass, SchoolYear: "2026", Semester: "1"}, {Kind: KindClass, SchoolYear: "2026", Semester: "1"}}
		},
		"시간표 종류": func(b *Book) { b.Timetables = []Timetable{{Kind: "기타", SchoolYear: "2026", Semester: "1"}} },
		"겹칩니다": func(b *Book) { b.Periods[1].Start = "09:30" },
		"날짜":    func(b *Book) { b.Changes = []Change{{Date: "2026-13-01", Period: 1, Kind: "결강"}} },
		"과목이나 반": func(b *Book) {
			b.Changes = []Change{{Date: "2026-11-09", Period: 1, Kind: "보강"}}
		},
		"이미 있습니다": func(b *Book) {
			b.Changes = []Change{{Date: "2026-11-09", Period: 1, Kind: "결강"}, {Date: "2026-11-09", Period: 1, Kind: "보강", Subject: "과학"}}
		},
	}
	for want, edit := range cases {
		book := baseBook()
		edit(&book)
		if _, err := Normalise(book, fixedID()); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%q 오류를 기대했지만 %v", want, err)
		}
	}
}

func TestNormaliseRequiresPeriodsBeforeCells(t *testing.T) {
	book := Book{Timetables: []Timetable{{Kind: KindTeacher, SchoolYear: "2026", Semester: "1", Cells: []Cell{{Day: 1, Period: 1, Subject: "국어"}}}}}
	if _, err := Normalise(book, fixedID()); err == nil || !strings.Contains(err.Error(), "교시 시간") {
		t.Fatalf("교시 설정 안내를 기대했지만 %v", err)
	}
}

func TestNormaliseChangesGetIDsAndSort(t *testing.T) {
	book := baseBook()
	book.Changes = []Change{
		{Date: "2026-11-10", Period: 3, Kind: "교체", Subject: "과학", ClassName: "2-1"},
		{ID: "keep", Date: "2026-11-09", Period: 2, Kind: "결강", Target: "엉뚱"},
	}
	got, err := Normalise(book, fixedID())
	if err != nil {
		t.Fatal(err)
	}
	if got.Changes[0].ID != "keep" || got.Changes[0].Target != KindTeacher || got.Changes[1].ID == "" {
		t.Fatalf("변경 정리 결과 %+v", got.Changes)
	}
}

func TestNormaliseClipsLongText(t *testing.T) {
	book := baseBook()
	book.Timetables = []Timetable{{Kind: KindTeacher, SchoolYear: "2026", Semester: "1", Cells: []Cell{{Day: 1, Period: 1, Subject: strings.Repeat("가", 100), Note: strings.Repeat("나", 500)}}}}
	got, err := Normalise(book, fixedID())
	if err != nil {
		t.Fatal(err)
	}
	cell := got.Timetables[0].Cells[0]
	if len([]rune(cell.Subject)) != maxShortText || len([]rune(cell.Note)) != maxNoteText {
		t.Fatalf("글자 수 제한 실패: %d, %d", len([]rune(cell.Subject)), len([]rune(cell.Note)))
	}
}
