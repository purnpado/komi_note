package main

// 수행평가·수업 명렬 바인딩

import (
	"TeacherNote/internal/vault"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// SelectAssessmentImportFile은 나이스 수행평가 일괄등록 파일을 선택합니다.
func (a *App) SelectAssessmentImportFile() (string, error) {
	return a.openFileDialog("나이스 수행평가 일괄등록 파일 선택", "엑셀 파일", "*.xlsx")
}

func (a *App) PreviewAssessmentImport(path string) (AssessmentImportPreview, error) {
	return vault.PreviewAssessmentImport(path)
}

func (a *App) ListAssessments() ([]Assessment, error) { return a.vault.ListAssessments() }

func (a *App) PreviewCourseRoster(item Assessment) (CourseRosterPreview, error) {
	return a.vault.PreviewCourseRoster(item)
}

func (a *App) PreviewExistingCourseRoster(id, year, grade string) (CourseRosterPreview, error) {
	return a.vault.PreviewExistingCourseRoster(id, year, grade)
}

func (a *App) TransferExistingCourseRoster(id, year, grade string, expected CourseRosterPreview, allowAdd bool) (CourseRosterPreview, error) {
	result, err := a.vault.TransferExistingCourseRoster(id, year, grade, expected, allowAdd)
	if err == nil {
		notifyChange(eventCourseRosterChanged, changeUpdated, "")
	}
	return result, err
}

func (a *App) UpdateCourseRosterStudent(rosterID string, expected CourseRoster, action, originalNumber string, next CourseRosterStudent, confirmation string) (CourseRoster, error) {
	result, err := a.vault.UpdateCourseRosterStudent(rosterID, expected, action, originalNumber, next, confirmation)
	if err == nil {
		notifyChange(eventCourseRosterChanged, changeUpdated, "")
	}
	return result, err
}

func (a *App) ListCourseRosters() ([]CourseRoster, error) {
	return a.vault.ListCourseRosters()
}

func (a *App) SaveAssessment(item Assessment) (Assessment, error) {
	eventType := "점수변경"
	if item.ID == "" {
		eventType = "평가가져옴"
	}
	saved, err := a.vault.SaveAssessment(item)
	if err == nil {
		a.assessmentEvents.Publish(AssessmentEvent{Type: eventType, AssessmentID: saved.ID})
		if eventType == "평가가져옴" {
			notifyChange(eventCourseRosterChanged, changeAdded, "")
		}
	}
	return saved, err
}

// SaveAssessmentCriterionReason은 세부 기준 하나의 채점 사유만 즉시 암호화 저장합니다.
func (a *App) SaveAssessmentCriterionReason(assessmentID, studentID, domainID, criterionID, reason string) (Assessment, error) {
	saved, err := a.vault.SaveAssessmentCriterionReason(assessmentID, studentID, domainID, criterionID, reason)
	if err == nil {
		a.assessmentEvents.Publish(AssessmentEvent{Type: "채점사유저장", AssessmentID: assessmentID, DomainID: domainID, StudentID: studentID})
	}
	return saved, err
}

func (a *App) DeleteAssessment(id, confirmation string) error {
	if err := a.vault.DeleteAssessment(id, confirmation); err != nil {
		return err
	}
	a.assessment.Discard(id)
	return nil
}

func (a *App) AnswerAssessmentObjection(assessmentID, objectionID, answer string) (Assessment, error) {
	item, err := a.vault.AnswerAssessmentObjection(assessmentID, objectionID, answer)
	if err == nil {
		a.assessmentEvents.Publish(AssessmentEvent{Type: "답변등록", AssessmentID: assessmentID})
	}
	return item, err
}

// DeleteAssessmentObjection은 답변 완료 이의의 민감한 본문과 답변을 삭제합니다.
func (a *App) DeleteAssessmentObjection(assessmentID, objectionID string) (Assessment, error) {
	item, err := a.vault.DeleteAssessmentObjection(assessmentID, objectionID)
	if err == nil {
		a.assessmentEvents.Publish(AssessmentEvent{Type: "이의삭제", AssessmentID: assessmentID})
	}
	return item, err
}

// StartAssessmentReview는 선택한 평가 영역의 학생 확인 QR 회차를 엽니다.
func (a *App) StartAssessmentReview(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return a.assessment.Start(assessmentID, domainID)
}

// StartAssessmentAnswerReview는 답변 완료 이의의 학생 재확인 QR 회차를 엽니다.
func (a *App) StartAssessmentAnswerReview(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return a.assessment.StartAnswerReview(assessmentID, domainID)
}

func (a *App) StopAssessmentReview(assessmentID, domainID string) error {
	return a.assessment.Stop(assessmentID, domainID)
}

func (a *App) StopAssessmentAnswerReview(assessmentID, domainID string) error {
	return a.assessment.StopAnswerReview(assessmentID, domainID)
}

func (a *App) GetAssessmentReviewInfo(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return a.assessment.Info(assessmentID, domainID)
}

func (a *App) GetAssessmentAnswerReviewInfo(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return a.assessment.AnswerReviewInfo(assessmentID, domainID)
}

// ResetAssessmentStudentAccess는 QR 확인 회차에서 한 학생의 접속을 초기화합니다(다른 학생이 먼저 들어왔거나 기기를 바꾼 경우).
func (a *App) ResetAssessmentStudentAccess(assessmentID, domainID, mode, studentID string) (AssessmentSessionInfo, error) {
	return a.assessment.ResetStudentAccess(assessmentID, domainID, mode, studentID)
}

// OpenAssessmentBoard는 선택한 영역의 QR 전자칠판을 기본 브라우저의 별도 창으로 엽니다.
func (a *App) OpenAssessmentBoard(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	info, err := a.assessment.Start(assessmentID, domainID)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	if appInst := application.Get(); appInst != nil {
		_ = appInst.Browser.OpenURL(info.BoardURL)
	}
	return info, nil
}
