package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"TeacherNote/internal/timetable"
)

func sampleTimetable(t *testing.T) TimetableBook {
	t.Helper()
	periods, err := timetable.ComputePeriods(timetable.BellRule{FirstStart: "09:00", LessonMinutes: 45, BreakMinutes: 10, LunchAfter: 4, LunchMinutes: 50, PeriodCount: 7})
	if err != nil {
		t.Fatal(err)
	}
	return TimetableBook{
		Rule:             timetable.BellRule{FirstStart: "09:00", LessonMinutes: 45, BreakMinutes: 10, LunchAfter: 4, LunchMinutes: 50, PeriodCount: 7},
		Periods:          periods,
		ActiveSchoolYear: "2026",
		ActiveSemester:   "2",
		Timetables: []timetable.Timetable{
			{Kind: timetable.KindTeacher, SchoolYear: "2026", Semester: "2", Cells: []timetable.Cell{{Day: 1, Period: 2, Subject: "과학", ClassName: "2-3"}}},
			{Kind: timetable.KindClass, SchoolYear: "2026", Semester: "2", Cells: []timetable.Cell{{Day: 1, Period: 1, Subject: "국어"}}},
		},
		Changes: []timetable.Change{{Date: "2026-11-09", Period: 3, Kind: "보강", Subject: "과학", ClassName: "2-1"}},
	}
}

func TestTimetableEmptyForOldVault(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	book, err := store.GetTimetableBook()
	if err != nil {
		t.Fatal(err)
	}
	if book.ActiveSchoolYear != "2026" || (book.ActiveSemester != "1" && book.ActiveSemester != "2") || len(book.Timetables) != 0 || book.UpdatedAt != "" {
		t.Fatalf("빈 시간표 기본값 %+v", book)
	}
}

func TestTimetableSaveReopenAndConflict(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	saved, err := store.SaveTimetableBook(sampleTimetable(t))
	if err != nil {
		t.Fatal(err)
	}
	if saved.UpdatedAt == "" || saved.Changes[0].ID == "" || saved.Timetables[0].ID != "class-2026-2" {
		t.Fatalf("저장 결과 %+v", saved)
	}

	// 예전 화면이 읽은 값(updatedAt 비어 있음)으로 다시 저장하면 덮어쓰지 않는다.
	if _, err := store.SaveTimetableBook(sampleTimetable(t)); err == nil || !strings.Contains(err.Error(), "먼저 바뀌었습니다") {
		t.Fatalf("동시 수정 거부를 기대했지만 %v", err)
	}

	// 디스크 파일에는 평문 과목명이 남지 않는다.
	raw, err := os.ReadFile(store.filePath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "과학") || strings.Contains(string(raw), "timetable") {
		t.Fatal("시간표가 암호화되지 않은 채 저장되었습니다")
	}

	reopened := &VaultStore{filePath: store.filePath}
	if _, err := reopened.Unlock(testMaster); err != nil {
		t.Fatal(err)
	}
	book, err := reopened.GetTimetableBook()
	if err != nil {
		t.Fatal(err)
	}
	if book.UpdatedAt != saved.UpdatedAt || len(book.Timetables) != 2 || book.Timetables[1].Cells[0].Subject != "과학" || len(book.Changes) != 1 {
		t.Fatalf("다시 연 시간표 %+v", book)
	}

	// 받은 값을 고쳐 저장하면 성공하고, 돌려준 값을 고쳐도 보관함 안의 값은 바뀌지 않는다.
	book.Timetables[1].Cells = append(book.Timetables[1].Cells, timetable.Cell{Day: 2, Period: 5, Subject: "과학", ClassName: "2-4"})
	next, err := reopened.SaveTimetableBook(book)
	if err != nil {
		t.Fatal(err)
	}
	next.Timetables[1].Cells[0].Subject = "바뀜"
	again, _ := reopened.GetTimetableBook()
	if again.Timetables[1].Cells[0].Subject != "과학" || len(again.Timetables[1].Cells) != 2 {
		t.Fatalf("복사본 분리 실패 %+v", again.Timetables[1].Cells)
	}
}

func TestTimetableRejectsInvalidWithoutChangingVault(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveTimetableBook(sampleTimetable(t))
	if err != nil {
		t.Fatal(err)
	}
	bad := saved
	bad.Timetables = append([]timetable.Timetable(nil), saved.Timetables...)
	bad.Timetables[0].Cells = []timetable.Cell{{Day: 1, Period: 9, Subject: "국어"}}
	if _, err := store.SaveTimetableBook(bad); err == nil {
		t.Fatal("없는 교시는 거부해야 합니다")
	}
	current, _ := store.GetTimetableBook()
	if current.UpdatedAt != saved.UpdatedAt || current.Timetables[0].Cells[0].Period != 1 {
		t.Fatalf("거부 뒤 보관함이 바뀌었습니다 %+v", current)
	}
}

func TestTimetableIncludedInBackup(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	if _, err := store.SaveTimetableBook(sampleTimetable(t)); err != nil {
		t.Fatal(err)
	}
	backupPath := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatal(err)
	}
	_, _, data, err := readBackupWithPassword(backupPath, testMaster)
	if err != nil {
		t.Fatal(err)
	}
	if data.Timetable == nil || len(data.Timetable.Timetables) != 2 {
		t.Fatalf("백업에 시간표가 없습니다 %+v", data.Timetable)
	}
}

func TestDefaultSemester(t *testing.T) {
	cases := []struct {
		date, config, year, semester string
	}{
		{"2026-03-02", "", "2026", "1"},
		{"2026-09-01", "", "2026", "2"},
		{"2027-01-15", "", "2026", "2"},
		{"2026-11-08", "2026", "2026", "2"},
	}
	for _, item := range cases {
		now, _ := time.Parse("2006-01-02", item.date)
		year, semester := defaultSemester(now, item.config)
		if year != item.year || semester != item.semester {
			t.Fatalf("%s: %s-%s, 기대 %s-%s", item.date, year, semester, item.year, item.semester)
		}
	}
}
