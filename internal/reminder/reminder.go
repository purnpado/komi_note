// Package reminder는 일정·할 일 미리 알림의 시각 계산과 알림 문구 규칙을 담는다(순수 계산, 화면·운영체제 호출 없음).
package reminder

import (
	"fmt"
	"strings"
	"time"

	"TeacherNote/internal/memo"
	"TeacherNote/internal/schedule"
)

// MissedAfter보다 늦게 확인된 알림은 운영체제 알림을 띄우지 않고 프로그램 안 목록에만 남긴다(꺼져 있던 동안 지난 알림).
const MissedAfter = 15 * time.Minute

// Entry는 울릴 알림 하나다. Key에는 대상 번호·시점·시각이 들어 있어, 일정 시각을 바꾸면 새 알림이 된다.
type Entry struct {
	Key     string    `json:"key"`
	Kind    string    `json:"kind"`
	RefID   string    `json:"refId"`
	Title   string    `json:"title"`
	At      time.Time `json:"at"`
	EventAt time.Time `json:"eventAt"`
}

func key(kind, id string, offset int, at time.Time) string {
	return fmt.Sprintf("%s:%s:%d:%d", kind, id, offset, at.Unix())
}

// Build는 일정의 미리 알림과 할 일·메모의 알림 시각으로 앞으로(또는 window 안에서 막 지난) 울릴 알림을 만든다.
func Build(events []schedule.Event, items []memo.Item, now time.Time, window time.Duration) []Entry {
	from, to := now.Add(-window), now.Add(48*time.Hour)
	result := []Entry{}
	for _, event := range events {
		start, ok := schedule.StartsAt(event)
		if !ok {
			continue
		}
		for _, offset := range event.Reminders {
			at := start.Add(-time.Duration(offset) * time.Minute)
			if at.After(from) && !at.After(to) {
				result = append(result, Entry{Key: key("일정", event.ID, offset, at), Kind: "일정", RefID: event.ID, Title: event.Title, At: at, EventAt: start})
			}
		}
	}
	for _, item := range items {
		if item.RemindAt == "" || item.Archived || item.Done {
			continue
		}
		at, err := time.ParseInLocation("2006-01-02T15:04", item.RemindAt, time.Local)
		if err != nil || !at.After(from) || at.After(to) {
			continue
		}
		title := item.Title
		if title == "" {
			title = firstLine(item.Body)
		}
		result = append(result, Entry{Key: key(item.Kind, item.ID, 0, at), Kind: item.Kind, RefID: item.ID, Title: title, At: at, EventAt: at})
	}
	return result
}

func firstLine(text string) string {
	line := strings.TrimSpace(strings.SplitN(text, "\n", 2)[0])
	if r := []rune(line); len(r) > 30 {
		return string(r[:30]) + "…"
	}
	return line
}

// Due는 아직 보내지 않았고 시각이 된 알림을 고른다. missed는 MissedAfter보다 오래 지난 것(운영체제 알림 없이 목록에만).
func Due(entries []Entry, sent map[string]bool, now time.Time) (due []Entry, missed []Entry) {
	for _, entry := range entries {
		if sent[entry.Key] || entry.At.After(now) {
			continue
		}
		if now.Sub(entry.At) > MissedAfter {
			missed = append(missed, entry)
		} else {
			due = append(due, entry)
		}
	}
	return due, missed
}

// Relative는 일정까지 남은 시간을 "1일 후", "3시간 후", "30분 후", "지금"처럼 쓴다.
func Relative(eventAt, now time.Time) string {
	d := eventAt.Sub(now)
	switch {
	case d < time.Minute:
		return "지금"
	case d < time.Hour:
		return fmt.Sprintf("%d분 후", int(d.Round(time.Minute).Minutes()))
	case d < 24*time.Hour:
		hours := int(d.Round(time.Hour).Hours())
		if hours >= 24 {
			return "1일 후"
		}
		return fmt.Sprintf("%d시간 후", hours)
	default:
		return fmt.Sprintf("%d일 후", int(d.Round(time.Hour).Hours()/24+0.5))
	}
}

// ToastText는 운영체제 알림 제목·내용이다. 보관함이 잠겼거나 보호 표시면 내용을 숨긴다.
func ToastText(entry Entry, showTitle, locked bool, now time.Time) (string, string) {
	if locked || !showTitle || entry.Title == "" {
		return "꼬미노트", "확인할 알림이 있습니다. 꼬미노트를 열어 확인해 주세요."
	}
	if entry.Kind == "일정" {
		return "꼬미노트 일정 · " + Relative(entry.EventAt, now), entry.Title
	}
	return "꼬미노트 " + entry.Kind, entry.Title
}
