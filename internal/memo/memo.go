// Package memo는 교사 개인 메모와 할 일의 규칙(검사·정리)을 담는다. 저장은 internal/vault/memo.go가 맡는다.
package memo

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"
)

// 항목 종류
const (
	KindMemo = "메모"
	KindTodo = "할 일"
)

// 우선순위
const (
	PriorityLow    = "낮음"
	PriorityNormal = "보통"
	PriorityHigh   = "높음"
)

const (
	MaxItems    = 3000
	maxTitle    = 100
	maxBody     = 5000
	maxTags     = 10
	maxTagChars = 20
)

// Colors는 메모 색 이름이다. 화면은 이 이름으로 두 테마에 맞는 색을 고른다.
var Colors = []string{"기본", "파랑", "초록", "노랑", "주황", "빨강", "보라", "회색"}

// Item은 메모 또는 할 일 하나다.
type Item struct {
	ID        string   `json:"id"`
	Kind      string   `json:"kind"`
	Title     string   `json:"title"`
	Body      string   `json:"body"`
	Color     string   `json:"color"`
	Tags      []string `json:"tags"`
	Pinned    bool     `json:"pinned"`
	Archived  bool     `json:"archived"`
	DueDate   string   `json:"dueDate,omitempty"`
	DueTime   string   `json:"dueTime,omitempty"`
	Priority  string   `json:"priority,omitempty"`
	Done      bool     `json:"done"`
	DoneAt    string   `json:"doneAt,omitempty"`
	RemindAt  string   `json:"remindAt,omitempty"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
}

// Book은 메모·할 일 전체다.
type Book struct {
	Items []Item `json:"items"`
}

func tooLong(value string, limit int) bool { return utf8.RuneCountInString(value) > limit }

// NormalizeTags는 태그 앞의 #과 빈칸을 지우고 겹친 태그를 하나로 만든다.
func NormalizeTags(tags []string) ([]string, error) {
	result := []string{}
	seen := map[string]bool{}
	for _, raw := range tags {
		tag := strings.TrimSpace(strings.TrimLeft(strings.TrimSpace(raw), "#"))
		if tag == "" {
			continue
		}
		if tooLong(tag, maxTagChars) {
			return nil, fmt.Errorf("태그는 %d자까지 쓸 수 있습니다", maxTagChars)
		}
		if seen[tag] {
			continue
		}
		seen[tag] = true
		result = append(result, tag)
	}
	if len(result) > maxTags {
		return nil, fmt.Errorf("태그는 %d개까지 붙일 수 있습니다", maxTags)
	}
	return result, nil
}

func validColor(color string) bool {
	for _, c := range Colors {
		if c == color {
			return true
		}
	}
	return false
}

// Normalize는 화면이 보낸 항목을 검사하고 다듬는다. 번호·만든 시각·완료 시각은 저장 쪽에서 채운다.
func Normalize(item Item) (Item, error) {
	item.Title = strings.TrimSpace(item.Title)
	item.Body = strings.TrimRight(item.Body, " \t\r\n")
	if item.Kind != KindTodo {
		item.Kind = KindMemo
	}
	if tooLong(item.Title, maxTitle) {
		return Item{}, fmt.Errorf("제목은 %d자까지 쓸 수 있습니다", maxTitle)
	}
	if tooLong(item.Body, maxBody) {
		return Item{}, fmt.Errorf("내용은 %d자까지 쓸 수 있습니다", maxBody)
	}
	if item.Kind == KindTodo && item.Title == "" {
		return Item{}, errors.New("할 일 제목을 입력해 주세요")
	}
	if item.Title == "" && strings.TrimSpace(item.Body) == "" {
		return Item{}, errors.New("제목이나 내용을 입력해 주세요")
	}
	if item.Color == "" {
		item.Color = "기본"
	}
	if !validColor(item.Color) {
		return Item{}, errors.New("메모 색을 다시 골라 주세요")
	}
	tags, err := NormalizeTags(item.Tags)
	if err != nil {
		return Item{}, err
	}
	item.Tags = tags
	if item.DueDate != "" {
		if _, err := time.Parse("2006-01-02", item.DueDate); err != nil {
			return Item{}, errors.New("마감 날짜를 확인해 주세요")
		}
	}
	if item.DueTime != "" {
		if item.DueDate == "" {
			return Item{}, errors.New("마감 시각을 쓰려면 마감 날짜도 골라 주세요")
		}
		if _, err := time.Parse("15:04", item.DueTime); err != nil {
			return Item{}, errors.New("마감 시각을 확인해 주세요")
		}
	}
	if item.RemindAt != "" {
		if _, err := time.ParseInLocation("2006-01-02T15:04", item.RemindAt, time.Local); err != nil {
			return Item{}, errors.New("알림 시각을 확인해 주세요")
		}
	}
	if item.Kind == KindMemo {
		item.DueDate, item.DueTime, item.Priority, item.Done = "", "", "", false
	} else {
		switch item.Priority {
		case PriorityLow, PriorityHigh:
		default:
			item.Priority = PriorityNormal
		}
	}
	if !item.Done {
		item.DoneAt = ""
	}
	return item, nil
}
