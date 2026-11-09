package survey

import (
	"strings"
	"testing"
)

func counter() func() string {
	n := 0
	return func() string { n++; return "q" + string(rune('0'+n)) }
}

func TestNormalizeQuestions는유형별로다듬는다(t *testing.T) {
	got, err := NormalizeQuestions([]SurveyQuestion{
		{Text: " 좋아하는 계절 ", Type: TypeSingle, Options: []string{" 봄 ", "", "여름"}, ScaleSteps: 5},
		{Text: "만족도", Type: TypeScale, ScaleSteps: 10, ScaleMinLabel: "아쉬움", ScaleMaxLabel: "만족", Options: []string{"버림"}},
		{Text: "한 줄 소감", Type: TypeShort, Options: []string{"버림"}, AllowOther: true},
		{Text: "예전 척도", Type: TypeLegacyScale},
		{Text: "활동", Type: TypeMulti, Options: []string{"가", "나", "다"}, MaxChoices: 9, AllowOther: true},
	}, counter())
	if err != nil {
		t.Fatal(err)
	}
	if got[0].Text != "좋아하는 계절" || strings.Join(got[0].Options, ",") != "봄,여름" || got[0].ScaleSteps != 0 || got[0].ID == "" {
		t.Fatalf("단일 선택 다듬기 실패: %+v", got[0])
	}
	if len(got[1].Options) != 10 || got[1].Options[9] != "10" || got[1].ScaleMinLabel != "아쉬움" {
		t.Fatalf("척도 보기는 1~10이어야 합니다: %+v", got[1])
	}
	if len(got[2].Options) != 0 || got[2].AllowOther {
		t.Fatalf("글 답 문항에는 보기가 없어야 합니다: %+v", got[2])
	}
	if len(got[3].Options) != 5 {
		t.Fatalf("예전 5점 척도는 기본 보기를 채워야 합니다: %+v", got[3])
	}
	if got[4].MaxChoices != 0 {
		t.Fatalf("보기 수보다 큰 최대 개수는 제한 없음(0)으로: %+v", got[4])
	}
}

func TestNormalizeQuestions는잘못된문항을막는다(t *testing.T) {
	cases := map[string][]SurveyQuestion{
		"문항 없음":    {},
		"질문 없음":    {{Type: TypeSingle, Options: []string{"가", "나"}}},
		"보기 하나":    {{Text: "질문", Type: TypeSingle, Options: []string{"가"}}},
		"같은 보기":    {{Text: "질문", Type: TypeSingle, Options: []string{"가", "가"}}},
		"모르는 유형":   {{Text: "질문", Type: "그림"}},
		"기타로 시작":   {{Text: "질문", Type: TypeSingle, Options: []string{"기타: 직접", "나"}}},
		"질문이 너무 김": {{Text: strings.Repeat("가", 201), Type: TypeShort}},
	}
	for name, questions := range cases {
		if _, err := NormalizeQuestions(questions, counter()); err == nil {
			t.Errorf("%s: 오류여야 합니다", name)
		}
	}
	if _, err := NormalizeQuestions([]SurveyQuestion{{Text: "질문", Type: TypeSingle, Options: []string{"가"}, AllowOther: true}}, counter()); err != nil {
		t.Fatalf("기타 칸이 있으면 보기 하나도 됩니다: %v", err)
	}
}

func TestNormalizeQuestions는겹친번호를새로만든다(t *testing.T) {
	got, err := NormalizeQuestions([]SurveyQuestion{{ID: "a", Text: "1", Type: TypeShort}, {ID: "a", Text: "2", Type: TypeShort}}, counter())
	if err != nil {
		t.Fatal(err)
	}
	if got[0].ID == got[1].ID {
		t.Fatalf("문항 번호가 겹치면 안 됩니다: %+v", got)
	}
}

func sampleQuestions() []SurveyQuestion {
	return []SurveyQuestion{
		{ID: "s", Text: "계절", Type: TypeSingle, Options: []string{"봄", "여름"}, AllowOther: true},
		{ID: "m", Text: "활동", Type: TypeMulti, Options: []string{"가", "나", "다"}, MaxChoices: 2},
		{ID: "d", Text: "반", Type: TypeDropdown, Options: []string{"1반", "2반"}},
		{ID: "c", Text: "만족도", Type: TypeScale, Options: ScaleOptions(5)},
		{ID: "t", Text: "소감", Type: TypeLong, Optional: true},
	}
}

func TestValidateAnswers는맞는답을받는다(t *testing.T) {
	answers, multi, err := ValidateAnswers(sampleQuestions(), map[string]string{"s": "기타:  체육 ", "d": "2반", "c": "4", "t": "  ", "모름": "x"}, map[string][]string{"m": {"가", "가", " 다 "}})
	if err != nil {
		t.Fatal(err)
	}
	if answers["s"] != "기타: 체육" || answers["d"] != "2반" || answers["c"] != "4" {
		t.Fatalf("답 다듬기 실패: %+v", answers)
	}
	if _, ok := answers["t"]; ok {
		t.Fatal("빈 선택 문항 답은 저장하지 않습니다")
	}
	if _, ok := answers["모름"]; ok {
		t.Fatal("문항에 없는 답은 버려야 합니다")
	}
	if strings.Join(multi["m"], ",") != "가,다" {
		t.Fatalf("복수 선택 중복 제거 실패: %+v", multi)
	}
}

func TestValidateAnswers는잘못된답을막는다(t *testing.T) {
	base := map[string]string{"s": "봄", "d": "1반", "c": "3"}
	multi := map[string][]string{"m": {"가"}}
	copyMap := func(extra map[string]string) map[string]string {
		out := map[string]string{}
		for k, v := range base {
			out[k] = v
		}
		for k, v := range extra {
			out[k] = v
		}
		return out
	}
	bad := []struct {
		name    string
		answers map[string]string
		multi   map[string][]string
	}{
		{"필수 빠짐", copyMap(map[string]string{"d": ""}), multi},
		{"없는 보기", copyMap(map[string]string{"s": "겨울"}), multi},
		{"빈 기타", copyMap(map[string]string{"s": "기타: "}), multi},
		{"기타 안 됨", copyMap(map[string]string{"d": "기타: 3반"}), multi},
		{"척도 밖", copyMap(map[string]string{"c": "6"}), multi},
		{"너무 많이 고름", base, map[string][]string{"m": {"가", "나", "다"}}},
		{"복수 빠짐", base, map[string][]string{}},
		{"긴 글", copyMap(map[string]string{"t": strings.Repeat("가", 2001)}), multi},
	}
	for _, c := range bad {
		if _, _, err := ValidateAnswers(sampleQuestions(), c.answers, c.multi); err == nil {
			t.Errorf("%s: 오류여야 합니다", c.name)
		}
	}
}

func TestChoiceCounts는기타를묶는다(t *testing.T) {
	q := sampleQuestions()[0]
	counts := ChoiceCounts(q, []SurveyResponse{{Answers: map[string]string{"s": "봄"}}, {Answers: map[string]string{"s": "기타: 겨울"}}, {Answers: map[string]string{"s": "기타: 가을"}}})
	if counts["봄"] != 1 || counts["여름"] != 0 || counts["기타"] != 2 {
		t.Fatalf("집계 오류: %+v", counts)
	}
}
