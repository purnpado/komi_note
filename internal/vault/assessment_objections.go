package vault

import (
	"errors"
	"strings"
	"time"
)

// 수행평가 이의 신청·답변·삭제 저장입니다.

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
			if objection.StudentID == studentID && objection.Status != "답변 완료" && (objection.DomainID == "" || objection.DomainID == domainID) {
				return errors.New("이 영역에 처리 중인 이의가 이미 있습니다")
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
