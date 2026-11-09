package vault

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

// 상담 기록 저장·확인 완료·삭제와 수정 이력입니다.

// Consultation은 학생별로 누적하는 상담 기록입니다.
type Consultation struct {
	ID           string `json:"id"`
	StudentID    string `json:"studentId"`
	ParentID     string `json:"parentId"`
	RootID       string `json:"rootId"`
	Date         string `json:"date"`
	Type         string `json:"type"`
	Content      string `json:"content"`
	FollowUpDate string `json:"followUpDate"`
	FollowUpDone bool   `json:"followUpDone"`
	// ManualDone은 후속 기록 없이 교사가 직접 "확인 완료"로 끝낸 표시입니다.
	ManualDone bool   `json:"manualDone,omitempty"`
	RecordedAt string `json:"recordedAt"`
	// UpdatedAt은 마지막으로 고친 시각, Revisions는 고치기 전 내용입니다(최근 것부터 maxConsultationRevisions개).
	UpdatedAt string                 `json:"updatedAt,omitempty"`
	Revisions []ConsultationRevision `json:"revisions,omitempty"`
}

// ConsultationRevision은 상담 기록을 고치기 전의 값입니다.
type ConsultationRevision struct {
	EditedAt     string `json:"editedAt"`
	Date         string `json:"date"`
	Type         string `json:"type"`
	Content      string `json:"content"`
	FollowUpDate string `json:"followUpDate"`
}

const maxConsultationRevisions = 20

const (
	maxConsultationContent = 5000
	maxConsultationType    = 20
)

// sortConsultations는 상담 날짜 최신 순, 같은 날짜는 나중에 쓴 기록이 먼저 오도록 정렬합니다.
func sortConsultations(items []Consultation) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Date != items[j].Date {
			return items[i].Date > items[j].Date
		}
		return items[i].RecordedAt > items[j].RecordedAt
	})
}

// refreshFollowUpDone은 후속 기록이 있거나 직접 완료한 기록만 확인 완료로 맞춥니다.
func refreshFollowUpDone(items []Consultation) {
	hasChild := map[string]bool{}
	for _, item := range items {
		if item.ParentID != "" {
			hasChild[item.ParentID] = true
		}
	}
	for i := range items {
		items[i].FollowUpDone = hasChild[items[i].ID] || items[i].ManualDone
	}
}

func (s *VaultStore) ListConsultations(studentID string) ([]Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := []Consultation{}
	for _, item := range s.session.Consultations {
		if item.StudentID == studentID {
			items = append(items, item)
		}
	}
	sortConsultations(items)
	return items, nil
}

// ListAllConsultations는 상담 기록 메뉴에서 사용하는 전체 누적 기록을 반환합니다.
func (s *VaultStore) ListAllConsultations() ([]Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]Consultation{}, s.session.Consultations...)
	sortConsultations(items)
	return items, nil
}

func (s *VaultStore) SaveConsultation(item Consultation) (Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Consultation{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if _, index := findStudent(s.session.Students, item.StudentID); index < 0 {
		return Consultation{}, errors.New("학생을 찾지 못했습니다")
	}
	item.Date = strings.TrimSpace(item.Date)
	item.Type = strings.TrimSpace(item.Type)
	item.Content = strings.TrimSpace(item.Content)
	item.FollowUpDate = strings.TrimSpace(item.FollowUpDate)
	if item.Date == "" || item.Type == "" || item.Content == "" {
		return Consultation{}, errors.New("상담 날짜, 유형, 내용을 입력해 주세요")
	}
	if _, err := time.Parse("2006-01-02", item.Date); err != nil {
		return Consultation{}, errors.New("상담 날짜를 확인해 주세요")
	}
	if item.FollowUpDate != "" {
		if _, err := time.Parse("2006-01-02", item.FollowUpDate); err != nil {
			return Consultation{}, errors.New("다음 확인 예정일을 확인해 주세요")
		}
		if item.FollowUpDate < item.Date {
			return Consultation{}, errors.New("다음 확인 예정일은 상담 날짜와 같거나 그 뒤로 정해 주세요")
		}
	}
	if utf8.RuneCountInString(item.Content) > maxConsultationContent {
		return Consultation{}, fmt.Errorf("상담 내용은 %d자 이하로 입력해 주세요", maxConsultationContent)
	}
	if utf8.RuneCountInString(item.Type) > maxConsultationType {
		return Consultation{}, fmt.Errorf("상담 유형은 %d자 이하로 입력해 주세요", maxConsultationType)
	}
	// 저장에 실패하면 이 상태로 되돌린다(메모리에만 남아 다음 저장 때 섞여 들어가지 않게).
	previous := append([]Consultation{}, s.session.Consultations...)
	if item.ID == "" {
		item.ManualDone = false
		item.Revisions = nil
		item.UpdatedAt = ""
		if item.ParentID != "" {
			found := false
			for _, parent := range s.session.Consultations {
				if parent.ID == item.ParentID && parent.StudentID == item.StudentID {
					item.RootID = parent.RootID
					if item.RootID == "" {
						item.RootID = parent.ID
					}
					found = true
					break
				}
			}
			if !found {
				return Consultation{}, errors.New("연결할 상담 기록을 찾지 못했습니다")
			}
		}
		id, err := newStudentID()
		if err != nil {
			return Consultation{}, err
		}
		item.ID = id
		item.RecordedAt = time.Now().In(time.Local).Format(time.RFC3339)
		if item.RootID == "" {
			item.RootID = item.ID
		}
		// 후속 기록이 남으면 바로 앞 기록의 확인은 끝난 것으로 봅니다(refreshFollowUpDone).
		s.session.Consultations = append(s.session.Consultations, item)
	} else {
		index := -1
		for i := range s.session.Consultations {
			if s.session.Consultations[i].ID == item.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return Consultation{}, errors.New("수정할 상담 기록을 찾지 못했습니다")
		}
		existing := s.session.Consultations[index]
		if existing.StudentID != item.StudentID {
			return Consultation{}, errors.New("학생을 바꿔 상담 기록을 수정할 수 없습니다")
		}
		// 연결·작성 시각·완료 상태는 화면 값이 아니라 보관함 값을 유지합니다.
		item.ParentID = existing.ParentID
		item.RootID = existing.RootID
		item.RecordedAt = existing.RecordedAt
		item.ManualDone = existing.ManualDone
		if item.FollowUpDate == "" {
			item.ManualDone = false
		}
		// 이력은 화면이 보낸 값이 아니라 보관함 값을 이어 쓰고, 실제로 바뀐 경우에만 고치기 전 값을 남깁니다.
		item.Revisions = append([]ConsultationRevision{}, existing.Revisions...)
		item.UpdatedAt = existing.UpdatedAt
		if existing.Date != item.Date || existing.Type != item.Type || existing.Content != item.Content || existing.FollowUpDate != item.FollowUpDate {
			now := time.Now().In(time.Local).Format(time.RFC3339)
			revision := ConsultationRevision{EditedAt: now, Date: existing.Date, Type: existing.Type, Content: existing.Content, FollowUpDate: existing.FollowUpDate}
			item.Revisions = append([]ConsultationRevision{revision}, item.Revisions...)
			if len(item.Revisions) > maxConsultationRevisions {
				item.Revisions = item.Revisions[:maxConsultationRevisions]
			}
			item.UpdatedAt = now
		}
		s.session.Consultations[index] = item
	}
	refreshFollowUpDone(s.session.Consultations)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return Consultation{}, err
	}
	for _, saved := range s.session.Consultations {
		if saved.ID == item.ID {
			return saved, nil
		}
	}
	return item, nil
}

// SetConsultationFollowUpDone은 후속 기록 없이 "확인 완료"로 끝내거나(done) 그 표시를 취소합니다.
// 후속 기록이 있는 기록은 이미 완료이므로 취소해도 완료로 남습니다.
func (s *VaultStore) SetConsultationFollowUpDone(id string, done bool) (Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Consultation{}, errors.New("먼저 보관함을 열어 주세요")
	}
	index := -1
	for i := range s.session.Consultations {
		if s.session.Consultations[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return Consultation{}, errors.New("상담 기록을 찾지 못했습니다")
	}
	if done && s.session.Consultations[index].FollowUpDate == "" {
		return Consultation{}, errors.New("다음 확인 예정일이 있는 기록만 확인 완료로 표시할 수 있습니다")
	}
	previous := append([]Consultation{}, s.session.Consultations...)
	s.session.Consultations[index].ManualDone = done
	refreshFollowUpDone(s.session.Consultations)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return Consultation{}, err
	}
	return s.session.Consultations[index], nil
}

// DeleteConsultation은 선택한 상담 기록과 연결된 모든 후속 기록을 함께 삭제합니다.
func (s *VaultStore) DeleteConsultation(id string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return 0, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(id) == "" {
		return 0, errors.New("삭제할 상담 기록을 찾지 못했습니다")
	}
	removeIDs := map[string]bool{id: true}
	changed := true
	for changed {
		changed = false
		for _, item := range s.session.Consultations {
			if removeIDs[item.ParentID] && !removeIDs[item.ID] {
				removeIDs[item.ID] = true
				changed = true
			}
		}
	}
	kept := make([]Consultation, 0, len(s.session.Consultations))
	for _, item := range s.session.Consultations {
		if !removeIDs[item.ID] {
			kept = append(kept, item)
		}
	}
	if len(kept) == len(s.session.Consultations) {
		return 0, errors.New("삭제할 상담 기록을 찾지 못했습니다")
	}
	previous := s.session.Consultations
	refreshFollowUpDone(kept)
	s.session.Consultations = kept
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return 0, err
	}
	return len(removeIDs), nil
}
