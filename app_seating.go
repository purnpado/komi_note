package main

import "TeacherNote/internal/vault"

// 자리배정 저장과 QR 회차 바인딩

// StartSeatingSession은 자리배정 QR 참여 회차를 엽니다.
func (a *App) StartSeatingSession(planID string) (SeatingSessionInfo, error) {
	return a.seating.Start(planID)
}

// StartRandomArrowAssignment은 QR로 입장한 학생의 무작위 화살배정을 시작합니다.
func (a *App) StartRandomArrowAssignment(planID string) (SeatingSessionInfo, error) {
	return a.seating.StartRandomArrowAssignment(planID)
}

// StartSeatingRoulette은 교사가 확정 순서의 다음 룰렛을 시작합니다.
func (a *App) StartSeatingRoulette(planID string) (SeatingSessionInfo, error) {
	return a.seating.StartRoulette(planID)
}

// RevealRandomLadder는 랜덤 사다리의 출발점 선택을 마감하고 경로를 공개합니다.
func (a *App) RevealRandomLadder(planID string) (SeatingSessionInfo, error) {
	return a.seating.RevealRandomLadder(planID)
}

// AdvanceRandomLadder는 교사가 다음 학생 한 명의 사다리 경로를 진행합니다.
func (a *App) AdvanceRandomLadder(planID string) (SeatingSessionInfo, error) {
	return a.seating.AdvanceRandomLadder(planID)
}

// CloseSeatingEntry는 QR 학생 입장을 마감합니다. 재적 인원보다 적게 입장했으면
// allowPartial(결석·미참여 예외 마감)을 교사가 확인해야 마감됩니다.
func (a *App) CloseSeatingEntry(planID string, allowPartial bool) (SeatingSessionInfo, error) {
	return a.seating.CloseEntry(planID, allowPartial)
}

// RevealSeatingNames는 배정이 끝난 회차의 전자칠판에 실명 배치도를 공개하거나 다시 가립니다.
func (a *App) RevealSeatingNames(planID string, reveal bool) (SeatingSessionInfo, error) {
	return a.seating.RevealNames(planID, reveal)
}

// SwapSeatingSeats는 배정 결과에서 두 자리의 학생을 맞바꾸고 변경 기록을 남깁니다.
func (a *App) SwapSeatingSeats(planID, firstSeatID, secondSeatID string) (SeatingPlan, error) {
	return a.seating.SwapSeats(planID, firstSeatID, secondSeatID)
}

// OpenSeatingPreferenceSubmission은 희망 경쟁 회차의 학생 지망 입력을 엽니다.
func (a *App) OpenSeatingPreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	return a.seating.OpenPreferenceSubmission(planID)
}

// CloseSeatingPreferenceSubmission은 지망 접수를 마감하고 경쟁률을 계산합니다.
func (a *App) CloseSeatingPreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	return a.seating.ClosePreferenceSubmission(planID)
}

// StartSeatingRPSCompetition은 희망 경쟁 좌석의 가위바위보 승부를 시작합니다.
func (a *App) StartSeatingRPSCompetition(planID string) (SeatingSessionInfo, error) {
	return a.seating.StartSeatingRPSCompetition(planID)
}

func (a *App) AdvanceSeatingPreferenceRound(planID string) (SeatingSessionInfo, error) {
	return a.seating.AdvancePreferenceRound(planID)
}

// RecoverSeatingSession은 오류가 발생한 자리배정 회차를 교사 선택에 따라 복구합니다.
func (a *App) RecoverSeatingSession(planID, action string) (SeatingSessionInfo, error) {
	return a.seating.Recover(planID, action)
}

// ResetSeatingStudentAccess는 자리배정 회차에서 학생의 기기 연결을 풀어 다른 기기로 다시 들어오게 합니다.
func (a *App) ResetSeatingStudentAccess(planID, studentID string) (SeatingSessionInfo, error) {
	return a.seating.ResetStudentAccess(planID, studentID)
}

// GetSeatingJoinedStudentIDs는 자리배정 회차에 입장한 학생 ID 목록입니다(교사 화면의 접속 초기화용, 닉네임 없음).
func (a *App) GetSeatingJoinedStudentIDs(planID string) []string {
	return a.seating.JoinedStudentIDs(planID)
}

// StopSeatingSession은 자리배정 참여 회차와 임시 인증 정보를 닫습니다.
func (a *App) StopSeatingSession(planID string) { a.seating.Stop(planID) }

// GetSeatingSessionInfo는 현재 QR 참여 회차의 입장 인원과 진행 상태를 반환합니다.
func (a *App) GetSeatingSessionInfo(planID string) (SeatingSessionInfo, error) {
	return a.seating.Info(planID)
}

// ListSeatingPlans는 저장된 자리 배치 이력을 반환합니다.
func (a *App) ListSeatingPlans() ([]SeatingPlan, error) {
	return a.vault.ListSeatingPlans()
}

// SaveSeatingPlan은 자리 배치 결과와 규칙을 암호화해 저장합니다.
func (a *App) SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error) {
	saved, err := a.vault.SaveSeatingPlan(plan)
	return notifyAfter(eventSeatingChanged, savedKind(plan.ID), func(p SeatingPlan) string { return p.ID }, saved, err)
}

// DeleteSeatingPlan은 자리 배치 이력을 삭제합니다.
func (a *App) DeleteSeatingPlan(id string) error {
	return notifyErr(eventSeatingChanged, changeDeleted, id, a.vault.DeleteSeatingPlan(id))
}

// notifyingSeatingStore는 자리배정 QR 회차에 넘기는 보관함입니다.
// 회차가 직접 저장하는 룰렛 결과·결과 자리 바꾸기도 저장에 성공하면 seating:변경을 보냅니다.
type notifyingSeatingStore struct {
	*vault.VaultStore
}

func (s notifyingSeatingStore) SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error) {
	saved, err := s.VaultStore.SaveSeatingPlan(plan)
	return notifyAfter(eventSeatingChanged, savedKind(plan.ID), func(p SeatingPlan) string { return p.ID }, saved, err)
}
