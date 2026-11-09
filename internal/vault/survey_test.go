package vault

import (
	"strings"
	"testing"

	"TeacherNote/internal/survey"
)

func surveyQuestions() []SurveyQuestion {
	return []SurveyQuestion{{Text: "질문", Type: survey.TypeSingle, Options: []string{"가", "나"}}}
}

func TestSurvey수업용은고른수업반명렬로참여자를만든다(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	if _, err := store.AddStudent(Student{Number: 3, Name: "담임반", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"}); err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	store.session.CourseRosters = []CourseRoster{{ID: "r1", SchoolYear: "2026", Grade: "2", ClassName: "2-1", Students: []CourseRosterStudent{{Number: "1", Name: "가온", Status: "재학"}, {Number: "2", Name: "나래", Status: "전출"}}}}
	store.mu.Unlock()

	if _, err := store.SaveSurvey(Survey{Title: "수업", Scope: "수업용", Audience: "학생", TargetRosterID: "없음", Questions: surveyQuestions()}); err == nil {
		t.Fatal("없는 수업 반은 거부해야 합니다")
	}
	saved, err := store.SaveSurvey(Survey{Title: "수업", Scope: "수업용", Audience: "학생", TargetRosterID: "r1", Questions: surveyQuestions()})
	if err != nil {
		t.Fatal(err)
	}
	participants, err := store.SurveyParticipants(saved.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(participants) != 1 || participants[0].ID != survey.CourseParticipantID("r1", "1", "가온") || participants[0].Name != "가온" {
		t.Fatalf("재학 수업 반 학생만 참여자여야 합니다: %+v", participants)
	}

	homeroom, err := store.SaveSurvey(Survey{Title: "담임", Scope: "담임용", Audience: "학생", TargetRosterID: "r1", Questions: surveyQuestions()})
	if err != nil {
		t.Fatal(err)
	}
	if homeroom.TargetRosterID != "" {
		t.Fatal("담임용 설문에는 수업 반을 남기지 않습니다")
	}
	participants, _ = store.SurveyParticipants(homeroom.ID)
	if len(participants) != 1 || participants[0].Number != "3" {
		t.Fatalf("담임용은 담임 반 학생: %+v", participants)
	}
}

func TestSurvey응답검사와중복막기(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveSurvey(Survey{Title: "검사", Scope: "담임용", Audience: "학생", Questions: []SurveyQuestion{
		{Text: "고르기", Type: survey.TypeMulti, Options: []string{"가", "나", "다"}, MaxChoices: 2},
		{Text: "소감", Type: survey.TypeShort, Optional: true},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetSurveyStatus(saved.ID, "진행 중"); err != nil {
		t.Fatal(err)
	}
	q := saved.Questions[0].ID
	if err := store.SubmitSurvey(saved.ID, "s1", "", nil, map[string][]string{q: {"가", "나", "다"}}); err == nil {
		t.Fatal("최대 개수를 넘으면 거부")
	}
	if err := store.SubmitSurvey(saved.ID, "s1", "", map[string]string{"엉뚱": "x"}, map[string][]string{q: {"가"}}); err != nil {
		t.Fatal(err)
	}
	if err := store.SubmitSurvey(saved.ID, "s1", "", nil, map[string][]string{q: {"나"}}); err == nil || !strings.Contains(err.Error(), "이미") {
		t.Fatalf("같은 학생 두 번째 응답은 거부: %v", err)
	}
	for _, id := range []string{"staff-anon-a", "staff-anon-b"} {
		if err := store.SubmitSurvey(saved.ID, id, "", nil, map[string][]string{q: {"가"}}); err != nil {
			t.Fatalf("익명 교직원 기기마다 응답 가능: %v", err)
		}
	}
	got, _ := store.GetSurvey(saved.ID)
	if len(got.Responses) != 3 {
		t.Fatalf("응답 수 %d", len(got.Responses))
	}
	if _, ok := got.Responses[0].Answers["엉뚱"]; ok {
		t.Fatal("문항에 없는 답은 저장하지 않습니다")
	}
}

func TestSurvey예전설문은그대로열린다(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveSurvey(Survey{Title: "예전", Questions: []SurveyQuestion{{Text: "만족도", Type: survey.TypeLegacyScale}}})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Scope != "수업용" || len(saved.Questions[0].Options) != 5 || saved.Questions[0].Optional {
		t.Fatalf("예전 형식 기본값 유지: %+v", saved)
	}
}
