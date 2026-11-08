package vault

import (
	"path/filepath"
	"testing"
)

func TestCourseRosterCreationAndConflict(t *testing.T) {
	dir := t.TempDir()
	vault := &VaultStore{filePath: filepath.Join(dir, "data", "vault.dat")}
	_, err := vault.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(dir, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	item := Assessment{Title: "가상 평가", Subject: "기술", ClassName: "1", SchoolYear: "2026", Grade: "1",
		Students: []AssessmentStudent{{ID: "s1", Number: "1", Name: "가상학생"}, {ID: "s2", Number: "2", Name: "나학생"}},
		Domains:  []AssessmentDomain{{ID: "domain", Name: "가상 영역", MaxScore: 10}}}
	if p, _ := vault.PreviewCourseRoster(item); p.Status != "신규" {
		t.Fatalf("신규 명렬 미리보기: %#v", p)
	}
	first, err := vault.SaveAssessment(item)
	if err != nil {
		t.Fatal(err)
	}
	if p, _ := vault.PreviewCourseRoster(item); p.Status != "일치" {
		t.Fatalf("반복 가져오기 일치: %#v", p)
	}
	if _, err = vault.SaveAssessment(item); err != nil {
		t.Fatal(err)
	}
	rosters, err := vault.ListCourseRosters()
	if err != nil || len(rosters) != 1 {
		t.Fatalf("명렬 중복: %#v %v", rosters, err)
	}
	changed := item
	changed.Students = []AssessmentStudent{{ID: "s1", Number: "1", Name: "다른학생"}}
	p, err := vault.PreviewCourseRoster(changed)
	if err != nil || p.Status != "차이" || len(p.Added) != 1 || len(p.Missing) != 2 {
		t.Fatalf("명렬 차이: %#v %v", p, err)
	}
	if _, err = vault.SaveAssessment(changed); err != nil {
		t.Fatal(err)
	}
	if err := vault.DeleteAssessment(first.ID, "수행평가 삭제"); err != nil {
		t.Fatal(err)
	}
	vault.Lock()
	if _, err = vault.Unlock("안전한마스터암호1234"); err != nil {
		t.Fatal(err)
	}
	rosters, err = vault.ListCourseRosters()
	if err != nil || len(rosters) != 1 || len(rosters[0].Students) != 2 || rosters[0].Students[0].Name != "가상학생" {
		t.Fatalf("암호화 저장·충돌·평가 삭제 후 명렬 보존 실패: %#v %v", rosters, err)
	}
}

func TestCourseRosterPreviewRejectsAmbiguousData(t *testing.T) {
	item := Assessment{SchoolYear: "2026", Grade: "1", ClassName: "1", Students: []AssessmentStudent{{Number: "1", Name: "가상"}, {Number: "1", Name: "나상"}}}
	if got := previewCourseRoster(item, nil); got.Status != "보류" {
		t.Fatalf("중복 번호 거부: %#v", got)
	}
	item.Students = item.Students[:1]
	item.SchoolYear = "202"
	if got := previewCourseRoster(item, nil); got.Status != "보류" {
		t.Fatalf("불완전한 학년도 거부: %#v", got)
	}
	item.SchoolYear = "2026"
	item.Grade = ""
	if got := previewCourseRoster(item, nil); got.Status != "보류" {
		t.Fatalf("미지정 학년 거부: %#v", got)
	}
	item.Grade = "1"
	item.ClassName = "2-1"
	if got := previewCourseRoster(item, nil); got.Status != "보류" {
		t.Fatalf("반의 학년이 다를 때 거부: %#v", got)
	}
}

func TestCourseRosterWriteFailureRestoresSession(t *testing.T) {
	dir := t.TempDir()
	vault := &VaultStore{filePath: filepath.Join(dir, "data", "vault.dat")}
	_, err := vault.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(dir, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	vault.filePath = dir
	item := Assessment{Title: "가상 평가", Subject: "기술", ClassName: "1", SchoolYear: "2026", Grade: "1", Students: []AssessmentStudent{{ID: "s1", Number: "1", Name: "가상학생"}}, Domains: []AssessmentDomain{{ID: "domain", Name: "가상 영역", MaxScore: 10}}}
	if _, err := vault.SaveAssessment(item); err == nil {
		t.Fatal("쓰기 실패가 필요합니다")
	}
	if len(vault.session.Assessments) != 0 || len(vault.session.CourseRosters) != 0 {
		t.Fatal("쓰기 실패 후 메모리의 평가와 명렬을 복구해야 합니다")
	}
}
