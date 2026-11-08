package vault

import (
	"path/filepath"
	"testing"
)

func TestTransferExistingAssessmentToCourseRoster(t *testing.T) {
	dir := t.TempDir()
	vault := &VaultStore{filePath: filepath.Join(dir, "data", "vault.dat")}
	_, err := vault.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(dir, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	item := Assessment{ID: "old", Title: "기존 평가", Subject: "기술", ClassName: "1",
		Students: []AssessmentStudent{{ID: "student1", Number: "1", Name: "가상학생"}},
		Domains:  []AssessmentDomain{{ID: "domain", Name: "영역", MaxScore: 10}},
		History:  []AssessmentHistory{{ID: "history", Type: "확인완료", StudentID: "student1"}}}
	vault.session.Assessments = []Assessment{item}
	if _, err := vault.PreviewExistingCourseRoster("missing", "2026", "1"); err == nil {
		t.Fatal("없는 평가는 거부해야 합니다")
	}
	preview, err := vault.PreviewExistingCourseRoster("old", "2026", "1")
	if err != nil || preview.Status != "신규" {
		t.Fatalf("새 명렬 비교: %#v %v", preview, err)
	}
	oldPath := vault.filePath
	vault.filePath = dir
	if _, err := vault.TransferExistingCourseRoster("old", "2026", "1", preview, false); err == nil {
		t.Fatal("저장 오류가 발생해야 합니다")
	}
	if len(vault.session.CourseRosters) != 0 {
		t.Fatal("실패한 명렬 생성은 복구해야 합니다")
	}
	vault.filePath = oldPath

	if _, err := vault.TransferExistingCourseRoster("old", "2026", "1", preview, false); err != nil {
		t.Fatal(err)
	}
	if _, err := vault.TransferExistingCourseRoster("old", "2026", "1", preview, false); err == nil {
		t.Fatal("오래된 비교 결과는 거부해야 합니다")
	}
	repeated, _ := vault.PreviewExistingCourseRoster("old", "2026", "1")
	if repeated.Status != "일치" {
		t.Fatalf("중복 비교: %#v", repeated)
	}
	if _, err := vault.TransferExistingCourseRoster("old", "2026", "1", repeated, false); err != nil {
		t.Fatal(err)
	}
	second := item
	second.ID = "second"
	second.Students = append(append([]AssessmentStudent(nil), item.Students...), AssessmentStudent{ID: "student2", Number: "2", Name: "나학생"})
	vault.session.Assessments = append(vault.session.Assessments, second)
	difference, _ := vault.PreviewExistingCourseRoster("second", "2026", "1")
	if difference.Status != "차이" || len(difference.Added) != 1 {
		t.Fatalf("새 학생 비교: %#v", difference)
	}
	if _, err := vault.TransferExistingCourseRoster("second", "2026", "1", difference, false); err == nil {
		t.Fatal("차이 확인 없이 추가하면 안 됩니다")
	}
	if _, err := vault.TransferExistingCourseRoster("second", "2026", "1", difference, true); err != nil {
		t.Fatal(err)
	}
	conflict := item
	conflict.ID = "conflict"
	conflict.Students = []AssessmentStudent{{ID: "other", Number: "1", Name: "다른학생"}}
	vault.session.Assessments = append(vault.session.Assessments, conflict)
	diff, _ := vault.PreviewExistingCourseRoster("conflict", "2026", "1")
	if _, err := vault.TransferExistingCourseRoster("conflict", "2026", "1", diff, true); err == nil {
		t.Fatal("같은 번호의 이름 충돌을 거부해야 합니다")
	}
	vault.Lock()
	if _, err := vault.Unlock("안전한마스터암호1234"); err != nil {
		t.Fatal(err)
	}
	rosters, _ := vault.ListCourseRosters()
	if len(rosters) != 1 || len(rosters[0].Students) != 2 || rosters[0].Students[0].Name != "가상학생" {
		t.Fatalf("저장된 명렬이 다릅니다: %#v", rosters)
	}
	if len(rosters[0].Changes) != 1 || rosters[0].Changes[0].Action != "평가에서 추가" {
		t.Fatalf("평가에서 추가한 변경 이력을 남겨야 합니다: %#v", rosters[0].Changes)
	}
	restored, err := vault.GetAssessment("old")
	if err != nil || restored.Grade != "" || restored.SchoolYear != "" || len(restored.History) != 1 || restored.Students[0].ID != "student1" {
		t.Fatalf("기존 평가가 변경됐습니다: %#v %v", restored, err)
	}
}
