package vault

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xuri/excelize/v2"
)

func writeAssessmentXLSX(t *testing.T, path string, rows [][]any) {
	t.Helper()
	book := excelize.NewFile()
	sheet := book.GetSheetName(0)
	head := [][]any{{"과목", "반", "번호", "성명", "설계", "제작"}, {"", "", "", "", "만점(40)", "만점(60)"}, {"", "", "", "", "점수", "점수"}}
	for r, row := range append(head, rows...) {
		for c, v := range row {
			cell, _ := excelize.CoordinatesToCellName(c+1, r+1)
			_ = book.SetCellValue(sheet, cell, v)
		}
	}
	if err := book.SaveAs(path); err != nil {
		t.Fatal(err)
	}
}

func TestAssessmentImportValidation(t *testing.T) {
	dir := t.TempDir()
	cases := []struct {
		name    string
		rows    [][]any
		wantErr string
		warn    string
	}{
		{"정상", [][]any{{"기술", "1", "1", "가온", 30, 50}}, "", ""},
		{"번호중복", [][]any{{"기술", "1", "1", "가온", 30, 50}, {"기술", "1", "01", "나래", 30, 50}}, "번호(01)가 같습니다", ""},
		{"만점초과", [][]any{{"기술", "1", "1", "가온", 45, 50}}, "엑셀 4번째 줄(1번 가온) 설계 영역 점수 45점", ""},
		{"음수", [][]any{{"기술", "1", "1", "가온", -1, 50}}, "범위를 벗어납니다", ""},
		{"NaN", [][]any{{"기술", "1", "1", "가온", "NaN", 50}}, "숫자로 읽지 못했습니다", ""},
		{"여러반", [][]any{{"기술", "1", "1", "가온", 30, 50}, {"기술", "2", "2", "나래", 30, 50}}, "", "다른 반(2)"},
		{"여러과목", [][]any{{"기술", "1", "1", "가온", 30, 50}, {"수학", "1", "2", "나래", 30, 50}}, "", "다른 과목(수학)"},
	}
	for _, tc := range cases {
		path := filepath.Join(dir, tc.name+".xlsx")
		writeAssessmentXLSX(t, path, tc.rows)
		preview, err := PreviewAssessmentImport(path)
		if tc.wantErr != "" {
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("%s: %q 오류가 필요한데 %v", tc.name, tc.wantErr, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: 통과해야 하는데 %v", tc.name, err)
			continue
		}
		if tc.warn != "" && !strings.Contains(strings.Join(preview.Warnings, " "), tc.warn) {
			t.Errorf("%s: 경고 %q가 필요합니다: %v", tc.name, tc.warn, preview.Warnings)
		}
	}
}

// 학생 이의가 도착한 뒤 교사가 예전 화면 사본으로 점수를 저장해도 이의가 지워지면 안 된다.
func TestSaveAssessmentKeepsObjectionsFromStaleCopy(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	path := filepath.Join(dir, "평가.xlsx")
	writeAssessmentXLSX(t, path, [][]any{{"기술", "1", "1", "가온", 30, 50}, {"기술", "1", "2", "나래", 20, 40}})
	preview, err := PreviewAssessmentImport(path)
	if err != nil {
		t.Fatal(err)
	}
	preview.Assessment.Title = "가상 평가"
	saved, err := store.SaveAssessment(preview.Assessment)
	if err != nil {
		t.Fatal(err)
	}
	var stale Assessment
	raw, _ := json.Marshal(saved)
	_ = json.Unmarshal(raw, &stale)
	d1, d2 := saved.Domains[0].ID, saved.Domains[1].ID
	student := saved.Students[0].ID
	if err := store.SubmitAssessmentObjection(saved.ID, d1, student, "설계 점수 확인 부탁"); err != nil {
		t.Fatal(err)
	}
	resaved, err := store.SaveAssessment(stale)
	if err != nil {
		t.Fatal(err)
	}
	if resaved.Objections == nil {
		t.Fatal("저장 결과의 이의 목록은 빈 목록이어도 null이 아니어야 합니다(화면 오류 방지)")
	}
	empty, _ := store.SaveAssessment(func() Assessment { x, _ := store.GetAssessment(saved.ID); x.Objections = nil; return x }())
	_ = empty
	after, _ := store.GetAssessment(saved.ID)
	if len(after.Objections) != 1 {
		t.Fatalf("예전 사본 저장 뒤에도 이의가 남아야 합니다: %d건", len(after.Objections))
	}
	// 다른 영역에는 이의를 낼 수 있고, 같은 영역에는 처리 중 이의가 있으면 막는다.
	if err := store.SubmitAssessmentObjection(saved.ID, d2, student, "제작 점수 확인"); err != nil {
		t.Fatalf("다른 영역 이의는 받아야 합니다: %v", err)
	}
	if err := store.SubmitAssessmentObjection(saved.ID, d1, student, "다시"); err == nil {
		t.Fatal("같은 영역 처리 중 이의가 있으면 막아야 합니다")
	}
}
