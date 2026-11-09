package main

// 학생 명렬·학적변동·통계·사진 바인딩

// SelectRosterFile은 나이스 명렬표 파일을 선택합니다.
func (a *App) SelectRosterFile() (string, error) {
	return a.openFileDialog("나이스 명렬표 선택", "엑셀 명렬표", "*.xlsx")
}

// PreviewRoster는 가져오기 전에 명렬표 내용과 경고를 확인합니다.
func (a *App) PreviewRoster(path string) (RosterPreview, error) {
	return a.vault.PreviewRoster(path)
}

// ImportRoster는 확인한 나이스 명렬표를 암호화 보관함에 저장합니다.
func (a *App) ImportRoster(path string) (RosterImportResult, error) {
	result, err := a.vault.ImportRoster(path)
	return notifyAfter(eventStudentsChanged, "추가", nil, result, err)
}

// ListStudents는 잠금 해제한 보관함의 학생 목록을 반환합니다.
func (a *App) ListStudents() ([]Student, error) {
	return a.vault.ListStudents()
}

// SaveStudent은 학생 기본 정보와 연락처를 암호화 보관함에 저장합니다.
func (a *App) SaveStudent(student Student) (Student, error) {
	result, err := a.vault.SaveStudent(student)
	return notifyAfter(eventStudentsChanged, "수정", func(v Student) string { return v.ID }, result, err)
}

// AddStudent는 전입 학생 등 수기로 추가한 학생을 저장합니다.
func (a *App) AddStudent(student Student) (Student, error) {
	result, err := a.vault.AddStudent(student)
	return notifyAfter(eventStudentsChanged, "추가", func(v Student) string { return v.ID }, result, err)
}

// DeleteStudent는 확인 문구가 맞을 때 한 학생의 개인정보와 연결 기록을 삭제합니다.
func (a *App) DeleteStudent(studentID, confirmation string) error {
	if err := a.vault.DeleteStudent(studentID, confirmation); err != nil {
		return err
	}
	notifyChange(eventStudentsChanged, "삭제", "")
	return nil
}

// ListAcademicChanges는 개인정보 삭제 후 남은 학적변동 최소 이력을 반환합니다.
func (a *App) ListAcademicChanges() ([]AcademicChange, error) {
	return a.vault.ListAcademicChanges()
}

// ProcessAcademicChange는 학생 개인정보를 삭제하고 학적변동 이력을 남깁니다.
func (a *App) ProcessAcademicChange(studentID, status, processedDate, confirmation string) (AcademicChange, error) {
	result, err := a.vault.ProcessAcademicChange(studentID, status, processedDate, confirmation)
	return notifyAfter(eventStudentsChanged, "학적변동", nil, result, err)
}

// ResetStudents는 확인 문구를 받은 뒤 학생 개인정보와 연결 기록을 삭제합니다.
func (a *App) ResetStudents(confirmation string) (int, error) {
	result, err := a.vault.ResetStudents(confirmation)
	return notifyAfter(eventStudentsChanged, "삭제", nil, result, err)
}

// GetStudentStats는 기준일의 만 나이와 성별 통계를 계산합니다.
func (a *App) GetStudentStats(baseDate string) (StudentStats, error) {
	return a.vault.GetStudentStats(baseDate)
}

// SaveStudentPhoto는 학생 사진을 암호화해 data 폴더에 저장합니다.
func (a *App) SaveStudentPhoto(studentID, path string) (Student, error) {
	result, err := a.vault.SaveStudentPhoto(studentID, path)
	return notifyAfter(eventStudentsChanged, "수정", func(v Student) string { return v.ID }, result, err)
}

// GetStudentPhoto는 잠금 해제 상태에서만 사진을 화면 표시용으로 반환합니다.
func (a *App) GetStudentPhoto(studentID string) (string, error) {
	return a.vault.GetStudentPhoto(studentID)
}

// SelectStudentPhoto는 학생 사진 파일을 선택합니다.
func (a *App) SelectStudentPhoto() (string, error) {
	return a.openFileDialog("학생 사진 선택", "사진 파일", "*.jpg;*.jpeg;*.png;*.webp")
}
