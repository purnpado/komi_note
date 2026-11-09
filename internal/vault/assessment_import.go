package vault

import (
	"TeacherNote/internal/assessment"
	"errors"
	"fmt"
	"math"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// 나이스 수행평가 파일 가져오기 미리 보기입니다.

// AssessmentImportPreview는 나이스 파일 저장 전 교사가 확인하는 최소 미리보기입니다.
type AssessmentImportPreview struct {
	FileName        string     `json:"fileName"`
	Subject         string     `json:"subject"`
	ClassName       string     `json:"className"`
	FilenameSubject string     `json:"filenameSubject,omitempty"`
	Assessment      Assessment `json:"assessment"`
	// Warnings는 가져오기는 되지만 교사가 확인해야 할 내용(여러 반·과목 섞임 등)이다.
	Warnings []string `json:"warnings"`
}

func parseAssessmentScore(value string) (*float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	number, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", ""), 64)
	if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
		return nil, fmt.Errorf("점수 '%s'를 숫자로 읽지 못했습니다", value)
	}
	return &number, nil
}

// PreviewAssessmentImport는 나이스 수행평가 일괄등록의 3줄 머리글을 읽습니다.
func PreviewAssessmentImport(path string) (AssessmentImportPreview, error) {
	if strings.TrimSpace(path) == "" {
		return AssessmentImportPreview{}, errors.New("수행평가 파일을 선택해 주세요")
	}
	book, err := excelize.OpenFile(path)
	if err != nil {
		return AssessmentImportPreview{}, fmt.Errorf("수행평가 엑셀을 열지 못했습니다: %w", err)
	}
	defer func() { _ = book.Close() }()
	sheets := book.GetSheetList()
	if len(sheets) == 0 {
		return AssessmentImportPreview{}, errors.New("엑셀 시트를 찾지 못했습니다")
	}
	rows, err := book.GetRows(sheets[0])
	if err != nil {
		return AssessmentImportPreview{}, fmt.Errorf("엑셀 행을 읽지 못했습니다: %w", err)
	}
	if len(rows) < 4 || len(rows[0]) < 5 {
		return AssessmentImportPreview{}, errors.New("나이스 수행평가 일괄등록의 3줄 머리글과 학생 행을 찾지 못했습니다")
	}
	cell := func(row, index int) string {
		if row >= len(rows) || index >= len(rows[row]) {
			return ""
		}
		return strings.TrimSpace(rows[row][index])
	}
	for _, expected := range []struct {
		index int
		name  string
	}{{0, "과목"}, {1, "반"}, {2, "번호"}, {3, "성명"}} {
		if cell(0, expected.index) != expected.name {
			return AssessmentImportPreview{}, fmt.Errorf("%d열 첫 머리글이 '%s'이어야 합니다", expected.index+1, expected.name)
		}
	}
	item := Assessment{ID: "", Title: strings.TrimSuffix(filepath.Base(path), filepath.Ext(path)), Subject: cell(3, 0), ClassName: cell(3, 1), Students: []AssessmentStudent{}, Domains: []AssessmentDomain{}, Scores: []AssessmentScore{}, Objections: []AssessmentObjection{}, History: []AssessmentHistory{}}
	meta := assessment.ParseAssessmentFilename(filepath.Base(path))
	item.SchoolYear = meta.SchoolYear
	item.Semester = meta.Semester
	item.Grade = meta.Grade
	item.Classroom = meta.Classroom
	if item.Subject == "" || item.ClassName == "" {
		return AssessmentImportPreview{}, errors.New("첫 학생 행의 과목과 반을 확인해 주세요")
	}
	for column := 4; column < len(rows[0]); column++ {
		name := cell(0, column)
		if name == "" {
			continue
		}
		maxText := strings.TrimSuffix(strings.TrimPrefix(cell(1, column), "만점("), ")")
		max, err := strconv.ParseFloat(strings.ReplaceAll(maxText, ",", ""), 64)
		if err != nil || max <= 0 {
			return AssessmentImportPreview{}, fmt.Errorf("'%s' 영역의 만점을 읽지 못했습니다", name)
		}
		domainID, _ := newAssessmentID()
		item.Domains = append(item.Domains, AssessmentDomain{ID: domainID, Name: name, MaxScore: max, Criteria: []AssessmentCriterion{}})
	}
	if len(item.Domains) == 0 {
		return AssessmentImportPreview{}, errors.New("평가 영역을 한 개 이상 찾지 못했습니다")
	}
	seenNumbers := map[string]int{}
	otherClasses, otherSubjects := map[string]bool{}, map[string]bool{}
	for rowIndex := 3; rowIndex < len(rows); rowIndex++ {
		number, name := cell(rowIndex, 2), cell(rowIndex, 3)
		if number == "" && name == "" {
			continue
		}
		if number == "" || name == "" {
			return AssessmentImportPreview{}, fmt.Errorf("엑셀 %d번째 줄의 번호 또는 성명이 비어 있습니다", rowIndex+1)
		}
		key := assessment.NormalizeStudentNumber(number)
		if first, duplicated := seenNumbers[key]; duplicated {
			return AssessmentImportPreview{}, fmt.Errorf("엑셀 %d번째 줄과 %d번째 줄의 번호(%s)가 같습니다. 한 반의 파일인지 확인해 주세요", first, rowIndex+1, number)
		}
		seenNumbers[key] = rowIndex + 1
		if classValue := cell(rowIndex, 1); classValue != "" && classValue != item.ClassName {
			otherClasses[classValue] = true
		}
		if subjectValue := cell(rowIndex, 0); subjectValue != "" && subjectValue != item.Subject {
			otherSubjects[subjectValue] = true
		}
		studentID, _ := newAssessmentID()
		item.Students = append(item.Students, AssessmentStudent{ID: studentID, Number: number, Name: name, Status: "재학"})
		score := AssessmentScore{StudentID: studentID, Domains: []AssessmentDomainScore{}}
		for domainIndex, domain := range item.Domains {
			value, err := parseAssessmentScore(cell(rowIndex, domainIndex+4))
			if err != nil {
				return AssessmentImportPreview{}, fmt.Errorf("엑셀 %d번째 줄(%s번 %s) %s 영역: %s", rowIndex+1, number, name, domain.Name, err)
			}
			if value != nil && (*value < 0 || *value > domain.MaxScore) {
				return AssessmentImportPreview{}, fmt.Errorf("엑셀 %d번째 줄(%s번 %s) %s 영역 점수 %g점이 0점~만점(%g점) 범위를 벗어납니다", rowIndex+1, number, name, domain.Name, *value, domain.MaxScore)
			}
			score.Domains = append(score.Domains, AssessmentDomainScore{DomainID: domain.ID, ImportedScore: value, Criteria: []AssessmentCriterionScore{}})
		}
		item.Scores = append(item.Scores, score)
	}
	if len(item.Students) == 0 {
		return AssessmentImportPreview{}, errors.New("학생 점수 행을 찾지 못했습니다")
	}
	warnings := []string{}
	if len(otherClasses) > 0 {
		warnings = append(warnings, fmt.Sprintf("파일에 %s반 말고 다른 반(%s)이 섞여 있습니다. 한 반씩 나눈 파일인지 확인해 주세요. 그대로 가져오면 모두 %s반으로 등록됩니다.", item.ClassName, joinSortedKeys(otherClasses), item.ClassName))
	}
	if len(otherSubjects) > 0 {
		warnings = append(warnings, fmt.Sprintf("파일에 %s 말고 다른 과목(%s)이 섞여 있습니다.", item.Subject, joinSortedKeys(otherSubjects)))
	}
	return AssessmentImportPreview{FileName: filepath.Base(path), Subject: item.Subject, ClassName: item.ClassName, FilenameSubject: meta.Subject, Assessment: item, Warnings: warnings}, nil
}

func joinSortedKeys(values map[string]bool) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}
