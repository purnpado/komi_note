package vault

import (
	"errors"
	"sort"
	"time"

	"TeacherNote/internal/cleaning"
)

// CleaningZone은 교사가 관리하는 청소 담당 구역입니다.
type CleaningZone = cleaning.CleaningZone

// CleaningAssignment은 한 학생의 청소구역 배정입니다.
type CleaningAssignment = cleaning.CleaningAssignment

// CleaningPlan은 기간별 청소구역 편성표와 교사용 이력을 암호화 보관합니다.
type CleaningPlan = cleaning.CleaningPlan

// ListCleaningPlans는 최신 순서의 청소구역 편성 이력을 반환합니다.
func (s *VaultStore) ListCleaningPlans() ([]CleaningPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	plans := append([]CleaningPlan(nil), s.session.CleaningPlans...)
	sort.SliceStable(plans, func(i, j int) bool { return plans[i].CreatedAt > plans[j].CreatedAt })
	return plans, nil
}

// SaveCleaningPlan은 청소구역 편성표를 자리배치와 독립적으로 저장합니다.
func (s *VaultStore) SaveCleaningPlan(plan CleaningPlan) (CleaningPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return CleaningPlan{}, errors.New("먼저 보관함을 열어 주세요")
	}
	plan = cleaning.NormaliseCleaningPlan(plan)
	if plan.ID == "" {
		id, err := newStudentID()
		if err != nil {
			return CleaningPlan{}, err
		}
		plan.ID = id
	}
	if plan.CreatedAt == "" {
		plan.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	updated := false
	for index := range s.session.CleaningPlans {
		if s.session.CleaningPlans[index].ID == plan.ID {
			s.session.CleaningPlans[index] = plan
			updated = true
			break
		}
	}
	if !updated {
		s.session.CleaningPlans = append(s.session.CleaningPlans, plan)
	}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return CleaningPlan{}, err
	}
	return plan, nil
}

// DeleteCleaningPlan은 선택한 청소구역 편성 이력만 삭제합니다.
func (s *VaultStore) DeleteCleaningPlan(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for index, plan := range s.session.CleaningPlans {
		if plan.ID == id {
			s.session.CleaningPlans = append(s.session.CleaningPlans[:index], s.session.CleaningPlans[index+1:]...)
			s.session.UpdatedAt = time.Now().UTC()
			return s.writeCurrentVaultLocked()
		}
	}
	return errors.New("청소구역 편성 이력을 찾지 못했습니다")
}
