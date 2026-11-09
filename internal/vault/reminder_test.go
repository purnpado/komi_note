package vault

import (
	"fmt"
	"testing"
	"time"
)

func TestReminderSent보관과오래된번호정리(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	now := time.Date(2026, 11, 9, 14, 0, 0, 0, time.Local)
	old := fmt.Sprintf("일정:a:30:%d", now.Add(-96*time.Hour).Unix())
	recent := fmt.Sprintf("일정:b:30:%d", now.Add(-time.Hour).Unix())
	if err := store.MarkRemindersSent([]string{old, recent, recent}, now); err != nil {
		t.Fatal(err)
	}
	sent, _ := store.SentReminderKeys()
	if len(sent) != 1 || !sent[recent] {
		t.Fatalf("3일 지난 번호는 버리고 겹침 없이: %v", sent)
	}
	store.Lock()
	if _, err := store.SentReminderKeys(); err == nil || store.IsUnlocked() {
		t.Fatal("잠긴 보관함은 읽을 수 없음")
	}
}
