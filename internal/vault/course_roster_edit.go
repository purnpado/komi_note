package vault

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"
)

// CourseRosterChange는 학생 이름을 남기지 않는 수업 명렬 변경 이력입니다.
type CourseRosterChange struct {
	Action         string `json:"action"`
	At             string `json:"at"`
	PreviousNumber string `json:"previousNumber,omitempty"`
	Number         string `json:"number,omitempty"`
}

func (s *VaultStore) UpdateCourseRosterStudent(rosterID string, expected CourseRoster, action, originalNumber string, next CourseRosterStudent, confirmation string) (CourseRoster, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return CourseRoster{}, errors.New("먼저 보관함을 열어 주세요")
	}
	index := -1
	for i := range s.session.CourseRosters {
		if s.session.CourseRosters[i].ID == rosterID {
			index = i
			break
		}
	}
	if index < 0 {
		return CourseRoster{}, errors.New("수업 명렬을 찾지 못했습니다")
	}
	current := s.session.CourseRosters[index]
	if !reflect.DeepEqual(current, expected) {
		return CourseRoster{}, errors.New("수업 명렬이 변경되었습니다. 다시 확인해 주세요")
	}
	if action != "추가" && action != "수정" && action != "삭제" {
		return CourseRoster{}, errors.New("명렬 작업을 확인해 주세요")
	}
	originalNumber = strings.TrimSpace(originalNumber)
	next.Number, next.Name, next.Status = strings.TrimSpace(next.Number), strings.TrimSpace(next.Name), strings.TrimSpace(next.Status)
	target := -1
	if action != "추가" {
		for i, student := range current.Students {
			if student.Number == originalNumber {
				target = i
				break
			}
		}
		if target < 0 {
			return CourseRoster{}, errors.New("수정할 학생을 찾지 못했습니다")
		}
	}
	if action == "삭제" {
		if confirmation != "수업 명렬 학생 삭제" {
			return CourseRoster{}, errors.New("삭제 확인 문구가 일치하지 않습니다")
		}
	} else {
		if next.Number == "" || next.Name == "" {
			return CourseRoster{}, errors.New("번호와 이름을 입력해 주세요")
		}
		if next.Status == "" {
			next.Status = "재학"
		}
		if next.Status != "재학" && next.Status != "전출" {
			return CourseRoster{}, errors.New("학생 상태를 확인해 주세요")
		}
		for i, student := range current.Students {
			if i != target && student.Number == next.Number {
				return CourseRoster{}, fmt.Errorf("이미 사용 중인 번호입니다: %s", next.Number)
			}
		}
	}
	updated := current
	updated.Students = append([]CourseRosterStudent{}, current.Students...)
	updated.Changes = append([]CourseRosterChange(nil), current.Changes...)
	entry := CourseRosterChange{Action: action, At: time.Now().In(time.Local).Format(time.RFC3339), PreviousNumber: originalNumber}
	switch action {
	case "추가":
		updated.Students = append(updated.Students, next)
		entry.Number = next.Number
	case "수정":
		updated.Students[target] = next
		entry.Number = next.Number
	case "삭제":
		updated.Students = append(updated.Students[:target], updated.Students[target+1:]...)
	}
	updated.Changes = append(updated.Changes, entry)
	oldRosters, oldUpdated := s.session.CourseRosters, s.session.UpdatedAt
	rosters := append([]CourseRoster(nil), oldRosters...)
	rosters[index] = updated
	s.session.CourseRosters, s.session.UpdatedAt = rosters, time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.CourseRosters, s.session.UpdatedAt = oldRosters, oldUpdated
		return CourseRoster{}, err
	}
	return updated, nil
}
