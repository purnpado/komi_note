package vault

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"testing"
)

func TestCourseRosterStudentEditingPreservesAssessments(t *testing.T) {
	dir := t.TempDir()
	vault := &VaultStore{filePath: filepath.Join(dir, "data", "vault.dat")}
	_, err := vault.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(dir, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	score := 7.0
	assessment := Assessment{Title: "가상 평가", Subject: "기술", ClassName: "1", SchoolYear: "2026", Grade: "1",
		Students: []AssessmentStudent{{ID: "student", Number: "1", Name: "가상학생"}},
		Domains:  []AssessmentDomain{{ID: "domain", Name: "영역", MaxScore: 10, Criteria: []AssessmentCriterion{{ID: "criterion", Name: "기준", MaxScore: 10}}}},
		Scores:   []AssessmentScore{{StudentID: "student", Domains: []AssessmentDomainScore{{DomainID: "domain", Criteria: []AssessmentCriterionScore{{CriterionID: "criterion", Score: &score}}}}}},
		History:  []AssessmentHistory{{ID: "history", Type: "확인완료", StudentID: "student", DomainID: "domain"}}}
	saved, err := vault.SaveAssessment(assessment)
	if err != nil {
		t.Fatal(err)
	}
	list, _ := vault.ListCourseRosters()
	original := list[0]
	wire, err := json.Marshal(original)
	if err != nil {
		t.Fatal(err)
	}
	var fromScreen CourseRoster
	if err := json.Unmarshal(wire, &fromScreen); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(original, fromScreen) {
		t.Fatalf("화면 전달 시 명렬이 바뀌었습니다: %#v", fromScreen)
	}
	next, err := vault.UpdateCourseRosterStudent(original.ID, fromScreen, "추가", "", CourseRosterStudent{Number: "2", Name: "나학생"}, "")

	if err != nil || len(next.Students) != 2 {
		t.Fatalf("학생 추가: %#v %v", next, err)
	}
	if _, err = vault.UpdateCourseRosterStudent(original.ID, original, "추가", "", CourseRosterStudent{Number: "3", Name: "다학생"}, ""); err == nil {
		t.Fatal("오래된 명렬의 덮어쓰기를 거부해야 합니다")
	}
	if _, err = vault.UpdateCourseRosterStudent(next.ID, next, "추가", "", CourseRosterStudent{Number: "2", Name: "중복"}, ""); err == nil {
		t.Fatal("중복 번호를 거부해야 합니다")
	}
	updated, err := vault.UpdateCourseRosterStudent(next.ID, next, "수정", "2", CourseRosterStudent{Number: "3", Name: "나학생수정", Status: "전출"}, "")
	if err != nil || updated.Students[1].Status != "전출" || updated.Students[1].Name != "나학생수정" {
		t.Fatalf("전출 처리: %#v %v", updated, err)
	}
	if preview := previewCourseRoster(assessment, []CourseRoster{updated}); preview.Status != "일치" {
		t.Fatalf("전출 학생을 재학생 비교에 포함하면 안 됩니다: %#v", preview)
	}
	returning := assessment
	returning.ID = "returning"
	returning.Students = []AssessmentStudent{{ID: "s2", Number: "3", Name: "나학생수정"}}
	vault.session.Assessments = append(vault.session.Assessments, returning)
	comparison, _ := vault.PreviewExistingCourseRoster("returning", "2026", "1")
	if _, err := vault.TransferExistingCourseRoster("returning", "2026", "1", comparison, true); err == nil {
		t.Fatal("전출 학생을 자동 복귀시키면 안 됩니다")
	}

	if _, err = vault.UpdateCourseRosterStudent(updated.ID, updated, "삭제", "3", CourseRosterStudent{}, ""); err == nil {
		t.Fatal("삭제 확인이 필요합니다")
	}
	deleted, err := vault.UpdateCourseRosterStudent(updated.ID, updated, "삭제", "3", CourseRosterStudent{}, "수업 명렬 학생 삭제")
	if err != nil || len(deleted.Students) != 1 || len(deleted.Changes) != 3 {
		t.Fatalf("삭제 및 이력: %#v %v", deleted, err)
	}
	oldPath := vault.filePath
	vault.filePath = dir
	if _, err = vault.UpdateCourseRosterStudent(deleted.ID, deleted, "추가", "", CourseRosterStudent{Number: "4", Name: "실패학생"}, ""); err == nil {
		t.Fatal("쓰기 실패가 필요합니다")
	}
	if !reflect.DeepEqual(vault.session.CourseRosters[0], deleted) {
		t.Fatal("쓰기 실패 후 명렬을 복구해야 합니다")
	}
	vault.filePath = oldPath

	vault.Lock()
	if _, err := vault.Unlock("안전한마스터암호1234"); err != nil {
		t.Fatal(err)
	}
	restored, err := vault.GetAssessment(saved.ID)
	if err != nil || !reflect.DeepEqual(restored.Students, saved.Students) || !reflect.DeepEqual(restored.Scores, saved.Scores) || !reflect.DeepEqual(restored.History, saved.History) {
		t.Fatalf("기존 평가가 변경됨: %#v %v", restored, err)
	}
	list, _ = vault.ListCourseRosters()
	if len(list) != 1 || len(list[0].Changes) != 3 {
		t.Fatalf("명렬 변경 이력 저장 실패: %#v", list)
	}
}
