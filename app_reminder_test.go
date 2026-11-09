package main

import (
	"strings"
	"testing"
	"time"

	"TeacherNote/internal/background"
)

type fakeToaster struct{ sent []string }

func (f *fakeToaster) Send(id, title, body string) error {
	f.sent = append(f.sent, title+"|"+body)
	return nil
}

func reminderTestApp(t *testing.T, settings background.Settings) (*App, *fakeToaster, *time.Time) {
	t.Helper()
	app := newUnlockedTestApp(t)
	toast := &fakeToaster{}
	now := time.Date(2026, 11, 9, 14, 0, 0, 0, time.Local)
	app.reminders = newReminderRunner(app.vault, func() background.Settings { return settings })
	app.reminders.toast = toast
	app.reminders.now = func() time.Time { return now }
	return app, toast, &now
}

func TestReminder켜야만울리고한번만울린다(t *testing.T) {
	app, toast, now := reminderTestApp(t, background.Settings{NotifyEnabled: true, NotifyDetail: background.DetailTitle})
	captureChanges(t)
	app.SaveScheduleEvent(ScheduleEvent{Title: "3반 상담", StartDate: "2026-11-09", StartTime: "14:30", Reminders: []int{30}})
	app.reminders.Tick()
	if len(toast.sent) != 1 || toast.sent[0] != "꼬미노트 일정 · 30분 후|3반 상담" {
		t.Fatalf("제목 표시 알림: %v", toast.sent)
	}
	*now = now.Add(time.Minute)
	app.reminders.Tick()
	if len(toast.sent) != 1 {
		t.Fatalf("같은 알림은 한 번만: %v", toast.sent)
	}
	inbox, _ := app.GetReminderInbox()
	if len(inbox) != 1 || inbox[0].Title != "3반 상담" {
		t.Fatalf("확인할 알림 목록: %+v", inbox)
	}
	// 새 실행기(프로그램 다시 켬)도 보관함 기록으로 다시 울리지 않는다
	again := newReminderRunner(app.vault, app.reminders.settings)
	again.toast, again.now = toast, app.reminders.now
	again.Tick()
	if len(toast.sent) != 1 {
		t.Fatalf("다시 켜도 중복 없음: %v", toast.sent)
	}
	off, offToast, _ := reminderTestApp(t, background.Settings{NotifyEnabled: false})
	off.SaveScheduleEvent(ScheduleEvent{Title: "x", StartDate: "2026-11-09", StartTime: "14:30", Reminders: []int{30}})
	off.reminders.Tick()
	if len(offToast.sent) != 0 {
		t.Fatal("알림을 끄면 울리지 않음")
	}
}

func TestReminder잠기면내용을숨긴다(t *testing.T) {
	app, toast, now := reminderTestApp(t, background.Settings{NotifyEnabled: true, NotifyDetail: background.DetailTitle})
	captureChanges(t)
	app.SaveScheduleEvent(ScheduleEvent{Title: "학부모 면담 김가온", StartDate: "2026-11-09", StartTime: "14:40", Reminders: []int{30}})
	app.reminders.Tick() // 14:00 아직 아님, 목록만 기억
	app.LockVault()
	for _, entry := range app.reminders.cache {
		if entry.Title != "" {
			t.Fatal("잠그면 메모리의 제목을 지워야 합니다")
		}
	}
	*now = now.Add(10 * time.Minute)
	app.reminders.Tick()
	if len(toast.sent) != 1 || strings.Contains(toast.sent[0], "김가온") || !strings.Contains(toast.sent[0], "확인할 알림") {
		t.Fatalf("잠긴 동안은 보호 문구: %v", toast.sent)
	}
	if _, err := app.GetReminderInbox(); err == nil {
		t.Fatal("잠긴 동안 목록은 볼 수 없음")
	}
}

func TestReminder조용한시간지난알림다시알림(t *testing.T) {
	app, toast, now := reminderTestApp(t, background.Settings{NotifyEnabled: true, QuietEnabled: true, QuietStart: "13:00", QuietEnd: "15:00"})
	captureChanges(t)
	app.SaveScheduleEvent(ScheduleEvent{Title: "조용한 시간 일정", StartDate: "2026-11-09", StartTime: "14:10", Reminders: []int{10}})
	app.SaveScheduleEvent(ScheduleEvent{Title: "지난 일정", StartDate: "2026-11-09", StartTime: "14:00", Reminders: []int{60}})
	app.reminders.Tick()
	inbox, _ := app.GetReminderInbox()
	if len(toast.sent) != 0 || len(inbox) != 2 {
		t.Fatalf("조용한 시간·지난 알림은 목록에만: %v %+v", toast.sent, inbox)
	}
	missed := 0
	for _, item := range inbox {
		if item.Missed {
			missed++
		}
	}
	if missed != 1 {
		t.Fatalf("지난 알림 표시: %+v", inbox)
	}
	if err := app.SnoozeReminder(inbox[0].Key, 10); err != nil {
		t.Fatal(err)
	}
	app.reminders.settings = func() background.Settings { return background.Settings{NotifyEnabled: true} }
	*now = now.Add(10 * time.Minute)
	app.reminders.Tick()
	if len(toast.sent) != 1 {
		t.Fatalf("다시 알림은 10분 뒤 울림: %v", toast.sent)
	}
	app.DismissReminder("")
	if inbox, _ := app.GetReminderInbox(); len(inbox) != 0 {
		t.Fatalf("모두 확인: %+v", inbox)
	}
	if err := app.SnoozeReminder("없음", 10); err == nil {
		t.Fatal("없는 알림 다시 알림은 오류")
	}
}
