package memo

import (
	"strings"
	"testing"
)

func TestNormalize메모와할일(t *testing.T) {
	got, err := Normalize(Item{Kind: "아무거나", Title: " 회의 ", Body: "내용\n\n", Tags: []string{"#업무", " 업무 ", "", "학부모"}, DueDate: "2026-11-10", Priority: PriorityHigh, Done: true})
	if err != nil {
		t.Fatal(err)
	}
	if got.Kind != KindMemo || got.Title != "회의" || got.Body != "내용" || got.Color != "기본" {
		t.Fatalf("메모 다듬기: %+v", got)
	}
	if strings.Join(got.Tags, ",") != "업무,학부모" {
		t.Fatalf("태그 정리: %v", got.Tags)
	}
	if got.DueDate != "" || got.Priority != "" || got.Done {
		t.Fatalf("메모에는 마감·우선순위·완료가 없어야 합니다: %+v", got)
	}
	todo, err := Normalize(Item{Kind: KindTodo, Title: "생기부 마감", DueDate: "2026-11-20", DueTime: "16:30", DoneAt: "남은 값"})
	if err != nil {
		t.Fatal(err)
	}
	if todo.Priority != PriorityNormal || todo.DoneAt != "" {
		t.Fatalf("할 일 기본값: %+v", todo)
	}
}

func TestNormalize잘못된값을막는다(t *testing.T) {
	bad := map[string]Item{
		"빈 메모":      {Kind: KindMemo},
		"제목 없는 할 일": {Kind: KindTodo, Body: "내용"},
		"긴 제목":      {Title: strings.Repeat("가", 101)},
		"긴 내용":      {Title: "a", Body: strings.Repeat("가", 5001)},
		"모르는 색":     {Title: "a", Color: "금색"},
		"날짜 틀림":     {Kind: KindTodo, Title: "a", DueDate: "2026-13-01"},
		"시각만":       {Kind: KindTodo, Title: "a", DueTime: "10:00"},
		"알림 틀림":     {Title: "a", RemindAt: "내일"},
		"태그 너무 많음":  {Title: "a", Tags: strings.Split("1,2,3,4,5,6,7,8,9,10,11", ",")},
		"긴 태그":      {Title: "a", Tags: []string{strings.Repeat("가", 21)}},
	}
	for name, item := range bad {
		if _, err := Normalize(item); err == nil {
			t.Errorf("%s: 오류여야 합니다", name)
		}
	}
}
