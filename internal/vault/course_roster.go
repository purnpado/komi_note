package vault

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// CourseRoster는 수행평가와 독립적으로 보관하는 최소 수업 명렬입니다.
type CourseRoster struct {
	ID         string                `json:"id"`
	SchoolYear string                `json:"schoolYear"`
	Grade      string                `json:"grade"`
	ClassName  string                `json:"className"`
	Students   []CourseRosterStudent `json:"students"`
	Changes    []CourseRosterChange  `json:"changes,omitempty"`
}
type CourseRosterStudent struct {
	Number string `json:"number"`
	Name   string `json:"name"`
	Status string `json:"status,omitempty"`
}
type CourseRosterPreview struct {
	Status  string   `json:"status"`
	Message string   `json:"message"`
	Added   []string `json:"added"`
	Missing []string `json:"missing"`
}

var validCourseYear = regexp.MustCompile(`^[0-9]{4}$`)
var explicitCourseGrade = regexp.MustCompile(`^([1-3])\s*(?:학년\s*|-)\s*[0-9]+`)

func rosterKey(year, grade, className string) string {
	return strings.TrimSpace(year) + "|" + strings.TrimSpace(grade) + "|" + strings.TrimSpace(className)
}
func previewCourseRoster(item Assessment, rosters []CourseRoster) CourseRosterPreview {
	result := CourseRosterPreview{Added: []string{}, Missing: []string{}}
	if !validCourseYear.MatchString(strings.TrimSpace(item.SchoolYear)) || (item.Grade != "1" && item.Grade != "2" && item.Grade != "3") || strings.TrimSpace(item.ClassName) == "" {
		result.Status, result.Message = "보류", "학년도·학년·반을 확인할 수 없어 수업 명렬은 만들지 않습니다."
		return result
	}
	incoming := map[string]string{}
	if match := explicitCourseGrade.FindStringSubmatch(strings.TrimSpace(item.ClassName)); len(match) > 1 && match[1] != item.Grade {
		result.Status, result.Message = "보류", "파일의 반에 표시된 학년과 선택한 학년이 달라 수업 명렬을 만들지 않습니다."
		return result
	}

	for _, student := range item.Students {
		number, name := strings.TrimSpace(student.Number), strings.TrimSpace(student.Name)
		if number == "" || name == "" || incoming[number] != "" {
			result.Status, result.Message = "보류", "번호가 비었거나 중복되어 수업 명렬을 자동 생성하지 않습니다."
			return result
		}
		incoming[number] = name
	}
	if len(incoming) == 0 {
		result.Status, result.Message = "보류", "가져온 학생이 없어 수업 명렬을 만들지 않습니다."
		return result
	}
	for _, roster := range rosters {
		if rosterKey(roster.SchoolYear, roster.Grade, roster.ClassName) != rosterKey(item.SchoolYear, item.Grade, item.ClassName) {
			continue
		}
		existing := map[string]string{}
		for _, student := range roster.Students {
			if student.Status != "전출" {
				existing[student.Number] = student.Name
			}
		}
		for number, name := range incoming {
			if existing[number] != name {
				result.Added = append(result.Added, fmt.Sprintf("%s번 %s", number, name))
			}
		}
		for number, name := range existing {
			if incoming[number] != name {
				result.Missing = append(result.Missing, fmt.Sprintf("%s번 %s", number, name))
			}
		}
		sort.Strings(result.Added)
		sort.Strings(result.Missing)
		if len(result.Added) > 0 || len(result.Missing) > 0 {
			result.Status, result.Message = "차이", "기존 수업 명렬과 차이가 있어 자동 변경하지 않습니다."
		} else {
			result.Status, result.Message = "일치", "기존 수업 명렬과 일치합니다."
		}
		return result
	}
	result.Status, result.Message = "신규", "수행평가 등록 시 수업 명렬이 함께 생성됩니다."
	return result
}
func (s *VaultStore) PreviewCourseRoster(item Assessment) (CourseRosterPreview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return CourseRosterPreview{}, fmt.Errorf("먼저 보관함을 열어 주세요")
	}
	return previewCourseRoster(item, s.session.CourseRosters), nil
}
func (s *VaultStore) ListCourseRosters() ([]CourseRoster, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, fmt.Errorf("먼저 보관함을 열어 주세요")
	}
	result := make([]CourseRoster, len(s.session.CourseRosters))
	for i, roster := range s.session.CourseRosters {
		result[i] = roster
		result[i].Students = append([]CourseRosterStudent{}, roster.Students...)
		result[i].Changes = append([]CourseRosterChange(nil), roster.Changes...)
	}
	return result, nil
}

// 호출자는 보관함 잠금을 소유해야 합니다.
func (s *VaultStore) createCourseRosterIfNew(item Assessment) error {
	if previewCourseRoster(item, s.session.CourseRosters).Status != "신규" {
		return nil
	}
	id, err := newAssessmentID()
	if err != nil {
		return err
	}
	roster := CourseRoster{ID: id, SchoolYear: strings.TrimSpace(item.SchoolYear), Grade: strings.TrimSpace(item.Grade), ClassName: strings.TrimSpace(item.ClassName), Students: []CourseRosterStudent{}}
	for _, student := range item.Students {
		roster.Students = append(roster.Students, CourseRosterStudent{Number: strings.TrimSpace(student.Number), Name: strings.TrimSpace(student.Name)})
	}
	s.session.CourseRosters = append(s.session.CourseRosters, roster)
	return nil
}
