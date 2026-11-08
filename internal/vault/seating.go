package vault

import (
	"errors"
	"sort"
	"time"

	"TeacherNote/internal/seating"
)

// SeatingSeat는 자리 배치도 안의 한 좌석과 배정 학생을 나타냅니다.
type SeatingSeat = seating.SeatingSeat

// SeatingPlan은 수동 자리뽑기와 QR 참여형 희망 경쟁의 설정·결과를 암호화 보관합니다.
type SeatingPlan = seating.SeatingPlan

func normaliseSeatingPlan(plan SeatingPlan) SeatingPlan {
	return seating.NormaliseSeatingPlan(plan)
}

// ListSeatingPlans는 저장된 자리 배치 이력을 최신순으로 반환합니다.
func (s *VaultStore) ListSeatingPlans() ([]SeatingPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	plans := append([]SeatingPlan(nil), s.session.SeatingPlans...)
	sort.SliceStable(plans, func(i, j int) bool { return plans[i].CreatedAt > plans[j].CreatedAt })
	return plans, nil
}

// SaveSeatingPlan은 자리 배치 결과를 암호화 보관함에 추가하거나 갱신합니다.
func (s *VaultStore) SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return SeatingPlan{}, errors.New("먼저 보관함을 열어 주세요")
	}
	plan = normaliseSeatingPlan(plan)
	if plan.ID == "" {
		id, err := newStudentID()
		if err != nil {
			return SeatingPlan{}, err
		}
		plan.ID = id
	}
	if plan.CreatedAt == "" {
		plan.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	updated := false
	for index := range s.session.SeatingPlans {
		if s.session.SeatingPlans[index].ID == plan.ID {
			s.session.SeatingPlans[index] = plan
			updated = true
			break
		}
	}
	if !updated {
		s.session.SeatingPlans = append(s.session.SeatingPlans, plan)
	}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return SeatingPlan{}, err
	}
	return plan, nil
}

// GetSeatingPlan은 지정된 ID의 자리 배치 설정을 반환합니다.
func (s *VaultStore) GetSeatingPlan(id string) (SeatingPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return SeatingPlan{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for _, plan := range s.session.SeatingPlans {
		if plan.ID == id {
			return plan, nil
		}
	}
	return SeatingPlan{}, errors.New("자리 배치 이력을 찾지 못했습니다")
}

// DeleteSeatingPlan은 선택한 자리 배치 이력을 삭제합니다.
func (s *VaultStore) DeleteSeatingPlan(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for index, plan := range s.session.SeatingPlans {
		if plan.ID == id {
			s.session.SeatingPlans = append(s.session.SeatingPlans[:index], s.session.SeatingPlans[index+1:]...)
			s.session.UpdatedAt = time.Now().UTC()
			return s.writeCurrentVaultLocked()
		}
	}
	return errors.New("자리 배치 이력을 찾지 못했습니다")
}
