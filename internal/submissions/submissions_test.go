package submissions

import (
	"encoding/json"
	"testing"
)

func TestSubmissionDocumentJSON(t *testing.T) {
	doc := SubmissionDocument{
		ID:        "sub-1",
		Title:     "가정통신문 회신서",
		DueDate:   "2026-11-10",
		Note:      "체험학습 참가 희망원",
		Statuses: []SubmissionStatus{
			{
				StudentID: "std-1",
				Status:    "제출",
				Note:      "서명 완료",
				UpdatedAt: "2026-11-06T20:00:00+09:00",
			},
		},
		CreatedAt: "2026-11-06T10:00:00+09:00",
		UpdatedAt: "2026-11-06T20:00:00+09:00",
	}

	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatalf("SubmissionDocument JSON 마샬링 실패: %v", err)
	}

	var parsed SubmissionDocument
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("SubmissionDocument JSON 언마샬링 실패: %v", err)
	}

	if parsed.ID != doc.ID || parsed.Title != doc.Title || len(parsed.Statuses) != 1 {
		t.Fatalf("파싱된 서류 데이터 불일치: %+v", parsed)
	}
	if parsed.Statuses[0].Status != "제출" {
		t.Fatalf("제출 상태 불일치: %v", parsed.Statuses[0])
	}
}

