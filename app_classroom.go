package main

// 제출 서류·청소구역 바인딩

// ListSubmissionDocuments는 제출서류 관리 항목을 반환합니다.
func (a *App) ListSubmissionDocuments() ([]SubmissionDocument, error) {
	return a.vault.ListSubmissionDocuments()
}

// SaveSubmissionDocument는 제출서류 관리 항목을 저장합니다.
func (a *App) SaveSubmissionDocument(item SubmissionDocument) (SubmissionDocument, error) {
	return a.vault.SaveSubmissionDocument(item)
}

// DeleteSubmissionDocument는 제출서류 관리 항목을 삭제합니다.
func (a *App) DeleteSubmissionDocument(id string) error {
	return a.vault.DeleteSubmissionDocument(id)
}

// SaveSubmissionStatus는 학생별 제출 상태를 저장합니다.
func (a *App) SaveSubmissionStatus(documentID, studentID, status, note string) (SubmissionDocument, error) {
	return a.vault.SaveSubmissionStatus(documentID, studentID, status, note)
}

// ListCleaningPlans는 기간별 청소구역 편성 이력을 반환합니다.
func (a *App) ListCleaningPlans() ([]CleaningPlan, error) {
	return a.vault.ListCleaningPlans()
}

// SaveCleaningPlan은 청소구역 편성표를 암호화해 저장합니다.
func (a *App) SaveCleaningPlan(plan CleaningPlan) (CleaningPlan, error) {
	return a.vault.SaveCleaningPlan(plan)
}

// DeleteCleaningPlan은 청소구역 편성 이력을 삭제합니다.
func (a *App) DeleteCleaningPlan(id string) error {
	return a.vault.DeleteCleaningPlan(id)
}
