package vault

import (
	"errors"
	"fmt"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"TeacherNote/internal/assessment"
)

// Assessment는 수업용 수행평가 전체와 최소 수업 명렬을 함께 보관합니다.
type Assessment = assessment.Assessment

// AssessmentStudent에는 수업에 필요한 최소 식별값만 둡니다.
type AssessmentStudent = assessment.AssessmentStudent

type AssessmentDomain = assessment.AssessmentDomain
type AssessmentCriterion = assessment.AssessmentCriterion
type AssessmentScore = assessment.AssessmentScore
type AssessmentDomainScore = assessment.AssessmentDomainScore
type AssessmentCriterionScore = assessment.AssessmentCriterionScore
type AssessmentObjection = assessment.AssessmentObjection
type AssessmentHistory = assessment.AssessmentHistory

// AssessmentImportPreview는 나이스 파일 저장 전 교사가 확인하는 최소 미리보기입니다.
type AssessmentImportPreview struct {
	FileName        string     `json:"fileName"`
	Subject         string     `json:"subject"`
	ClassName       string     `json:"className"`
	FilenameSubject string     `json:"filenameSubject,omitempty"`
	Assessment      Assessment `json:"assessment"`
}

func newAssessmentID() (string, error) { return newSurveyID() }

func assessmentNow() string { return time.Now().In(time.Local).Format(time.RFC3339) }

func parseAssessmentScore(value string) (*float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	number, err := strconv.ParseFloat(strings.ReplaceAll(value, ",", ""), 64)
	if err != nil {
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
	for rowIndex := 3; rowIndex < len(rows); rowIndex++ {
		number, name := cell(rowIndex, 2), cell(rowIndex, 3)
		if number == "" && name == "" {
			continue
		}
		if number == "" || name == "" {
			return AssessmentImportPreview{}, fmt.Errorf("%d번째 학생 행의 번호 또는 성명이 비어 있습니다", rowIndex+1)
		}
		studentID, _ := newAssessmentID()
		item.Students = append(item.Students, AssessmentStudent{ID: studentID, Number: number, Name: name, Status: "재학"})
		score := AssessmentScore{StudentID: studentID, Domains: []AssessmentDomainScore{}}
		for domainIndex, domain := range item.Domains {
			value, err := parseAssessmentScore(cell(rowIndex, domainIndex+4))
			if err != nil {
				return AssessmentImportPreview{}, fmt.Errorf("%d번째 학생 %s", rowIndex+1, err)
			}
			score.Domains = append(score.Domains, AssessmentDomainScore{DomainID: domain.ID, ImportedScore: value, Criteria: []AssessmentCriterionScore{}})
		}
		item.Scores = append(item.Scores, score)
	}
	if len(item.Students) == 0 {
		return AssessmentImportPreview{}, errors.New("학생 점수 행을 찾지 못했습니다")
	}
	return AssessmentImportPreview{FileName: filepath.Base(path), Subject: item.Subject, ClassName: item.ClassName, FilenameSubject: meta.Subject, Assessment: item}, nil
}

func (s *VaultStore) ListAssessments() ([]Assessment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]Assessment{}, s.session.Assessments...)
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return items, nil
}

// GetAssessment는 QR 확인 서버와 교사 화면이 한 평가만 읽을 때 사용합니다.
func (s *VaultStore) GetAssessment(id string) (Assessment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Assessment{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for _, item := range s.session.Assessments {
		if item.ID == id {
			return item, nil
		}
	}
	return Assessment{}, errors.New("수행평가를 찾지 못했습니다")
}

func assessmentHistoryID() string {
	id, _ := newAssessmentID()
	return id
}

func (s *VaultStore) AddAssessmentHistory(assessmentID, eventType, studentID, domainID, detail string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Assessments {
		if s.session.Assessments[index].ID != assessmentID {
			continue
		}
		now := assessmentNow()
		s.session.Assessments[index].History = append(s.session.Assessments[index].History, AssessmentHistory{ID: assessmentHistoryID(), Type: eventType, StudentID: studentID, DomainID: domainID, Detail: strings.TrimSpace(detail), CreatedAt: now})
		s.session.Assessments[index].UpdatedAt = now
		s.session.UpdatedAt = time.Now().UTC()
		return s.writeCurrentVaultLocked()
	}
	return errors.New("수행평가를 찾지 못했습니다")
}

func (s *VaultStore) SubmitAssessmentObjection(assessmentID, domainID, studentID, content string) error {
	content = strings.TrimSpace(content)
	if content == "" {
		return errors.New("이의 내용을 입력해 주세요")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Assessments {
		item := &s.session.Assessments[index]
		if item.ID != assessmentID {
			continue
		}
		known := false
		for _, student := range item.Students {
			if student.ID == studentID {
				known = true
				break
			}
		}
		if !known {
			return errors.New("수업 명렬에서 학생을 찾지 못했습니다")
		}
		for _, objection := range item.Objections {
			if objection.StudentID == studentID && objection.Status != "답변 완료" {
				return errors.New("처리 중인 이의가 이미 있습니다")
			}
		}
		now := assessmentNow()
		item.Objections = append(item.Objections, AssessmentObjection{ID: assessmentHistoryID(), StudentID: studentID, DomainID: domainID, Content: content, Status: "확인 대기", SubmittedAt: now})
		item.History = append(item.History, AssessmentHistory{ID: assessmentHistoryID(), Type: "이의제출", StudentID: studentID, Detail: "학생이 점수 이의를 제출했습니다", CreatedAt: now})
		item.UpdatedAt = now
		s.session.UpdatedAt = time.Now().UTC()
		return s.writeCurrentVaultLocked()
	}
	return errors.New("수행평가를 찾지 못했습니다")
}

func (s *VaultStore) AnswerAssessmentObjection(assessmentID, objectionID, answer string) (Assessment, error) {
	answer = strings.TrimSpace(answer)
	if answer == "" {
		return Assessment{}, errors.New("답변을 입력해 주세요")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Assessment{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Assessments {
		item := &s.session.Assessments[index]
		if item.ID != assessmentID {
			continue
		}
		for objectionIndex := range item.Objections {
			objection := &item.Objections[objectionIndex]
			if objection.ID != objectionID {
				continue
			}
			now := assessmentNow()
			objection.Answer, objection.Status, objection.AnsweredAt = answer, "답변 완료", now
			item.History = append(item.History, AssessmentHistory{ID: assessmentHistoryID(), Type: "답변등록", StudentID: objection.StudentID, Detail: "교사가 이의 답변을 등록했습니다", CreatedAt: now})
			item.UpdatedAt = now
			s.session.UpdatedAt = time.Now().UTC()
			if err := s.writeCurrentVaultLocked(); err != nil {
				return Assessment{}, err
			}
			return *item, nil
		}
		return Assessment{}, errors.New("이의 기록을 찾지 못했습니다")
	}
	return Assessment{}, errors.New("수행평가를 찾지 못했습니다")
}

// DeleteAssessmentObjection은 답변이 끝난 이의의 본문과 답변을 암호화 보관함에서 삭제합니다.
// 처리 중인 이의는 학생 확인권을 보장하기 위해 삭제할 수 없습니다.
func (s *VaultStore) DeleteAssessmentObjection(assessmentID, objectionID string) (Assessment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Assessment{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Assessments {
		item := &s.session.Assessments[index]
		if item.ID != assessmentID {
			continue
		}
		for objectionIndex := range item.Objections {
			objection := item.Objections[objectionIndex]
			if objection.ID != objectionID {
				continue
			}
			if objection.Status != "답변 완료" {
				return Assessment{}, errors.New("답변 완료된 이의만 삭제할 수 있습니다")
			}
			item.Objections = append(item.Objections[:objectionIndex], item.Objections[objectionIndex+1:]...)
			now := assessmentNow()
			item.History = append(item.History, AssessmentHistory{ID: assessmentHistoryID(), Type: "이의삭제", StudentID: objection.StudentID, Detail: "교사가 답변 완료 이의 기록을 삭제했습니다", CreatedAt: now})
			item.UpdatedAt = now
			s.session.UpdatedAt = time.Now().UTC()
			if err := s.writeCurrentVaultLocked(); err != nil {
				return Assessment{}, err
			}
			return *item, nil
		}
		return Assessment{}, errors.New("이의 기록을 찾지 못했습니다")
	}
	return Assessment{}, errors.New("수행평가를 찾지 못했습니다")
}

// SaveAssessmentCriterionReason은 한 학생의 세부 기준 채점 사유만 즉시 저장합니다.
// 점수표의 다른 편집 내용은 함께 저장하지 않습니다.
func (s *VaultStore) SaveAssessmentCriterionReason(assessmentID, studentID, domainID, criterionID, reason string) (Assessment, error) {
	reason = strings.TrimSpace(reason)
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Assessment{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.Assessments {
		item := &s.session.Assessments[index]
		if item.ID != assessmentID {
			continue
		}
		studentExists := false
		for _, student := range item.Students {
			if student.ID == studentID {
				studentExists = true
				break
			}
		}
		if !studentExists {
			return Assessment{}, errors.New("수업 명렬에서 학생을 찾지 못했습니다")
		}
		criterionExists := false
		for _, domain := range item.Domains {
			if domain.ID != domainID {
				continue
			}
			for _, criterion := range domain.Criteria {
				if criterion.ID == criterionID && !isLegacyAssessmentImportedCriterion(domain, criterion) {
					criterionExists = true
					break
				}
			}
			break
		}
		if !criterionExists {
			return Assessment{}, errors.New("평가 영역의 세부 기준을 찾지 못했습니다")
		}
		var score *AssessmentScore
		for scoreIndex := range item.Scores {
			if item.Scores[scoreIndex].StudentID == studentID {
				score = &item.Scores[scoreIndex]
				break
			}
		}
		if score == nil {
			item.Scores = append(item.Scores, AssessmentScore{StudentID: studentID})
			score = &item.Scores[len(item.Scores)-1]
		}
		var domainScore *AssessmentDomainScore
		for domainIndex := range score.Domains {
			if score.Domains[domainIndex].DomainID == domainID {
				domainScore = &score.Domains[domainIndex]
				break
			}
		}
		if domainScore == nil {
			score.Domains = append(score.Domains, AssessmentDomainScore{DomainID: domainID})
			domainScore = &score.Domains[len(score.Domains)-1]
		}
		for criterionIndex := range domainScore.Criteria {
			if domainScore.Criteria[criterionIndex].CriterionID == criterionID {
				domainScore.Criteria[criterionIndex].Reason = reason
				item.UpdatedAt = assessmentNow()
				s.session.UpdatedAt = time.Now().UTC()
				if err := s.writeCurrentVaultLocked(); err != nil {
					return Assessment{}, err
				}
				return *item, nil
			}
		}
		domainScore.Criteria = append(domainScore.Criteria, AssessmentCriterionScore{CriterionID: criterionID, Reason: reason})
		item.UpdatedAt = assessmentNow()
		s.session.UpdatedAt = time.Now().UTC()
		if err := s.writeCurrentVaultLocked(); err != nil {
			return Assessment{}, err
		}
		return *item, nil
	}
	return Assessment{}, errors.New("수행평가를 찾지 못했습니다")
}

func (s *VaultStore) SaveAssessment(item Assessment) (Assessment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Assessment{}, errors.New("먼저 보관함을 열어 주세요")
	}
	item.Title, item.Subject, item.ClassName = strings.TrimSpace(item.Title), strings.TrimSpace(item.Subject), strings.TrimSpace(item.ClassName)
	item.Grade = strings.TrimSpace(item.Grade)
	if item.Grade != "" && item.Grade != "1" && item.Grade != "2" && item.Grade != "3" {
		return Assessment{}, errors.New("학년은 1·2·3학년 또는 미지정이어야 합니다")
	}
	if item.Title == "" || item.Subject == "" || item.ClassName == "" {
		return Assessment{}, errors.New("평가명·과목·수업 반을 입력해 주세요")
	}
	if len(item.Students) == 0 || len(item.Domains) == 0 {
		return Assessment{}, errors.New("학생과 평가 영역을 한 개 이상 등록해 주세요")
	}
	legacyImportedCriterion := map[string]string{}
	for domainIndex := range item.Domains {
		domain := &item.Domains[domainIndex]
		domain.Name = strings.TrimSpace(domain.Name)
		if domain.ID == "" {
			domain.ID, _ = newAssessmentID()
		}
		if domain.Name == "" || domain.MaxScore <= 0 {
			return Assessment{}, errors.New("평가 영역 이름과 만점을 확인해 주세요")
		}
		visibleCriteria := make([]AssessmentCriterion, 0, len(domain.Criteria))
		for criterionIndex := range domain.Criteria {
			criterion := &domain.Criteria[criterionIndex]
			criterion.Name = strings.TrimSpace(criterion.Name)
			criterion.Note = strings.TrimSpace(criterion.Note)
			// 이전 버전의 나이스 영역 총점 임시 기준은 세부 기준이 아니므로
			// 저장 시 학생별 ImportedScore로 이전하고 교사용 입력표에서는 제거한다.
			if isLegacyAssessmentImportedCriterion(*domain, *criterion) {
				legacyImportedCriterion[domain.ID] = criterion.ID
				continue
			}
			if criterion.ID == "" {
				criterion.ID, _ = newAssessmentID()
			}
			if criterion.Name == "" || criterion.MaxScore < 0 {
				return Assessment{}, errors.New("세부 기준 이름과 만점을 확인해 주세요")
			}
			visibleCriteria = append(visibleCriteria, *criterion)
		}
		domain.Criteria = visibleCriteria
	}
	for studentIndex := range item.Students {
		student := &item.Students[studentIndex]
		student.Number = strings.TrimSpace(student.Number)
		student.Name = strings.TrimSpace(student.Name)
		if student.ID == "" {
			student.ID, _ = newAssessmentID()
		}
		if student.Number == "" || student.Name == "" {
			return Assessment{}, errors.New("수업 명렬의 번호와 성명을 확인해 주세요")
		}
		if student.Status == "" {
			student.Status = "재학"
		}
	}
	studentIDs := map[string]bool{}
	for _, student := range item.Students {
		studentIDs[student.ID] = true
	}
	domainCriteria := map[string]map[string]float64{}
	for _, domain := range item.Domains {
		domainCriteria[domain.ID] = map[string]float64{}
		for _, criterion := range domain.Criteria {
			domainCriteria[domain.ID][criterion.ID] = criterion.MaxScore
		}
	}
	for scoreIndex := range item.Scores {
		score := &item.Scores[scoreIndex]
		if !studentIDs[score.StudentID] {
			return Assessment{}, errors.New("점수표에 수업 명렬에 없는 학생이 있습니다")
		}
		for domainIndex := range score.Domains {
			domain := &score.Domains[domainIndex]
			criteria, known := domainCriteria[domain.DomainID]
			if !known {
				return Assessment{}, errors.New("점수표에 알 수 없는 평가 영역이 있습니다")
			}
			if legacyID := legacyImportedCriterion[domain.DomainID]; legacyID != "" {
				filtered := make([]AssessmentCriterionScore, 0, len(domain.Criteria))
				for _, criterion := range domain.Criteria {
					if criterion.CriterionID == legacyID {
						if domain.ImportedScore == nil {
							domain.ImportedScore = criterion.Score
						}
						continue
					}
					filtered = append(filtered, criterion)
				}
				domain.Criteria = filtered
			}
			if domain.ImportedScore != nil {
				max := 0.0
				for _, configured := range item.Domains {
					if configured.ID == domain.DomainID {
						max = configured.MaxScore
						break
					}
				}
				if *domain.ImportedScore < 0 || *domain.ImportedScore > max {
					return Assessment{}, errors.New("나이스 원본 총점은 0점 이상 영역 만점 이하여야 합니다")
				}
			}
			for criterionIndex := range domain.Criteria {
				criterion := &domain.Criteria[criterionIndex]
				criterion.Reason = strings.TrimSpace(criterion.Reason)
				max, known := criteria[criterion.CriterionID]
				if !known {
					return Assessment{}, errors.New("점수표에 알 수 없는 세부 기준이 있습니다")
				}
				if criterion.Score != nil && (*criterion.Score < 0 || *criterion.Score > max) {
					return Assessment{}, errors.New("세부 기준 점수는 0점 이상 만점 이하여야 합니다")
				}
			}
		}
	}
	newAssessment := item.ID == ""
	now := assessmentNow()
	if item.ID == "" {
		item.ID, _ = newAssessmentID()
		item.CreatedAt = now
	}
	item.UpdatedAt = now
	for index := range s.session.Assessments {
		if s.session.Assessments[index].ID == item.ID {
			item.CreatedAt = s.session.Assessments[index].CreatedAt
			item.History = append([]AssessmentHistory(nil), s.session.Assessments[index].History...)
			s.session.Assessments[index] = item
			s.session.UpdatedAt = time.Now().UTC()
			if err := s.writeCurrentVaultLocked(); err != nil {
				return Assessment{}, err
			}
			return item, nil
		}
	}
	previousRosters := s.session.CourseRosters
	previousAssessments := s.session.Assessments
	previousUpdatedAt := s.session.UpdatedAt
	if newAssessment {
		if err := s.createCourseRosterIfNew(item); err != nil {
			return Assessment{}, err
		}
	}
	s.session.Assessments = append(s.session.Assessments, item)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.CourseRosters = previousRosters
		s.session.Assessments = previousAssessments
		s.session.UpdatedAt = previousUpdatedAt
		return Assessment{}, err
	}
	return item, nil
}

// isLegacyAssessmentImportedCriterion은 이전 버전에서 나이스 원본 총점을
// 임시 세부 기준으로 저장하던 형식을 식별한다. 이는 실제 세부 기준이 아니므로
// 화면 공개와 합계 계산에서 제외하고 ImportedScore로만 보관한다.
func isLegacyAssessmentImportedCriterion(domain AssessmentDomain, criterion AssessmentCriterion) bool {
	return strings.TrimSpace(criterion.Name) == "영역 점수" && criterion.MaxScore == domain.MaxScore
}

func assessmentImportedScore(domain AssessmentDomain, score AssessmentDomainScore) *float64 {
	if score.ImportedScore != nil {
		return score.ImportedScore
	}
	for _, criterion := range domain.Criteria {
		if !isLegacyAssessmentImportedCriterion(domain, criterion) {
			continue
		}
		for _, value := range score.Criteria {
			if value.CriterionID == criterion.ID {
				return value.Score
			}
		}
	}
	return nil
}

func (s *VaultStore) DeleteAssessment(id string, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "수행평가 삭제" {
		return errors.New("삭제 확인 문구가 일치하지 않습니다")
	}
	for index, item := range s.session.Assessments {
		if item.ID == id {
			s.session.Assessments = append(s.session.Assessments[:index], s.session.Assessments[index+1:]...)
			s.session.UpdatedAt = time.Now().UTC()
			return s.writeCurrentVaultLocked()
		}
	}
	return errors.New("수행평가를 찾지 못했습니다")
}
