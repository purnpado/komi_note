package survey

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

const (
	testQuestionImage = "0123456789abcdef0123456789abcdef"
	testOptionImage   = "fedcba9876543210fedcba9876543210"
	testOtherImage    = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

func (p *phone) getCode(path string) (int, string) {
	resp, err := p.client.Get(p.base + path)
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

func TestSurvey그림은문항이열린학생과결과공개때만받는다(t *testing.T) {
	question := SurveyQuestion{ID: "q", Text: "어느 그림?", Type: TypeSingle, Options: []string{"가", "나"}, ImageID: testQuestionImage, OptionImages: []string{testOptionImage, ""}}
	server, _, base := startTestSurvey(t, Survey{Audience: "학생", Scope: "담임용", Questions: []SurveyQuestion{question}})
	student, stranger := newPhone(t, base), newPhone(t, base)
	student.post("/login", `{"number":"1","name":"가온"}`)
	if code, _ := student.getCode("/image/" + testQuestionImage); code != http.StatusForbidden {
		t.Fatalf("문항을 열기 전에는 그림도 막아야 합니다: %d", code)
	}
	server.StartQuestions("sv")
	if code, body := student.getCode("/image/" + testOptionImage); code != http.StatusOK || body != "그림-"+testOptionImage {
		t.Fatalf("확인된 학생은 보기 그림을 받아야 합니다: %d %q", code, body)
	}
	if code, _ := stranger.getCode("/image/" + testQuestionImage); code != http.StatusForbidden {
		t.Fatalf("인증하지 않은 기기는 막아야 합니다: %d", code)
	}
	if code, _ := student.getCode("/image/" + testOtherImage); code != http.StatusNotFound {
		t.Fatalf("이 설문이 쓰지 않는 그림은 보내지 않습니다: %d", code)
	}
	if code, _ := student.getCode("/image/zz"); code != http.StatusNotFound {
		t.Fatal("이상한 그림 번호는 막아야 합니다")
	}
	state := student.get("/state")
	if !strings.Contains(state, `"imageId":"`+testQuestionImage) || !strings.Contains(state, testOptionImage) {
		t.Fatalf("문항에 그림 번호가 실려야 합니다: %s", state)
	}
	server.Stop("sv")
	if code, _ := stranger.getCode("/image/" + testOptionImage); code != http.StatusForbidden {
		t.Fatalf("결과 공개 전에는 전자칠판도 막아야 합니다: %d", code)
	}
	server.SetPublicResults("sv", true)
	if code, _ := stranger.getCode("/image/" + testOptionImage); code != http.StatusOK {
		t.Fatalf("결과 공개 뒤 전자칠판은 그림을 받아야 합니다: %d", code)
	}
}

func TestNormalizeQuestions그림정리(t *testing.T) {
	newID := func() string { return "new" }
	questions, err := NormalizeQuestions([]SurveyQuestion{
		{Text: "고르기", Type: TypeSingle, Options: []string{"가", " ", "나"}, OptionImages: []string{testOptionImage, "", ""}, ImageID: testQuestionImage},
		{Text: "목록", Type: TypeDropdown, Options: []string{"가", "나"}, OptionImages: []string{testOptionImage, ""}},
		{Text: "글", Type: TypeShort, OptionImages: []string{testOptionImage}, ImageID: testQuestionImage},
		{Text: "그림 없음", Type: TypeMulti, Options: []string{"가", "나"}, OptionImages: []string{"", ""}},
	}, newID)
	if err != nil {
		t.Fatal(err)
	}
	if got := questions[0].OptionImages; len(got) != 2 || got[0] != testOptionImage || got[1] != "" {
		t.Fatalf("빈 보기를 뺄 때 그림 순서도 맞춰야 합니다: %v", got)
	}
	if questions[1].OptionImages != nil || questions[2].OptionImages != nil || questions[3].OptionImages != nil {
		t.Fatal("목록·글 문항과 그림이 없는 문항은 보기 그림을 비웁니다")
	}
	if questions[2].ImageID != testQuestionImage {
		t.Fatal("글 문항도 문항 그림은 남깁니다")
	}
	if ids := ImageIDs(questions); len(ids) != 2 {
		t.Fatalf("그림 번호는 겹치지 않게 모읍니다: %v", ids)
	}
	if _, err := NormalizeQuestions([]SurveyQuestion{{Text: "x", Type: TypeSingle, Options: []string{"가", "나"}, ImageID: "../../etc"}}, newID); err == nil {
		t.Fatal("이상한 그림 번호는 막아야 합니다")
	}
	if _, err := NormalizeQuestions([]SurveyQuestion{{Text: "x", Type: TypeSingle, Options: []string{"가", ""}, OptionImages: []string{"", testOptionImage}}}, newID); err == nil || !strings.Contains(err.Error(), "글") {
		t.Fatalf("그림만 있고 글이 없는 보기는 안내해야 합니다: %v", err)
	}
	many := []SurveyQuestion{}
	for i := 0; i < MaxImages+1; i++ {
		many = append(many, SurveyQuestion{Text: "x", Type: TypeShort, ImageID: testQuestionImage})
	}
	if _, err := NormalizeQuestions(many, newID); err == nil {
		t.Fatal("그림은 설문 하나에 20장까지입니다")
	}
}
