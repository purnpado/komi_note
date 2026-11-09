package schedule

import (
	"strings"
	"testing"
)

func TestNormalize일정다듬기(t *testing.T) {
	got, err := Normalize(Event{Title: " 학부모 총회 ", StartDate: "2026-11-20", AllDay: true, StartTime: "10:00", Reminders: []int{60, 1440, 60}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "학부모 총회" || got.EndDate != "2026-11-20" || got.StartTime != "" || got.Category != "기타" {
		t.Fatalf("종일 일정 다듬기: %+v", got)
	}
	if len(got.Reminders) != 2 || got.Reminders[0] != 1440 {
		t.Fatalf("알림은 겹침 없이 먼 것부터: %v", got.Reminders)
	}
	timed, err := Normalize(Event{Title: "회의", StartDate: "2026-11-20", StartTime: "15:30", EndTime: "16:30", Category: "회의"})
	if err != nil || timed.Reminders == nil {
		t.Fatalf("시각 일정: %+v %v", timed, err)
	}
	start, ok := StartsAt(timed)
	if !ok || start.Format("15:04") != "15:30" {
		t.Fatalf("시작 시각 %v", start)
	}
	allDay, _ := StartsAt(got)
	if allDay.Format("15:04") != "08:00" {
		t.Fatalf("종일 일정 알림 기준은 오전 8시: %v", allDay)
	}
}

func TestNormalize잘못된일정을막는다(t *testing.T) {
	bad := map[string]Event{
		"제목 없음":   {StartDate: "2026-11-20", AllDay: true},
		"긴 제목":    {Title: strings.Repeat("가", 101), StartDate: "2026-11-20", AllDay: true},
		"날짜 없음":   {Title: "a", AllDay: true},
		"끝이 앞섬":   {Title: "a", StartDate: "2026-11-20", EndDate: "2026-11-19", AllDay: true},
		"너무 김":    {Title: "a", StartDate: "2026-01-01", EndDate: "2026-04-01", AllDay: true},
		"시각 없음":   {Title: "a", StartDate: "2026-11-20"},
		"끝 시각 앞섬": {Title: "a", StartDate: "2026-11-20", StartTime: "10:00", EndTime: "09:00"},
		"모르는 분류":  {Title: "a", StartDate: "2026-11-20", AllDay: true, Category: "운동"},
		"모르는 알림":  {Title: "a", StartDate: "2026-11-20", AllDay: true, Reminders: []int{5}},
		"긴 메모":    {Title: "a", StartDate: "2026-11-20", AllDay: true, Note: strings.Repeat("가", 2001)},
	}
	for name, event := range bad {
		if _, err := Normalize(event); err == nil {
			t.Errorf("%s: 오류여야 합니다", name)
		}
	}
	if _, err := Normalize(Event{Title: "1박 2일", StartDate: "2026-11-20", EndDate: "2026-11-21", StartTime: "18:00", EndTime: "09:00"}); err != nil {
		t.Fatalf("여러 날이면 끝 시각이 더 일러도 됩니다: %v", err)
	}
}
