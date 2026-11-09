package vault

import "testing"

func TestSchedule저장고치기삭제(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveScheduleEvent(ScheduleEvent{Title: "학부모 총회", StartDate: "2026-11-20", AllDay: true, CreatedAt: "화면"})
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == "" || saved.CreatedAt == "화면" {
		t.Fatalf("번호·만든 시각은 보관함이: %+v", saved)
	}
	early, _ := store.SaveScheduleEvent(ScheduleEvent{Title: "회의", StartDate: "2026-11-18", StartTime: "15:00"})
	edited, err := store.SaveScheduleEvent(ScheduleEvent{ID: saved.ID, Title: "학부모 총회(강당)", StartDate: "2026-11-20", AllDay: true})
	if err != nil || edited.CreatedAt != saved.CreatedAt {
		t.Fatalf("고쳐도 만든 시각 유지: %+v %v", edited, err)
	}
	if _, err := store.SaveScheduleEvent(ScheduleEvent{ID: "없음", Title: "x", StartDate: "2026-11-20", AllDay: true}); err == nil {
		t.Fatal("없는 일정 고치기는 거부")
	}
	book, _ := store.GetScheduleBook()
	if len(book.Events) != 2 || book.Events[0].ID != early.ID {
		t.Fatalf("날짜 순: %+v", book.Events)
	}
	if err := store.DeleteScheduleEvent(early.ID); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteScheduleEvent(early.ID); err == nil {
		t.Fatal("두 번 지우기는 오류")
	}
	book, _ = store.GetScheduleBook()
	if len(book.Events) != 1 {
		t.Fatalf("하나 남아야: %+v", book.Events)
	}
}
