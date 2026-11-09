package vault

import (
	"strings"
	"testing"

	"TeacherNote/internal/assessment"
)

func assessmentWithRoster(t *testing.T) (*VaultStore, Assessment) {
	t.Helper()
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveAssessment(Assessment{Title: "과학 수행", Subject: "과학", ClassName: "2-1", SchoolYear: "2026", Grade: "2",
		Students: []AssessmentStudent{{Number: "1", Name: "가온"}, {Number: "2", Name: "나래"}},
		Domains:  []assessment.AssessmentDomain{{Name: "실험", MaxScore: 10, Criteria: []assessment.AssessmentCriterion{}}, {Name: "보고서", MaxScore: 10, Criteria: []assessment.AssessmentCriterion{}}},
		Scores:   []assessment.AssessmentScore{}, Objections: []assessment.AssessmentObjection{}, History: []assessment.AssessmentHistory{}})
	if err != nil {
		t.Fatal(err)
	}
	return store, saved
}

func TestAddAssessmentStudent전입생과수업명렬(t *testing.T) {
	store, item := assessmentWithRoster(t)
	if _, err := store.AddAssessmentStudent(item.ID, "01", "다른이름", "", nil); err == nil || !strings.Contains(err.Error(), "1번 가온") {
		t.Fatalf("겹치는 번호(01=1)는 거부: %v", err)
	}
	if _, err := store.AddAssessmentStudent(item.ID, "3", "다온", "2026-11-31", nil); err == nil {
		t.Fatal("잘못된 전입일 거부")
	}
	if _, err := store.AddAssessmentStudent(item.ID, "3", "다온", "", []string{"없는영역"}); err == nil {
		t.Fatal("없는 영역 거부")
	}
	result, err := store.AddAssessmentStudent(item.ID, "3", "다온", "2026-11-09", []string{item.Domains[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	added := result.Assessment.Students[2]
	if added.Status != "전입" || added.TransferIn != "2026-11-09" || len(added.SkippedDomains) != 1 || !result.RosterChanged {
		t.Fatalf("전입생: %+v %+v", added, result)
	}
	rosters, _ := store.ListCourseRosters()
	if len(rosters) != 1 || len(rosters[0].Students) != 3 || rosters[0].Students[2].Name != "다온" {
		t.Fatalf("수업 명렬에도 추가: %+v", rosters)
	}
	got, _ := store.GetAssessment(item.ID)
	if got.History[len(got.History)-1].Type != "학생추가" {
		t.Fatal("이력 기록")
	}
	// 점수 저장(화면이 학생 목록을 다시 보냄)해도 전입 정보가 남는다
	again, err := store.SaveAssessment(got)
	if err != nil || again.Students[2].Status != "전입" || len(again.Students[2].SkippedDomains) != 1 {
		t.Fatalf("저장 뒤에도 유지: %+v %v", again.Students[2], err)
	}
	// 수업 명렬에 같은 번호 다른 이름이 있으면 명렬은 그대로
	store.mu.Lock()
	store.session.CourseRosters[0].Students = append(store.session.CourseRosters[0].Students, CourseRosterStudent{Number: "4", Name: "라온", Status: "재학"})
	store.mu.Unlock()
	result, err = store.AddAssessmentStudent(item.ID, "4", "마루", "", nil)
	if err != nil || result.RosterChanged || !strings.Contains(result.RosterMessage, "라온") {
		t.Fatalf("명렬 충돌 안내: %+v %v", result, err)
	}
}
