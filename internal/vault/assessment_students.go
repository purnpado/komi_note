package vault

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"TeacherNote/internal/assessment"
)

// AddAssessmentStudentResult는 전입생 추가 결과와 수업 명렬 반영 안내다.
type AddAssessmentStudentResult struct {
	Assessment    Assessment `json:"assessment"`
	RosterMessage string     `json:"rosterMessage"`
	RosterChanged bool       `json:"rosterChanged"`
}

// AddAssessmentStudent는 학기 중 전입생을 평가에 추가한다. skippedDomains는 전입 전에 이미 끝난 영역이다.
// 같은 학년도·학년·반 수업 명렬이 있으면 그 명렬에도 넣는다(같은 번호가 이미 있으면 바꾸지 않고 안내).
func (s *VaultStore) AddAssessmentStudent(assessmentID, number, name, transferIn string, skippedDomains []string) (AddAssessmentStudentResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AddAssessmentStudentResult{}, errors.New("먼저 보관함을 열어 주세요")
	}
	number, name, transferIn = strings.TrimSpace(number), strings.TrimSpace(name), strings.TrimSpace(transferIn)
	if assessment.NormalizeStudentNumber(number) == "" || name == "" {
		return AddAssessmentStudentResult{}, errors.New("번호와 이름을 입력해 주세요")
	}
	if len([]rune(name)) > 30 || len(number) > 10 {
		return AddAssessmentStudentResult{}, errors.New("번호·이름을 확인해 주세요")
	}
	if transferIn != "" {
		if _, err := time.Parse("2006-01-02", transferIn); err != nil {
			return AddAssessmentStudentResult{}, errors.New("전입일을 확인해 주세요")
		}
	}
	index := -1
	for i := range s.session.Assessments {
		if s.session.Assessments[i].ID == assessmentID {
			index = i
		}
	}
	if index < 0 {
		return AddAssessmentStudentResult{}, errors.New("평가를 찾지 못했습니다")
	}
	item := s.session.Assessments[index]
	for _, student := range item.Students {
		if assessment.NormalizeStudentNumber(student.Number) == assessment.NormalizeStudentNumber(number) {
			return AddAssessmentStudentResult{}, fmt.Errorf("이미 %s번 %s 학생이 있습니다. 번호를 확인해 주세요", student.Number, student.Name)
		}
	}
	known := map[string]bool{}
	for _, domain := range item.Domains {
		known[domain.ID] = true
	}
	skipped := []string{}
	for _, id := range skippedDomains {
		if !known[id] {
			return AddAssessmentStudentResult{}, errors.New("평가 영역을 다시 골라 주세요")
		}
		skipped = append(skipped, id)
	}
	id, err := newAssessmentID()
	if err != nil {
		return AddAssessmentStudentResult{}, err
	}
	historyID, err := newAssessmentID()
	if err != nil {
		return AddAssessmentStudentResult{}, err
	}
	now := time.Now().In(time.Local).Format(time.RFC3339)
	next := item
	next.Students = append(append([]AssessmentStudent{}, item.Students...), AssessmentStudent{ID: id, Number: number, Name: name, Status: "전입", TransferIn: transferIn, SkippedDomains: skipped})
	next.History = append(append([]AssessmentHistory{}, item.History...), AssessmentHistory{ID: historyID, Type: "학생추가", StudentID: id, Detail: "전입생 추가", CreatedAt: now})
	next.UpdatedAt = now

	previousAssessments, previousRosters, previousUpdated := s.session.Assessments, s.session.CourseRosters, s.session.UpdatedAt
	assessments := append([]Assessment{}, previousAssessments...)
	assessments[index] = next
	s.session.Assessments = assessments
	result := AddAssessmentStudentResult{Assessment: next}
	result.RosterMessage, result.RosterChanged = s.addToCourseRosterLocked(next, number, name, now)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Assessments, s.session.CourseRosters, s.session.UpdatedAt = previousAssessments, previousRosters, previousUpdated
		return AddAssessmentStudentResult{}, err
	}
	return result, nil
}

func (s *VaultStore) addToCourseRosterLocked(item Assessment, number, name, now string) (string, bool) {
	for i, roster := range s.session.CourseRosters {
		if rosterKey(roster.SchoolYear, roster.Grade, roster.ClassName) != rosterKey(item.SchoolYear, item.Grade, item.ClassName) {
			continue
		}
		for _, student := range roster.Students {
			if assessment.NormalizeStudentNumber(student.Number) == assessment.NormalizeStudentNumber(number) {
				if strings.TrimSpace(student.Name) == name {
					return "수업 명렬에는 이미 있는 학생입니다.", false
				}
				return fmt.Sprintf("수업 명렬의 %s번은 %s 학생이라 명렬은 바꾸지 않았습니다. 수업 명렬에서 확인해 주세요.", student.Number, student.Name), false
			}
		}
		updated := roster
		updated.Students = append(append([]CourseRosterStudent{}, roster.Students...), CourseRosterStudent{Number: number, Name: name, Status: "재학"})
		updated.Changes = append(append([]CourseRosterChange(nil), roster.Changes...), CourseRosterChange{Action: "추가", At: now, Number: number})
		rosters := append([]CourseRoster(nil), s.session.CourseRosters...)
		rosters[i] = updated
		s.session.CourseRosters = rosters
		return "같은 반 수업 명렬에도 추가했습니다.", true
	}
	return "같은 반 수업 명렬이 없어 평가에만 추가했습니다.", false
}
