package survey

import (
	"encoding/json"
	"testing"
)

func TestSurveyJSONSerialization(t *testing.T) {
	s := Survey{
		ID:        "survey-test-1",
		Title:     "학급 임원 선거 설문",
		Audience:  "학생",
		Scope:     "담임용",
		Anonymous: true,
		Status:    "준비",
		Questions: []SurveyQuestion{
			{
				ID:      "q1",
				Text:    "가장 성실하게 봉사할 반장은?",
				Type:    "단일 선택",
				Options: []string{"후보 1", "후보 2"},
			},
		},
		Responses: []SurveyResponse{
			{
				StudentID:      "std-1",
				RespondentName: "익명",
				Answers:        map[string]string{"q1": "후보 1"},
				SubmittedAt:    "2026-11-06T20:00:00+09:00",
			},
		},
	}

	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("Survey JSON 마샬링 실패: %v", err)
	}

	var parsed Survey
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("Survey JSON 언마샬링 실패: %v", err)
	}

	if parsed.ID != s.ID || parsed.Title != s.Title || len(parsed.Questions) != 1 {
		t.Fatalf("파싱된 설문 데이터 불일치: %+v", parsed)
	}
	if parsed.Responses[0].Answers["q1"] != "후보 1" {
		t.Fatalf("응답 답변 불일치: %v", parsed.Responses[0].Answers)
	}
}

