package main

// 설문 바인딩

// ListSurveys는 암호화 보관함에 저장된 학급 설문을 반환합니다.
func (a *App) ListSurveys() ([]Survey, error) { return a.vault.ListSurveys() }

// SaveSurvey는 교사가 작성한 객관식 설문을 암호화 보관함에 저장합니다.
func (a *App) SaveSurvey(item Survey) (Survey, error) {
	kind := changeUpdated
	if item.ID == "" {
		kind = changeAdded
	}
	saved, err := a.vault.SaveSurvey(item)
	return notifyAfter(eventSurveyChanged, kind, func(v Survey) string { return v.ID }, saved, err)
}

// DeleteSurvey는 확인 문구를 받은 뒤 설문과 응답을 암호화 보관함에서 삭제합니다.
func (a *App) DeleteSurvey(surveyID, confirmation string) error {
	if err := a.vault.DeleteSurvey(surveyID, confirmation); err != nil {
		return err
	}
	a.survey.Discard(surveyID)
	notifyChange(eventSurveyChanged, changeDeleted, surveyID)
	return nil
}

// StartSurveySession은 교실 Wi-Fi에서만 사용할 임시 참여 주소와 QR 코드를 만듭니다.
func (a *App) StartSurveySession(surveyID string) (SurveySessionInfo, error) {
	info, err := a.survey.Start(surveyID)
	return notifyAfter(eventSurveyChanged, changeUpdated, func(v SurveySessionInfo) string { return v.SurveyID }, info, err)
}

// StartSurveyQuestions는 참여 인증을 마친 학생 기기에 설문 문항을 엽니다.
func (a *App) StartSurveyQuestions(surveyID string) (SurveySessionInfo, error) {
	info, err := a.survey.StartQuestions(surveyID)
	return notifyAfter(eventSurveyChanged, changeUpdated, func(v SurveySessionInfo) string { return v.SurveyID }, info, err)
}

// StopSurveySession은 학생 브라우저의 추가 접속을 닫고 설문을 마감합니다.
func (a *App) StopSurveySession(surveyID string) error {
	if err := a.survey.Stop(surveyID); err != nil {
		return err
	}
	notifyChange(eventSurveyChanged, changeUpdated, surveyID)
	return nil
}

// ResetSurveyStudentAccess는 한 학생의 기기 연결을 풀어 다른 기기로 다시 들어올 수 있게 합니다(낸 응답은 그대로).
func (a *App) ResetSurveyStudentAccess(surveyID, participantID string) (SurveySessionInfo, error) {
	return a.survey.ResetStudentAccess(surveyID, participantID)
}

// SetSurveyResultsPublic은 마감된 설문 집계 결과의 전자칠판 공개 여부를 바꿉니다.
func (a *App) SetSurveyResultsPublic(surveyID string, enabled bool) (SurveySessionInfo, error) {
	return a.survey.SetPublicResults(surveyID, enabled)
}

// GetSurveySessionInfo는 현재 교실 참여 세션의 접속 주소와 현황을 반환합니다.
func (a *App) GetSurveySessionInfo(surveyID string) (SurveySessionInfo, error) {
	return a.survey.Info(surveyID)
}

// SaveSurveyImage는 설문 문항·보기에 넣을 그림을 암호화 보관함 폴더에 저장하고 그림 번호를 돌려줍니다.
func (a *App) SaveSurveyImage(dataURL string) (string, error) {
	return a.vault.SaveSurveyImage(dataURL)
}

// GetSurveyImage는 설문 그림을 교사 화면에서 보일 data URL로 돌려줍니다.
func (a *App) GetSurveyImage(imageID string) (string, error) {
	return a.vault.GetSurveyImageURL(imageID)
}
