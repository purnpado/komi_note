// Package schedule은 프로그램 안 교사 일정의 규칙(검사·정리)을 담는다. 저장은 internal/vault/schedule.go가 맡는다.
// 구글 캘린더 연동은 아직 없다(별도 승인 뒤 계획).
package schedule

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MaxEvents = 3000
	maxTitle  = 100
	maxPlace  = 100
	maxNote   = 2000
	maxSpan   = 60 // 여러 날 일정은 60일까지
)

// Categories는 일정 분류다.
var Categories = []string{"학교 행사", "회의", "상담", "수행평가", "출장·연수", "개인", "기타"}

// ReminderChoices는 고를 수 있는 알림 시점(분 전)이다: 1일·3시간·1시간·30분·10분 전.
var ReminderChoices = []int{1440, 180, 60, 30, 10}

// Event는 일정 하나다. 종일 일정은 시각이 없다.
type Event struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	StartDate string `json:"startDate"`
	EndDate   string `json:"endDate"`
	AllDay    bool   `json:"allDay"`
	StartTime string `json:"startTime,omitempty"`
	EndTime   string `json:"endTime,omitempty"`
	Category  string `json:"category"`
	Place     string `json:"place,omitempty"`
	Note      string `json:"note,omitempty"`
	Reminders []int  `json:"reminders"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// Book은 일정 전체다.
type Book struct {
	Events []Event `json:"events"`
}

func tooLong(value string, limit int) bool { return utf8.RuneCountInString(value) > limit }

func parseDate(value string) (time.Time, bool) {
	t, err := time.ParseInLocation("2006-01-02", value, time.Local)
	return t, err == nil
}

func validClock(value string) bool {
	_, err := time.Parse("15:04", value)
	return err == nil
}

// Normalize는 화면이 보낸 일정을 검사하고 다듬는다.
func Normalize(event Event) (Event, error) {
	event.Title = strings.TrimSpace(event.Title)
	event.Place = strings.TrimSpace(event.Place)
	event.Note = strings.TrimRight(event.Note, " \t\r\n")
	if event.Title == "" {
		return Event{}, errors.New("일정 제목을 입력해 주세요")
	}
	if tooLong(event.Title, maxTitle) {
		return Event{}, fmt.Errorf("제목은 %d자까지 쓸 수 있습니다", maxTitle)
	}
	if tooLong(event.Place, maxPlace) {
		return Event{}, fmt.Errorf("장소는 %d자까지 쓸 수 있습니다", maxPlace)
	}
	if tooLong(event.Note, maxNote) {
		return Event{}, fmt.Errorf("메모는 %d자까지 쓸 수 있습니다", maxNote)
	}
	start, ok := parseDate(event.StartDate)
	if !ok {
		return Event{}, errors.New("시작 날짜를 확인해 주세요")
	}
	if event.EndDate == "" {
		event.EndDate = event.StartDate
	}
	end, ok := parseDate(event.EndDate)
	if !ok {
		return Event{}, errors.New("끝 날짜를 확인해 주세요")
	}
	if end.Before(start) {
		return Event{}, errors.New("끝 날짜가 시작 날짜보다 앞설 수 없습니다")
	}
	if end.Sub(start) > maxSpan*24*time.Hour {
		return Event{}, fmt.Errorf("여러 날 일정은 %d일까지 만들 수 있습니다", maxSpan)
	}
	if event.AllDay {
		event.StartTime, event.EndTime = "", ""
	} else {
		if !validClock(event.StartTime) {
			return Event{}, errors.New("시작 시각을 확인해 주세요")
		}
		if event.EndTime != "" {
			if !validClock(event.EndTime) {
				return Event{}, errors.New("끝 시각을 확인해 주세요")
			}
			if event.EndDate == event.StartDate && event.EndTime < event.StartTime {
				return Event{}, errors.New("끝 시각이 시작 시각보다 앞설 수 없습니다")
			}
		}
	}
	if event.Category == "" {
		event.Category = "기타"
	}
	if !contains(Categories, event.Category) {
		return Event{}, errors.New("일정 분류를 다시 골라 주세요")
	}
	reminders, err := normalizeReminders(event.Reminders)
	if err != nil {
		return Event{}, err
	}
	event.Reminders = reminders
	return event, nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

func normalizeReminders(values []int) ([]int, error) {
	seen := map[int]bool{}
	result := []int{}
	for _, value := range values {
		allowed := false
		for _, choice := range ReminderChoices {
			if choice == value {
				allowed = true
			}
		}
		if !allowed {
			return nil, errors.New("알림 시점을 다시 골라 주세요")
		}
		if !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(result)))
	return result, nil
}

// StartsAt은 일정이 시작하는 시각이다. 종일 일정은 그날 오전 8시로 본다(알림 기준).
func StartsAt(event Event) (time.Time, bool) {
	clock := event.StartTime
	if event.AllDay || clock == "" {
		clock = "08:00"
	}
	t, err := time.ParseInLocation("2006-01-02 15:04", event.StartDate+" "+clock, time.Local)
	return t, err == nil
}
