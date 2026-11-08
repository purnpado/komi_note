package main

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/xuri/excelize/v2"

	"TeacherNote/internal/vault"
)

func TestAssessmentConfirmationHistoryKeepsDomainAndSurvivesStaleSave(t *testing.T) {
	directory := t.TempDir()
	vaultStore := vault.NewVaultStoreWithPaths(filepath.Join(directory, "data", "vault.dat"), filepath.Join(directory, "backup"))
	_, err := vaultStore.Initialize(SetupRequest{
		Config:           ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5},
		MasterPassword:   "안전한마스터암호1234",
		RecoveryPassword: "안전한복구암호1234",
		RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery"),
	})
	if err != nil {
		t.Fatal(err)
	}
	item := Assessment{
		ID: "test", Title: "가상 평가", Subject: "기술", ClassName: "1",
		Students: []AssessmentStudent{{ID: "student", Number: "1", Name: "가상학생"}},
		Domains:  []AssessmentDomain{{ID: "first", Name: "첫 영역", MaxScore: 10}},
	}
	if _, err := vaultStore.SaveAssessment(item); err != nil {
		t.Fatal(err)
	}
	if err := vaultStore.AddAssessmentHistory(item.ID, "확인완료", "student", "first", "확인"); err != nil {
		t.Fatal(err)
	}
	saved, err := vaultStore.SaveAssessment(item)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.History) != 1 || saved.History[0].StudentID != "student" || saved.History[0].DomainID != "first" {
		t.Fatalf("확인 학생과 영역을 보존하지 못함: %#v", saved.History)
	}
	var legacy AssessmentHistory
	if err := json.Unmarshal([]byte(`{"type":"확인완료","studentId":"student"}`), &legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.DomainID != "" {
		t.Fatalf("기존 이력의 영역을 임의 추측하면 안 됩니다: %#v", legacy)
	}
}

func TestSaveAssessmentMigratesLegacyDomainScore(t *testing.T) {
	value := 36.0
	item := Assessment{
		ID:    "legacy",
		Title: "가상 평가", Subject: "기술·가정", ClassName: "1",
		Students: []AssessmentStudent{{ID: "student", Number: "1", Name: "가온"}},
		Domains:  []AssessmentDomain{{ID: "domain", Name: "설계", MaxScore: 40, Criteria: []AssessmentCriterion{{ID: "legacy-criterion", Name: "영역 점수", MaxScore: 40}}}},
		Scores:   []AssessmentScore{{StudentID: "student", Domains: []AssessmentDomainScore{{DomainID: "domain", Criteria: []AssessmentCriterionScore{{CriterionID: "legacy-criterion", Score: &value}}}}}},
	}
	directory := t.TempDir()
	vaultStore := vault.NewVaultStoreWithPaths(filepath.Join(directory, "data", "vault.dat"), filepath.Join(directory, "backup"))
	if _, err := vaultStore.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}); err != nil {
		t.Fatal(err)
	}
	saved, err := vaultStore.SaveAssessment(item)
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Domains[0].Criteria) != 0 || saved.Scores[0].Domains[0].ImportedScore == nil || *saved.Scores[0].Domains[0].ImportedScore != 36 {
		t.Fatalf("기존 영역 점수를 원본 총점으로 이전하지 못함: %#v", saved)
	}
}

func TestDeleteAssessmentObjectionDeletesOnlyAnsweredRecord(t *testing.T) {
	directory := t.TempDir()
	vaultStore := vault.NewVaultStoreWithPaths(filepath.Join(directory, "data", "vault.dat"), filepath.Join(directory, "backup"))
	if _, err := vaultStore.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "1", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}); err != nil {
		t.Fatal(err)
	}
	item := Assessment{
		ID: "delete-objection", Title: "가상 평가", Subject: "기술·가정", ClassName: "1",
		Students: []AssessmentStudent{{ID: "student", Number: "1", Name: "가온"}},
		Domains:  []AssessmentDomain{{ID: "domain", Name: "영역", MaxScore: 10}},
		Objections: []AssessmentObjection{
			{ID: "answered", StudentID: "student", Content: "답변 완료 이의", Answer: "답변", Status: "답변 완료"},
			{ID: "pending", StudentID: "student", Content: "처리 중 이의", Status: "확인 대기"},
		},
	}
	if _, err := vaultStore.SaveAssessment(item); err != nil {
		t.Fatal(err)
	}
	if _, err := vaultStore.DeleteAssessmentObjection(item.ID, "pending"); err == nil {
		t.Fatal("처리 중 이의 삭제를 거부해야 합니다")
	}
	saved, err := vaultStore.DeleteAssessmentObjection(item.ID, "answered")
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Objections) != 1 || saved.Objections[0].ID != "pending" {
		t.Fatalf("답변 완료 이의만 삭제해야 합니다: %#v", saved.Objections)
	}
	if len(saved.History) != 1 || saved.History[0].Type != "이의삭제" {
		t.Fatalf("삭제 처리 이력을 남기지 못했습니다: %#v", saved.History)
	}
}

func TestPreviewAssessmentImportReadsNAISHeadersAndMinimalRoster(t *testing.T) {
	book := excelize.NewFile()
	sheet := book.GetSheetName(0)
	rows := [][]any{
		{"과목", "반", "번호", "성명", "설계", "제작"},
		{"", "", "", "", "만점(40)", "만점(60)"},
		{"", "", "", "", "점수", "점수"},
		{"기술·가정", "2-1", "1", "가상학생", "38", ""},
		{"기술·가정", "2-1", "2", "나학생", "", "55"},
	}
	for rowIndex, row := range rows {
		for columnIndex, value := range row {
			cell, _ := excelize.CoordinatesToCellName(columnIndex+1, rowIndex+1)
			if err := book.SetCellValue(sheet, cell, value); err != nil {
				t.Fatal(err)
			}
		}
	}
	path := filepath.Join(t.TempDir(), "수행평가 파일일괄등록 - 2026학년도 2학기 주간 1학년 기술·가정_전체_1강의실.xlsx")
	if err := book.SaveAs(path); err != nil {
		t.Fatal(err)
	}
	preview, err := vault.PreviewAssessmentImport(path)
	if err != nil {
		t.Fatal(err)
	}
	if preview.Subject != "기술·가정" || preview.ClassName != "2-1" {
		t.Fatalf("과목·반을 잘못 읽음: %#v", preview)
	}
	if preview.Assessment.Grade != "1" || preview.Assessment.SchoolYear != "2026" || preview.Assessment.Semester != "2" || preview.Assessment.Classroom != "1강의실" || preview.FilenameSubject != "기술·가정" {
		t.Fatalf("파일명 정보를 읽지 못함: %#v", preview)
	}
	if len(preview.Assessment.Students) != 2 || len(preview.Assessment.Domains) != 2 {
		t.Fatalf("명렬 또는 영역 수가 다름: %#v", preview.Assessment)
	}
	if len(preview.Assessment.Domains[0].Criteria) != 0 {
		t.Fatalf("나이스 원본 점수를 세부 기준으로 만들면 안 됨: %#v", preview.Assessment.Domains[0].Criteria)
	}
	if value := preview.Assessment.Scores[0].Domains[0].ImportedScore; value == nil || *value != 38 {
		t.Fatalf("첫 점수를 못 읽음: %#v", value)
	}
	if value := preview.Assessment.Scores[0].Domains[1].ImportedScore; value != nil {
		t.Fatalf("빈 점수는 미입력이어야 함: %#v", value)
	}
}
