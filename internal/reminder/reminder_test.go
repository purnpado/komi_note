package reminder

import (
	"strings"
	"testing"
	"time"

	"TeacherNote/internal/memo"
	"TeacherNote/internal/schedule"
)

func at(value string) time.Time {
	t, _ := time.ParseInLocation("2006-01-02 15:04", value, time.Local)
	return t
}

func TestBuild일정과할일알림(t *testing.T) {
	now := at("2026-11-09 14:00")
	events := []schedule.Event{
		{ID: "e1", Title: "협의회", StartDate: "2026-11-09", StartTime: "15:00", Reminders: []int{60, 30}},
		// 체육대회 알림(오늘 08:00)은 한참 지나 범위 밖
		{ID: "e2", Title: "체육대회", StartDate: "2026-11-10", AllDay: true, Reminders: []int{1440}},
		{ID: "e3", Title: "먼 일정", StartDate: "2026-12-01", AllDay: true, Reminders: []int{1440}},
	}
	items := []memo.Item{
		{ID: "m1", Kind: "할 일", Title: "회신 걷기", RemindAt: "2026-11-09T16:00"},
		{ID: "m2", Kind: "할 일", Title: "끝낸 일", RemindAt: "2026-11-09T16:00", Done: true},
		{ID: "m3", Kind: "메모", Body: "첫 줄\n둘째 줄", RemindAt: "2026-11-09T13:55"},
	}
	entries := Build(events, items, now, time.Hour)
	titles := []string{}
	for _, e := range entries {
		titles = append(titles, e.Title+"@"+e.At.Format("01-02 15:04"))
	}
	got := strings.Join(titles, ",")
	want := "협의회@11-09 14:00,협의회@11-09 14:30,회신 걷기@11-09 16:00,첫 줄@11-09 13:55"
	if got != want {
		t.Fatalf("\n얻음 %s\n기대 %s", got, want)
	}
	moved := Build([]schedule.Event{{ID: "e1", Title: "협의회", StartDate: "2026-11-09", StartTime: "15:10", Reminders: []int{30}}}, nil, now, time.Hour)
	if moved[0].Key == entries[1].Key {
		t.Fatal("시각을 바꾸면 새 알림 번호")
	}
}

func TestDue는보낸것을빼고오래지난것을나눈다(t *testing.T) {
	now := at("2026-11-09 14:00")
	entries := []Entry{
		{Key: "a", At: at("2026-11-09 13:55")},
		{Key: "b", At: at("2026-11-09 13:00")},
		{Key: "c", At: at("2026-11-09 13:58")},
		{Key: "d", At: at("2026-11-09 14:05")},
	}
	due, missed := Due(entries, map[string]bool{"c": true}, now)
	if len(due) != 1 || due[0].Key != "a" || len(missed) != 1 || missed[0].Key != "b" {
		t.Fatalf("due %+v missed %+v", due, missed)
	}
}

func TestRelative와알림문구(t *testing.T) {
	now := at("2026-11-09 14:00")
	cases := map[string]string{"2026-11-09 14:00": "지금", "2026-11-09 14:30": "30분 후", "2026-11-09 17:00": "3시간 후", "2026-11-10 14:00": "1일 후", "2026-11-12 14:00": "3일 후"}
	for value, want := range cases {
		if got := Relative(at(value), now); got != want {
			t.Errorf("%s: %s (기대 %s)", value, got, want)
		}
	}
	entry := Entry{Kind: "일정", Title: "3반 상담", EventAt: at("2026-11-09 14:30")}
	if title, body := ToastText(entry, true, false, now); title != "꼬미노트 일정 · 30분 후" || body != "3반 상담" {
		t.Fatalf("제목 표시: %s / %s", title, body)
	}
	for _, c := range []struct{ show, locked bool }{{false, false}, {true, true}} {
		_, body := ToastText(entry, c.show, c.locked, now)
		if strings.Contains(body, "상담") {
			t.Fatalf("보호 표시·잠금이면 내용을 숨겨야 합니다: %s", body)
		}
	}
}
