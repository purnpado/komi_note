package vault

import (
	"errors"
	"sort"
	"strings"
	"time"

	"TeacherNote/internal/submissions"
)

// SubmissionDocument는 담임이 관리하는 학생 제출서류 항목입니다.
type SubmissionDocument = submissions.SubmissionDocument

// SubmissionStatus는 서류 항목별 학생 제출 상태입니다.
type SubmissionStatus = submissions.SubmissionStatus

func (s *VaultStore) ListSubmissionDocuments() ([]SubmissionDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]SubmissionDocument{}, s.session.SubmissionDocuments...)
	sort.Slice(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return items, nil
}

func (s *VaultStore) SaveSubmissionDocument(item SubmissionDocument) (SubmissionDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return SubmissionDocument{}, errors.New("먼저 보관함을 열어 주세요")
	}
	item.Title = strings.TrimSpace(item.Title)
	item.DueDate = strings.TrimSpace(item.DueDate)
	item.Note = strings.TrimSpace(item.Note)
	if item.Title == "" {
		return SubmissionDocument{}, errors.New("제출서류 이름을 입력해 주세요")
	}
	if item.ID == "" {
		item.ID, _ = newSurveyID()
		item.CreatedAt = time.Now().In(time.Local).Format(time.RFC3339)
		item.Statuses = []SubmissionStatus{}
	}
	item.UpdatedAt = time.Now().In(time.Local).Format(time.RFC3339)
	for index := range s.session.SubmissionDocuments {
		if s.session.SubmissionDocuments[index].ID == item.ID {
			item.CreatedAt = s.session.SubmissionDocuments[index].CreatedAt
			item.Statuses = s.session.SubmissionDocuments[index].Statuses
			s.session.SubmissionDocuments[index] = item
			s.session.UpdatedAt = time.Now().UTC()
			return item, s.writeCurrentVaultLocked()
		}
	}
	s.session.SubmissionDocuments = append(s.session.SubmissionDocuments, item)
	s.session.UpdatedAt = time.Now().UTC()
	return item, s.writeCurrentVaultLocked()
}

func (s *VaultStore) DeleteSubmissionDocument(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for index, item := range s.session.SubmissionDocuments {
		if item.ID == id {
			s.session.SubmissionDocuments = append(s.session.SubmissionDocuments[:index], s.session.SubmissionDocuments[index+1:]...)
			s.session.UpdatedAt = time.Now().UTC()
			return s.writeCurrentVaultLocked()
		}
	}
	return errors.New("제출서류 항목을 찾지 못했습니다")
}

func (s *VaultStore) SaveSubmissionStatus(documentID, studentID, status, note string) (SubmissionDocument, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return SubmissionDocument{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(studentID) == "" {
		return SubmissionDocument{}, errors.New("학생을 선택해 주세요")
	}
	status = strings.TrimSpace(status)
	if status == "" {
		status = "미제출"
	}
	for index := range s.session.SubmissionDocuments {
		item := &s.session.SubmissionDocuments[index]
		if item.ID != documentID {
			continue
		}
		now := time.Now().In(time.Local).Format(time.RFC3339)
		found := false
		for statusIndex := range item.Statuses {
			if item.Statuses[statusIndex].StudentID == studentID {
				item.Statuses[statusIndex] = SubmissionStatus{StudentID: studentID, Status: status, Note: strings.TrimSpace(note), UpdatedAt: now}
				found = true
				break
			}
		}
		if !found {
			item.Statuses = append(item.Statuses, SubmissionStatus{StudentID: studentID, Status: status, Note: strings.TrimSpace(note), UpdatedAt: now})
		}
		item.UpdatedAt = now
		s.session.UpdatedAt = time.Now().UTC()
		if err := s.writeCurrentVaultLocked(); err != nil {
			return SubmissionDocument{}, err
		}
		return *item, nil
	}
	return SubmissionDocument{}, errors.New("제출서류 항목을 찾지 못했습니다")
}
