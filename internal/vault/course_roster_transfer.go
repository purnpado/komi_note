package vault

import (
	"errors"
	"reflect"
	"strings"
	"time"
)

func (s *VaultStore) existingAssessmentForRoster(id, year, grade string) (Assessment, error) {
	for _, item := range s.session.Assessments {
		if item.ID == id {
			item.SchoolYear = strings.TrimSpace(year)
			item.Grade = strings.TrimSpace(grade)
			return item, nil
		}
	}
	return Assessment{}, errors.New("수행평가를 찾지 못했습니다")
}

func (s *VaultStore) PreviewExistingCourseRoster(id, year, grade string) (CourseRosterPreview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return CourseRosterPreview{}, errors.New("먼저 보관함을 열어 주세요")
	}
	item, err := s.existingAssessmentForRoster(id, year, grade)
	if err != nil {
		return CourseRosterPreview{}, err
	}
	return previewCourseRoster(item, s.session.CourseRosters), nil
}

// 평가를 바꾸지 않고 검토한 명렬만 생성하거나 새로운 번호를 추가합니다.
func (s *VaultStore) TransferExistingCourseRoster(id, year, grade string, expected CourseRosterPreview, allowAdd bool) (CourseRosterPreview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return CourseRosterPreview{}, errors.New("먼저 보관함을 열어 주세요")
	}
	item, err := s.existingAssessmentForRoster(id, year, grade)
	if err != nil {
		return CourseRosterPreview{}, err
	}
	actual := previewCourseRoster(item, s.session.CourseRosters)
	if !reflect.DeepEqual(actual, expected) {
		return CourseRosterPreview{}, errors.New("명렬이 변경되었습니다. 다시 비교해 주세요")
	}
	switch actual.Status {
	case "보류":
		return CourseRosterPreview{}, errors.New(actual.Message)
	case "일치":
		actual.Message = "기존 수업 명렬과 일치하여 중복 생성하지 않았습니다."
		return actual, nil
	case "차이":
		if !allowAdd {
			return CourseRosterPreview{}, errors.New("명렬의 차이를 먼저 확인해 주세요")
		}
	case "신규":
	default:
		return CourseRosterPreview{}, errors.New("명렬 비교 결과를 확인해 주세요")
	}
	oldRosters, oldUpdated := s.session.CourseRosters, s.session.UpdatedAt
	if actual.Status == "신규" {
		if err := s.createCourseRosterIfNew(item); err != nil {
			return CourseRosterPreview{}, err
		}
		actual.Message = "수업 명렬을 만들었습니다."
	} else {
		rosters := append([]CourseRoster(nil), s.session.CourseRosters...)
		for i := range rosters {
			if rosterKey(rosters[i].SchoolYear, rosters[i].Grade, rosters[i].ClassName) != rosterKey(item.SchoolYear, item.Grade, item.ClassName) {
				continue
			}
			existing := map[string]string{}
			statuses := map[string]string{}
			for _, student := range rosters[i].Students {
				existing[student.Number] = student.Name
				statuses[student.Number] = student.Status
			}
			additions := []CourseRosterStudent{}
			for _, student := range item.Students {
				number, name := strings.TrimSpace(student.Number), strings.TrimSpace(student.Name)
				if previous, exists := existing[number]; exists {
					if statuses[number] == "전출" {
						return CourseRosterPreview{}, errors.New("전출 학생이 포함되어 있습니다. 수업 명렬에서 재학 상태를 직접 확인해 주세요.")
					}
					if previous != name {
						return CourseRosterPreview{}, errors.New("같은 번호의 이름이 달라 자동 추가할 수 없습니다. 기존 명렬은 변경하지 않았습니다.")
					}
				} else {
					additions = append(additions, CourseRosterStudent{Number: number, Name: name})
				}
			}
			if len(additions) == 0 {
				return CourseRosterPreview{}, errors.New("추가할 새 번호가 없습니다. 기존 명렬은 변경하지 않았습니다.")
			}
			rosters[i].Students = append(append([]CourseRosterStudent(nil), rosters[i].Students...), additions...)
			rosters[i].Changes = append([]CourseRosterChange(nil), rosters[i].Changes...)
			for _, student := range additions {
				rosters[i].Changes = append(rosters[i].Changes, CourseRosterChange{Action: "평가에서 추가", At: time.Now().In(time.Local).Format(time.RFC3339), Number: student.Number})
			}
			break
		}
		s.session.CourseRosters = rosters
		actual.Status, actual.Message = "추가", "새 번호의 학생을 추가했습니다. 기존 학생은 변경하지 않았습니다."
	}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.CourseRosters, s.session.UpdatedAt = oldRosters, oldUpdated
		return CourseRosterPreview{}, err
	}
	return actual, nil
}
