package main

import "testing"

func Test일정과시간표저장은변경알림을보낸다(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	if _, err := app.SaveScheduleEvent(ScheduleEvent{Title: ""}); err == nil {
		t.Fatal("제목 없는 일정은 오류")
	}
	saved, err := app.SaveScheduleEvent(ScheduleEvent{Title: "체육대회", StartDate: "2026-11-20", AllDay: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteScheduleEvent(saved.ID); err != nil {
		t.Fatal(err)
	}
	book, _ := app.GetTimetableBook()
	if _, err := app.SaveTimetableBook(book); err != nil {
		t.Fatal(err)
	}
	got := sent()
	if len(got) != 3 || got[0] != (sentChange{Name: "schedule:변경", Notice: ChangeNotice{Kind: "추가", ID: saved.ID}}) || got[1].Notice.Kind != "삭제" || got[2].Name != "timetable:변경" {
		t.Fatalf("알림: %+v", got)
	}
}
