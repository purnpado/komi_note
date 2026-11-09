package main

// 상담 기록 바인딩

// ListConsultations는 학생별 누적 상담 기록을 반환합니다.
func (a *App) ListConsultations(studentID string) ([]Consultation, error) {
	return a.vault.ListConsultations(studentID)
}

// ListAllConsultations는 잠금 해제 상태에서 전체 상담 흐름을 반환합니다.
func (a *App) ListAllConsultations() ([]Consultation, error) {
	return a.vault.ListAllConsultations()
}

// SaveConsultation은 학생 상담 기록을 암호화 보관함에 저장합니다.
func (a *App) SaveConsultation(item Consultation) (Consultation, error) {
	return a.vault.SaveConsultation(item)
}

// SetConsultationFollowUpDone은 후속 기록 없이 상담 후속 확인을 완료로 표시하거나 취소합니다.
func (a *App) SetConsultationFollowUpDone(id string, done bool) (Consultation, error) {
	return a.vault.SetConsultationFollowUpDone(id, done)
}

// DeleteConsultation은 선택한 상담 기록과 연결된 후속 기록을 삭제합니다.
func (a *App) DeleteConsultation(id string) (int, error) {
	return a.vault.DeleteConsultation(id)
}
