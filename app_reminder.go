package main

import (
	"errors"
	"strconv"
	"sync"
	"time"

	"TeacherNote/internal/background"
	"TeacherNote/internal/reminder"
	"TeacherNote/internal/vault"
)

// 미리 알림 실행기: 30초마다 울릴 알림을 찾아 Windows 알림과 프로그램 안 '확인할 알림' 목록에 넣는다.
// 보관함이 잠기면 알림 제목을 메모리에서 지우고, 잠긴 동안에는 늘 보호 문구로만 알린다.

// toaster는 운영체제 알림을 보낸다(서버 모드·테스트는 가짜).
type toaster interface {
	Send(id, title, body string) error
}

// ReminderInboxItem은 프로그램 안 '확인할 알림' 한 줄이다.
type ReminderInboxItem struct {
	Key     string `json:"key"`
	Kind    string `json:"kind"`
	RefID   string `json:"refId"`
	Title   string `json:"title"`
	At      string `json:"at"`
	EventAt string `json:"eventAt"`
	Missed  bool   `json:"missed"`
	Quiet   bool   `json:"quiet"`
}

const maxInbox = 30

type reminderRunner struct {
	mu          sync.Mutex
	vault       *vault.VaultStore
	toast       toaster
	settings    func() background.Settings
	now         func() time.Time
	cache       []reminder.Entry
	sessionSent map[string]bool
	pendingSent []string
	snoozed     []reminder.Entry
	inbox       []ReminderInboxItem
}

func newReminderRunner(store *vault.VaultStore, settings func() background.Settings) *reminderRunner {
	return &reminderRunner{vault: store, settings: settings, now: time.Now, sessionSent: map[string]bool{}}
}

func (r *reminderRunner) loop(stop <-chan struct{}) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			r.Tick()
		}
	}
}

// Tick은 알림 시각이 된 항목을 처리한다.
func (r *reminderRunner) Tick() {
	s := r.settings()
	if !s.NotifyEnabled {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	unlocked := r.vault.IsUnlocked()
	sent := map[string]bool{}
	for key := range r.sessionSent {
		sent[key] = true
	}
	entries := r.cache
	if unlocked {
		if len(r.pendingSent) > 0 && r.vault.MarkRemindersSent(r.pendingSent, now) == nil {
			r.pendingSent = nil
		}
		if stored, err := r.vault.SentReminderKeys(); err == nil {
			for key := range stored {
				sent[key] = true
			}
		}
		events, _ := r.vault.GetScheduleBook()
		items, _ := r.vault.GetMemoBook()
		entries = append(reminder.Build(events.Events, items.Items, now, 24*time.Hour), r.snoozed...)
		r.cache = entries
		r.fillInboxTitles(entries)
	}
	due, missed := reminder.Due(entries, sent, now)
	if len(due)+len(missed) == 0 {
		return
	}
	quiet := s.InQuiet(now)
	keys := []string{}
	for _, entry := range missed {
		r.addInbox(entry, true, false)
		keys = append(keys, entry.Key)
	}
	for _, entry := range due {
		r.addInbox(entry, false, quiet)
		keys = append(keys, entry.Key)
		if !quiet && r.toast != nil {
			title, body := reminder.ToastText(entry, s.NotifyDetail == background.DetailTitle, !unlocked, now)
			_ = r.toast.Send(entry.Key, title, body)
		}
	}
	for _, key := range keys {
		r.sessionSent[key] = true
	}
	r.dropSnoozed(keys)
	if unlocked {
		if r.vault.MarkRemindersSent(keys, now) != nil {
			r.pendingSent = append(r.pendingSent, keys...)
		}
	} else {
		r.pendingSent = append(r.pendingSent, keys...)
	}
	notifyChange(eventReminderChanged, "울림", "")
}

func (r *reminderRunner) addInbox(entry reminder.Entry, missed, quiet bool) {
	item := ReminderInboxItem{Key: entry.Key, Kind: entry.Kind, RefID: entry.RefID, Title: entry.Title, At: entry.At.Format(time.RFC3339), EventAt: entry.EventAt.Format(time.RFC3339), Missed: missed, Quiet: quiet}
	r.inbox = append([]ReminderInboxItem{item}, r.inbox...)
	if len(r.inbox) > maxInbox {
		r.inbox = r.inbox[:maxInbox]
	}
}

func (r *reminderRunner) fillInboxTitles(entries []reminder.Entry) {
	titles := map[string]string{}
	for _, entry := range entries {
		titles[entry.RefID] = entry.Title
	}
	for i := range r.inbox {
		if r.inbox[i].Title == "" {
			r.inbox[i].Title = titles[r.inbox[i].RefID]
		}
	}
}

func (r *reminderRunner) dropSnoozed(keys []string) {
	fired := map[string]bool{}
	for _, key := range keys {
		fired[key] = true
	}
	kept := r.snoozed[:0]
	for _, entry := range r.snoozed {
		if !fired[entry.Key] {
			kept = append(kept, entry)
		}
	}
	r.snoozed = kept
}

// OnLock은 잠금 때 메모리의 알림 제목을 지운다(시각과 내부 번호만 남김).
func (r *reminderRunner) OnLock() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.cache {
		r.cache[i].Title = ""
	}
	for i := range r.snoozed {
		r.snoozed[i].Title = ""
	}
	for i := range r.inbox {
		r.inbox[i].Title = ""
	}
}

func (r *reminderRunner) Inbox() []ReminderInboxItem {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]ReminderInboxItem{}, r.inbox...)
}

func (r *reminderRunner) Dismiss(key string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	kept := []ReminderInboxItem{}
	for _, item := range r.inbox {
		if key != "" && item.Key != key {
			kept = append(kept, item)
		}
	}
	r.inbox = kept
}

// Snooze는 알림을 목록에서 빼고 minutes분 뒤에 다시 울리게 한다.
func (r *reminderRunner) Snooze(key string, minutes int) error {
	if minutes < 1 || minutes > 120 {
		return errors.New("다시 알림은 1~120분 사이로 골라 주세요")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, item := range r.inbox {
		if item.Key != key {
			continue
		}
		eventAt, _ := time.Parse(time.RFC3339, item.EventAt)
		at := r.now().Add(time.Duration(minutes) * time.Minute)
		r.snoozed = append(r.snoozed, reminder.Entry{Key: key + ":다시:" + strconv.FormatInt(at.Unix(), 10), Kind: item.Kind, RefID: item.RefID, Title: item.Title, At: at, EventAt: eventAt})
		r.inbox = append(r.inbox[:i], r.inbox[i+1:]...)
		return nil
	}
	return errors.New("알림을 찾지 못했습니다")
}
