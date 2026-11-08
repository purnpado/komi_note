package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"TeacherNote/internal/assessment"
	"TeacherNote/internal/attendance"
	"TeacherNote/internal/cleaning"
	"TeacherNote/internal/groupsession"
	"TeacherNote/internal/seating"
	"TeacherNote/internal/students"
	"TeacherNote/internal/submissions"
	"TeacherNote/internal/survey"
	"TeacherNote/internal/system"
	"TeacherNote/internal/vault"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App은 데스크톱 프로그램의 기능을 화면에 제공합니다.
type App struct {
	ctx              context.Context
	window           *application.WebviewWindow
	vault            *vault.VaultStore
	survey           *survey.SurveyServer
	seating          *seating.SeatingServer
	groupSession     *groupsession.Server
	assessment       *assessment.AssessmentServer
	assessmentEvents *assessment.AssessmentEventBus
}

func (a *App) setMainWindow(win *application.WebviewWindow) {
	a.window = win
}

// 공용 유틸리티 연결
var (
	zeroBytes        = system.ZeroBytes
	writeFileAndSync = system.WriteFileAndSync
)

// 공용 타입 알리아스 (프론트엔드 Wails v3 바인딩 호환)
type VaultStore = vault.VaultStore
type ClassConfig = vault.ClassConfig
type SetupRequest = vault.SetupRequest
type AppState = vault.AppState
type SessionResult = vault.SessionResult

// RestoreResult는 백업 되살리기 뒤 안내할 내용입니다.
type RestoreResult = vault.RestoreResult
type RosterPreview = vault.RosterPreview
type RosterImportResult = vault.RosterImportResult

type Student = students.Student
type StudentStats = students.StudentStats
type Consultation = vault.Consultation
type AcademicChange = vault.AcademicChange

type AttendanceDay = attendance.AttendanceDay
type AttendanceEntry = attendance.AttendanceEntry
type AttendanceDocumentPeriod = attendance.AttendanceDocumentPeriod
type AttendanceTemplate = vault.AttendanceTemplate
type AttendanceFieldPoint = vault.AttendanceFieldPoint
type AttendanceHWPXBuildResult = vault.AttendanceHWPXBuildResult

type SeatingPlan = seating.SeatingPlan
type SeatingSeat = seating.SeatingSeat

type Assessment = assessment.Assessment
type AssessmentStudent = assessment.AssessmentStudent
type AssessmentDomain = assessment.AssessmentDomain
type AssessmentCriterion = assessment.AssessmentCriterion
type AssessmentScore = assessment.AssessmentScore
type AssessmentDomainScore = assessment.AssessmentDomainScore
type AssessmentCriterionScore = assessment.AssessmentCriterionScore
type AssessmentObjection = assessment.AssessmentObjection
type AssessmentHistory = assessment.AssessmentHistory
type CourseRoster = vault.CourseRoster
type TimetableBook = vault.TimetableBook
type GroupingBook = vault.GroupingBook
type GroupPlan = vault.GroupPlan
type GroupRules = vault.GroupRules
type RecordBook = vault.RecordBook
type RecordEntry = vault.RecordEntry
type RecordActivityList = vault.RecordActivityList
type RecordPhrase = vault.RecordPhrase

// RecordPhraseBulkResult는 문장을 한꺼번에 보관한 결과입니다.
type RecordPhraseBulkResult struct {
	Added   int `json:"added"`
	Skipped int `json:"skipped"`
}

// GroupSessionInfo는 학생 참여형 모둠 편성(지망 배정) QR 회차 상태입니다.
type GroupSessionInfo = groupsession.Info

// GroupSessionRequest는 학생 참여형 모둠 편성 회차 설정입니다.
type GroupSessionRequest = groupsession.StartRequest
type CourseRosterStudent = vault.CourseRosterStudent
type CourseRosterPreview = vault.CourseRosterPreview
type AssessmentImportPreview = vault.AssessmentImportPreview

type CleaningPlan = cleaning.CleaningPlan
type CleaningZone = cleaning.CleaningZone
type CleaningAssignment = cleaning.CleaningAssignment
type SubmissionDocument = submissions.SubmissionDocument
type Survey = survey.Survey
type SurveyQuestion = survey.SurveyQuestion
type SurveySessionInfo = survey.SurveySessionInfo

// SeatingSessionInfo는 자리배정 QR 참여 회차 정보입니다.
type SeatingSessionInfo = seating.SeatingSessionInfo

// AssessmentSessionInfo는 수행평가 전자칠판 QR 및 진행 정보입니다.
type AssessmentSessionInfo = assessment.AssessmentSessionInfo

// AssessmentEvent는 수행평가 모듈 상태 변경 이벤트입니다.
type AssessmentEvent = assessment.AssessmentEvent

// AssessmentEventBus는 수행평가 이벤트 버스입니다.
type AssessmentEventBus = assessment.AssessmentEventBus

// ParticipationSafetyState는 자동 잠금 판단에 필요한 공개 최소 상태입니다.
// 회차 제목·학생 정보·QR 토큰은 포함하지 않습니다.
type ParticipationSafetyState struct {
	Active bool `json:"active"`
	Paused bool `json:"paused"`
}

// NewApp은 프로그램 보관함을 준비합니다.
func NewApp() *App {
	vaultStore := vault.NewVaultStore()
	events := assessment.NewAssessmentEventBus()
	app := &App{vault: vaultStore, survey: survey.NewSurveyServer(vaultStore), seating: seating.NewSeatingServer(vaultStore), groupSession: groupsession.NewServer(), assessmentEvents: events}
	app.assessment = assessment.NewAssessmentServer(vaultStore, events)
	events.Subscribe(func(event AssessmentEvent) {
		if appInst := application.Get(); appInst != nil {
			appInst.Event.Emit("assessment:"+event.Type, event)
		}
	})
	return app
}

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

// startup은 프로그램 시작 시 실행 환경을 보관합니다.
func (a *App) startup() {
	system.CleanupUpdateArtifacts()
	a.fitWindowToCurrentScreen()
	if a.window != nil {
		a.window.Show()
		a.window.UnMinimise()
		go func() {
			time.Sleep(350 * time.Millisecond)
			if a.window != nil {
				a.window.Show()
				a.window.UnMinimise()
			}
		}()
	}
}

// fitWindowToCurrentScreen은 현재 모니터의 작업 영역에 맞는 복원 창 크기를 준비합니다.
// 최대화 상태에서 복원할 때도 화면 밖으로 창이 벗어나지 않도록 논리 해상도를 사용합니다.
func (a *App) fitWindowToCurrentScreen() {
	if a.window == nil {
		return
	}
	appInst := application.Get()
	if appInst == nil {
		return
	}
	screens := appInst.Screen.GetAll()
	if len(screens) == 0 {
		return
	}
	current := screens[0]
	for _, screen := range screens {
		if screen.IsPrimary {
			current = screen
			break
		}
	}
	width, height := current.Size.Width, current.Size.Height
	if width == 0 || height == 0 {
		width, height = current.Bounds.Width, current.Bounds.Height
	}
	if width == 0 || height == 0 {
		return
	}
	windowWidth := width - 120
	windowHeight := height - 100
	if windowWidth > 1440 {
		windowWidth = 1440
	}
	if windowHeight > 900 {
		windowHeight = 900
	}
	if windowWidth < 900 {
		windowWidth = 900
	}
	if windowHeight < 640 {
		windowHeight = 640
	}
	a.window.SetSize(windowWidth, windowHeight)
	a.window.Center()
}

func (a *App) openFileDialog(title string, filterName string, pattern string) (string, error) {
	appInst := application.Get()
	if appInst == nil {
		return "", errors.New("프로그램 실행 환경을 준비하지 못했습니다")
	}
	opts := &application.OpenFileDialogOptions{
		Title:          title,
		CanChooseFiles: true,
	}
	if filterName != "" && pattern != "" {
		opts.Filters = []application.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}}
	}
	if a.window != nil {
		opts.Window = a.window
	}
	return appInst.Dialog.OpenFileWithOptions(opts).PromptForSingleSelection()
}

func (a *App) saveFileDialog(title string, defaultFilename string, filterName string, pattern string) (string, error) {
	appInst := application.Get()
	if appInst == nil {
		return "", errors.New("프로그램 실행 환경을 준비하지 못했습니다")
	}
	opts := &application.SaveFileDialogOptions{
		Title:    title,
		Filename: defaultFilename,
	}
	if filterName != "" && pattern != "" {
		opts.Filters = []application.FileFilter{{
			DisplayName: filterName,
			Pattern:     pattern,
		}}
	}
	if a.window != nil {
		opts.Window = a.window
	}
	return appInst.Dialog.SaveFileWithOptions(opts).PromptForSingleSelection()
}

// GetAppState는 개인정보를 노출하지 않는 시작 상태를 반환합니다.
func (a *App) GetAppState() (AppState, error) {
	return a.vault.State()
}

// GetSessionConfig는 이미 열린 보관함의 설정을 돌려줍니다(화면을 다시 불러온 경우).
func (a *App) GetSessionConfig() (SessionResult, error) {
	return a.vault.CurrentSession()
}

// GetParticipationSafetyState는 설문 또는 자리배정 QR 회차가 열려 있는지 반환합니다.
// 진행 중에는 교사 화면의 자동 잠금을 보류해 수업 흐름을 지킵니다.
func (a *App) GetParticipationSafetyState() ParticipationSafetyState {
	return ParticipationSafetyState{
		Active: a.survey.HasActiveSession() || a.seating.HasActiveSession() || a.assessment.HasActiveSession() || a.groupSession.HasActiveSession(),
		Paused: a.survey.IsPaused() || a.seating.IsPaused() || a.assessment.IsPaused() || a.groupSession.IsPaused(),
	}
}

// ResumeParticipationSessions는 잠금 해제 후 교사가 확인한 경우에만 QR 회차를 재개합니다.
func (a *App) ResumeParticipationSessions() {
	a.survey.ResumeAll()
	a.seating.ResumeAll()
	a.assessment.ResumeAll()
	a.groupSession.ResumeAll()
}

// GetAppVersion은 현재 실행 중인 꼬미노트의 버전을 반환합니다.
func (a *App) GetAppVersion() string {
	return system.AppVersion
}

// UpdateInfo는 공개 업데이트 채널에서 받는 정보와 화면 표시 상태를 함께 담습니다.
type UpdateInfo = system.UpdateInfo

// CheckForUpdate는 GitHub 공개 릴리즈 채널에서 새 버전을 확인합니다.
func (a *App) CheckForUpdate() (UpdateInfo, error) {
	return system.CheckForUpdate()
}

// InstallAvailableUpdate는 확인된 업데이트를 내려받아 종료 뒤 자동으로 교체합니다.
func (a *App) InstallAvailableUpdate() error {
	return system.InstallAvailableUpdate()
}

// SelectRecoveryFile은 사용자가 복구 파일을 저장할 위치를 고르게 합니다.
func (a *App) SelectRecoveryFile() (string, error) {
	return a.saveFileDialog("복구 파일 저장 위치 선택", "꼬미노트-복구키.teacher-recovery", "꼬미노트 복구 파일", "*.teacher-recovery")
}

// ExportEncryptedBackup은 열린 보관함을 암호화된 백업 파일로 저장합니다. 취소하면 빈 경로를 돌려줍니다.
func (a *App) ExportEncryptedBackup() (string, error) {
	name := "꼬미노트-백업-" + time.Now().Format("20060102") + ".kkomi-backup"
	path, err := a.saveFileDialog("암호화 백업 저장 위치 선택", name, "꼬미노트 백업 파일", "*.kkomi-backup")
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".kkomi-backup") {
		path += ".kkomi-backup"
	}
	if err := a.vault.ExportBackup(path); err != nil {
		return "", err
	}
	return path, nil
}

// SelectBackupFile은 되살릴 암호화 백업 파일을 고릅니다.
func (a *App) SelectBackupFile() (string, error) {
	return a.openFileDialog("되살릴 백업 파일 선택", "꼬미노트 백업 파일", "*.kkomi-backup")
}

// RestoreEncryptedBackup은 백업 당시 마스터 비밀번호로 백업 파일을 열어 보관함을 되살립니다.
func (a *App) RestoreEncryptedBackup(path, password string) (RestoreResult, error) {
	return a.vault.RestoreBackup(path, password)
}

// ChangeMasterPassword는 지금 비밀번호를 확인한 뒤 마스터 비밀번호를 바꿉니다.
func (a *App) ChangeMasterPassword(currentPassword, newPassword string) error {
	return a.vault.ChangeMasterPassword(currentPassword, newPassword)
}

// CreateRecoveryFile은 새 복구 파일을 저장합니다. 취소하면 빈 경로를 돌려줍니다.
func (a *App) CreateRecoveryFile(recoveryPassword string) (string, error) {
	path, err := a.saveFileDialog("새 복구 파일 저장 위치 선택", "꼬미노트-복구키-"+time.Now().Format("20060102")+".teacher-recovery", "꼬미노트 복구 파일", "*.teacher-recovery")
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), ".teacher-recovery") {
		path += ".teacher-recovery"
	}
	if err := a.vault.CreateRecoveryFile(path, recoveryPassword); err != nil {
		return "", err
	}
	return path, nil
}

// InitializeVault은 최초 설정과 암호화 보관함 생성을 처리합니다.
func (a *App) InitializeVault(request SetupRequest) (SessionResult, error) {
	return a.vault.Initialize(request)
}

// DefaultRecoveryFilePath은 최초 복구 파일의 기본 저장 위치를 반환합니다.
func (a *App) DefaultRecoveryFilePath() string {
	return a.vault.DefaultRecoveryFilePath()
}

// UnlockVault은 마스터 비밀번호로 암호화 보관함을 엽니다.
func (a *App) UnlockVault(password string) (SessionResult, error) {
	return a.vault.Unlock(password)
}

// UnlockVaultWithPin은 간편 숫자 PIN 번호로 암호화 보관함을 엽니다.
func (a *App) UnlockVaultWithPin(pin string) (SessionResult, error) {
	return a.vault.UnlockWithPin(pin)
}

// SetPin은 간편 숫자 PIN 번호를 등록하거나 변경합니다.
func (a *App) SetPin(pin string) error {
	return a.vault.SetPin(pin)
}

// RemovePin은 등록된 간편 PIN 번호를 삭제합니다.
func (a *App) RemovePin() error {
	return a.vault.RemovePin()
}

// HasPin은 간편 PIN 번호 설정 여부를 반환합니다.
func (a *App) HasPin() (bool, error) {
	return a.vault.HasPin()
}

// LockVault은 메모리에 있는 암호화 키와 설정을 지웁니다.
func (a *App) LockVault() {
	if a.survey != nil {
		a.survey.PauseAll()
	}
	if a.seating != nil {
		a.seating.PauseAll()
	}
	if a.assessment != nil {
		a.assessment.PauseAll()
	}
	if a.groupSession != nil {
		a.groupSession.PauseAll()
	}
	a.vault.Lock()
}

// UpdateSettings는 잠금 해제한 사용자의 기본 설정을 저장합니다.
func (a *App) UpdateSettings(config ClassConfig) (SessionResult, error) {
	return a.vault.UpdateConfig(config)
}

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
	return a.vault.ImportRoster(path)
}

// ListStudents는 잠금 해제한 보관함의 학생 목록을 반환합니다.
func (a *App) ListStudents() ([]Student, error) {
	return a.vault.ListStudents()
}

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

// ListSeatingPlans는 저장된 자리 배치 이력을 반환합니다.
func (a *App) ListSeatingPlans() ([]SeatingPlan, error) {
	return a.vault.ListSeatingPlans()
}

// SaveSeatingPlan은 자리 배치 결과와 규칙을 암호화해 저장합니다.
func (a *App) SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error) {
	return a.vault.SaveSeatingPlan(plan)
}

// DeleteSeatingPlan은 자리 배치 이력을 삭제합니다.
func (a *App) DeleteSeatingPlan(id string) error {
	return a.vault.DeleteSeatingPlan(id)
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

// GetTimetableBook은 교시 시각·학기별 시간표·날짜별 교체 기록을 반환합니다.
func (a *App) GetTimetableBook() (TimetableBook, error) {
	return a.vault.GetTimetableBook()
}

// SaveTimetableBook은 시간표 전체를 암호화해 저장합니다.
func (a *App) SaveTimetableBook(book TimetableBook) (TimetableBook, error) {
	return a.vault.SaveTimetableBook(book)
}

// GetRecordBook은 학교생활기록(관찰 메모·기재 문장·활동 명단·글자 수 한도)을 반환합니다.
func (a *App) GetRecordBook() (RecordBook, error) {
	return a.vault.GetRecordBook()
}

// SaveRecordEntry는 한 학생의 한 영역 기록을 암호화해 저장합니다.
func (a *App) SaveRecordEntry(entry RecordEntry) (RecordEntry, error) {
	return a.vault.SaveRecordEntry(entry)
}

// DeleteRecordEntry는 기록 하나를 지웁니다.
func (a *App) DeleteRecordEntry(id string) error {
	return a.vault.DeleteRecordEntry(id)
}

// SaveRecordList는 동아리 등 활동 명단을 암호화해 저장합니다.
func (a *App) SaveRecordList(list RecordActivityList) (RecordActivityList, error) {
	return a.vault.SaveRecordList(list)
}

// DeleteRecordList는 활동 명단과 그 명단으로 쓴 기록을 지웁니다.
func (a *App) DeleteRecordList(id, confirmation string) error {
	return a.vault.DeleteRecordList(id, confirmation)
}

// SaveRecordLimits는 영역별 글자 수 한도를 저장합니다.
func (a *App) SaveRecordLimits(limits map[string]int) (map[string]int, error) {
	return a.vault.SaveRecordLimits(limits)
}

// DeleteRecordYear는 한 학년도의 학교생활기록과 활동 명단을 한꺼번에 지웁니다.
func (a *App) DeleteRecordYear(schoolYear, confirmation string) (int, error) {
	return a.vault.DeleteRecordYear(schoolYear, confirmation)
}

// SaveRecordPhrase는 학생 정보 없이 특기사항 문장을 문장 보관함에 저장합니다.
func (a *App) SaveRecordPhrase(phrase RecordPhrase) (RecordPhrase, error) {
	return a.vault.SaveRecordPhrase(phrase)
}

// SaveRecordPhrases는 학년말에 고른 문장들을 문장 보관함에 한꺼번에 저장합니다.
func (a *App) SaveRecordPhrases(phrases []RecordPhrase) (RecordPhraseBulkResult, error) {
	added, skipped, err := a.vault.SaveRecordPhrases(phrases)
	return RecordPhraseBulkResult{Added: added, Skipped: skipped}, err
}

// DeleteRecordPhrase는 문장 보관함의 문장 하나를 지웁니다.
func (a *App) DeleteRecordPhrase(id string) error {
	return a.vault.DeleteRecordPhrase(id)
}

// GetGroupingBook은 모둠 편성 이력과 반별 편성 조건을 반환합니다.
func (a *App) GetGroupingBook() (GroupingBook, error) {
	return a.vault.GetGroupingBook()
}

// SaveGroupPlan은 모둠 편성 결과를 암호화해 저장합니다.
func (a *App) SaveGroupPlan(plan GroupPlan) (GroupPlan, error) {
	return a.vault.SaveGroupPlan(plan)
}

// DeleteGroupPlan은 모둠 편성 이력 하나를 삭제합니다.
func (a *App) DeleteGroupPlan(id string) error {
	return a.vault.DeleteGroupPlan(id)
}

// SaveGroupRules는 반별 교사 전용 편성 조건을 암호화해 저장합니다.
func (a *App) SaveGroupRules(rules GroupRules) (GroupRules, error) {
	return a.vault.SaveGroupRules(rules)
}

// StartGroupingSession은 학생 참여형 모둠 편성(지망 배정) QR 회차를 엽니다.
// 학생 명단과 교사 전용 조건은 보관함에서 직접 읽고, 빠질 학생은 제외합니다.
func (a *App) StartGroupingSession(request GroupSessionRequest) (GroupSessionInfo, error) {
	excluded := map[string]bool{}
	for _, key := range request.ExcludedKeys {
		excluded[key] = true
	}
	participants := []groupsession.Participant{}
	switch request.SourceKind {
	case "homeroom":
		list, err := a.vault.ListStudents()
		if err != nil {
			return GroupSessionInfo{}, err
		}
		for _, student := range list {
			if !excluded[student.ID] {
				participants = append(participants, groupsession.Participant{Key: student.ID, Number: strconv.Itoa(student.Number), Name: student.Name})
			}
		}
	case "course":
		rosters, err := a.vault.ListCourseRosters()
		if err != nil {
			return GroupSessionInfo{}, err
		}
		found := false
		for _, roster := range rosters {
			if roster.ID != request.SourceID {
				continue
			}
			found = true
			for _, student := range roster.Students {
				key := strings.TrimSpace(student.Number) + "|" + strings.TrimSpace(student.Name)
				if student.Status != "전출" && !excluded[key] {
					participants = append(participants, groupsession.Participant{Key: key, Number: strings.TrimSpace(student.Number), Name: strings.TrimSpace(student.Name)})
				}
			}
		}
		if !found {
			return GroupSessionInfo{}, errors.New("수업 명렬을 찾지 못했습니다")
		}
	default:
		return GroupSessionInfo{}, errors.New("모둠을 만들 반을 골라 주세요")
	}
	config := groupsession.Config{Request: request, Participants: participants}
	if book, err := a.vault.GetGroupingBook(); err == nil {
		for _, rules := range book.Rules {
			if rules.SourceKind == request.SourceKind && rules.SourceID == request.SourceID {
				for _, pair := range rules.Separate {
					config.Separate = append(config.Separate, groupsession.Pair{A: pair.A, B: pair.B})
				}
				for _, pair := range rules.Together {
					config.Together = append(config.Together, groupsession.Pair{A: pair.A, B: pair.B})
				}
			}
		}
	}
	return a.groupSession.Start(config)
}

// GetGroupingSessionInfo는 모둠 참여 회차의 진행 상태를 돌려줍니다(회차가 없으면 running=false).
func (a *App) GetGroupingSessionInfo() (GroupSessionInfo, error) {
	return a.groupSession.Info()
}

// OpenGroupingPreferences는 학생 지망 제출을 시작합니다(seconds: 제출 시간).
func (a *App) OpenGroupingPreferences(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.OpenPreferences(seconds)
}

// ExtendGroupingDeadline은 지망 제출 시간을 늘립니다.
func (a *App) ExtendGroupingDeadline(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.Extend(seconds)
}

// CloseGroupingPreferences는 지망 제출을 마감하고 배정합니다.
func (a *App) CloseGroupingPreferences() (GroupSessionInfo, error) {
	return a.groupSession.ClosePreferences()
}

// RevealGroupingNextRound는 다음 지망 라운드 결과를 공개합니다.
func (a *App) RevealGroupingNextRound() (GroupSessionInfo, error) {
	return a.groupSession.RevealNext()
}

// RevealGroupingNames는 배정이 모두 끝난 뒤 실명을 공개합니다.
func (a *App) RevealGroupingNames() (GroupSessionInfo, error) {
	return a.groupSession.RevealNames()
}

// ResetGroupingStudent는 학생 기기 연결을 풀어 다시 들어오게 합니다.
func (a *App) ResetGroupingStudent(key string) (GroupSessionInfo, error) {
	return a.groupSession.ResetStudent(key)
}

// OpenGroupingVote는 모둠장 투표를 시작합니다(모둠장이 있는 방식).
func (a *App) OpenGroupingVote(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.OpenVote(seconds)
}

// CloseGroupingVote는 모둠장 투표를 마감합니다.
func (a *App) CloseGroupingVote() (GroupSessionInfo, error) {
	return a.groupSession.CloseVote()
}

// ConfirmGroupingLeaders는 모둠마다 모둠장을 확정합니다(keys는 모둠 순서).
func (a *App) ConfirmGroupingLeaders(keys []string) (GroupSessionInfo, error) {
	return a.groupSession.ConfirmLeaders(keys)
}

// SetGroupingPots는 교사가 나눈 포트를 저장합니다(교사만 보는 기준).
func (a *App) SetGroupingPots(pots [][]string) (GroupSessionInfo, error) {
	return a.groupSession.SetPots(pots)
}

// StartGroupingDraft는 뱀 순서 블라인드 지명을 시작합니다.
func (a *App) StartGroupingDraft() (GroupSessionInfo, error) {
	return a.groupSession.StartDraft()
}

// GroupingDraftPick은 전자칠판에서 지금 차례 모둠장이 카드를 고릅니다(card 0이면 무작위).
func (a *App) GroupingDraftPick(card int) (GroupSessionInfo, error) {
	return a.groupSession.DraftPick(card)
}

// StopGroupingSession은 모둠 참여 회차를 닫고 메모리의 지망·닉네임을 지웁니다.
func (a *App) StopGroupingSession() {
	a.groupSession.Stop()
}

// GetAttendance는 선택 날짜의 재학생 출결을 반환합니다.
func (a *App) GetAttendance(date string) (AttendanceDay, error) {
	return a.vault.GetAttendance(date)
}

// SaveAttendance는 선택 날짜의 재학생 출결을 암호화 보관함에 저장합니다.
func (a *App) SaveAttendance(day AttendanceDay) (AttendanceDay, error) {
	return a.vault.SaveAttendance(day)
}

// ListStudentAttendance는 학생 상세정보의 출결 누계와 기록을 반환합니다.
func (a *App) ListStudentAttendance(studentID string) ([]AttendanceDay, error) {
	return a.vault.ListStudentAttendance(studentID)
}

func (a *App) GetAttendanceDocumentPeriod(studentID, date string) (AttendanceDocumentPeriod, error) {
	return a.vault.GetAttendanceDocumentPeriod(studentID, date)
}

func (a *App) SelectAttendanceTemplateFile() (string, error) {
	return a.openFileDialog("결석계 양식 선택", "결석계 양식", "*.hwpx;*.pdf;*.docx;*.xlsx")
}

func (a *App) ListAttendanceTemplates() ([]AttendanceTemplate, error) {
	return a.vault.ListAttendanceTemplates()
}
func (a *App) SaveAttendanceTemplate(name, path string, statuses []string) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplate(name, path, statuses)
}
func (a *App) SaveAttendanceTemplateMappings(id string, mappings []AttendanceFieldPoint) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplateMappings(id, mappings)
}
func (a *App) SaveAttendanceTemplateCustomValues(id string, values map[string]string) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplateCustomValues(id, values)
}
func (a *App) DeleteAttendanceTemplate(id string) error { return a.vault.DeleteAttendanceTemplate(id) }

// AttendanceHWPXExportResult는 저장 위치와 서식에 남은 안내용 치환자를 제공합니다.
type AttendanceHWPXExportResult struct {
	Path       string   `json:"path"`
	Unresolved []string `json:"unresolved"`
}

func (a *App) ExportAttendanceHWPX(templateID, studentID, date string) (AttendanceHWPXExportResult, error) {
	result, err := a.vault.BuildAttendanceHWPX(templateID, studentID, date)
	if err != nil {
		return AttendanceHWPXExportResult{}, err
	}
	defer zeroBytes(result.Data)
	path, err := a.saveFileDialog("출결 HWPX 저장", result.FileName, "HWPX 파일", "*.hwpx")
	if err != nil || path == "" {
		return AttendanceHWPXExportResult{}, err
	}
	if err := writeFileAndSync(path, result.Data); err != nil {
		return AttendanceHWPXExportResult{}, errors.New("HWPX 서류를 저장하지 못했습니다")
	}
	fileURL := (&url.URL{Scheme: "file", Path: filepath.ToSlash(path)}).String()
	if appInst := application.Get(); appInst != nil {
		_ = appInst.Browser.OpenURL(fileURL)
	}
	return AttendanceHWPXExportResult{Path: path, Unresolved: result.Unresolved}, nil
}
func (a *App) PrintCurrentDocument() {
	if a.window != nil {
		_ = a.window.Print()
	}
}

// SaveStudent은 학생 기본 정보와 연락처를 암호화 보관함에 저장합니다.
func (a *App) SaveStudent(student Student) (Student, error) {
	return a.vault.SaveStudent(student)
}

// AddStudent는 전입 학생 등 수기로 추가한 학생을 저장합니다.
func (a *App) AddStudent(student Student) (Student, error) {
	return a.vault.AddStudent(student)
}

// DeleteStudent는 확인 문구가 맞을 때 한 학생의 개인정보와 연결 기록을 삭제합니다.
func (a *App) DeleteStudent(studentID, confirmation string) error {
	return a.vault.DeleteStudent(studentID, confirmation)
}

// ListAcademicChanges는 개인정보 삭제 후 남은 학적변동 최소 이력을 반환합니다.
func (a *App) ListAcademicChanges() ([]AcademicChange, error) {
	return a.vault.ListAcademicChanges()
}

// ProcessAcademicChange는 학생 개인정보를 삭제하고 학적변동 이력을 남깁니다.
func (a *App) ProcessAcademicChange(studentID, status, processedDate, confirmation string) (AcademicChange, error) {
	return a.vault.ProcessAcademicChange(studentID, status, processedDate, confirmation)
}

// ResetStudents는 확인 문구를 받은 뒤 학생 개인정보와 연결 기록을 삭제합니다.
func (a *App) ResetStudents(confirmation string) (int, error) {
	return a.vault.ResetStudents(confirmation)
}

// GetStudentStats는 기준일의 만 나이와 성별 통계를 계산합니다.
func (a *App) GetStudentStats(baseDate string) (StudentStats, error) {
	return a.vault.GetStudentStats(baseDate)
}

// ListSurveys는 암호화 보관함에 저장된 학급 설문을 반환합니다.
func (a *App) ListSurveys() ([]Survey, error) { return a.vault.ListSurveys() }

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
		if appInst := application.Get(); appInst != nil {
			appInst.Event.Emit("course-roster:변경", nil)
		}
	}
	return result, err
}

func (a *App) UpdateCourseRosterStudent(rosterID string, expected CourseRoster, action, originalNumber string, next CourseRosterStudent, confirmation string) (CourseRoster, error) {
	result, err := a.vault.UpdateCourseRosterStudent(rosterID, expected, action, originalNumber, next, confirmation)
	if err == nil {
		if appInst := application.Get(); appInst != nil {
			appInst.Event.Emit("course-roster:변경", nil)
		}
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
			if appInst := application.Get(); appInst != nil {
				appInst.Event.Emit("course-roster:변경", nil)
			}
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

// SaveSurvey는 교사가 작성한 객관식 설문을 암호화 보관함에 저장합니다.
func (a *App) SaveSurvey(item Survey) (Survey, error) { return a.vault.SaveSurvey(item) }

// DeleteSurvey는 확인 문구를 받은 뒤 설문과 응답을 암호화 보관함에서 삭제합니다.
func (a *App) DeleteSurvey(surveyID, confirmation string) error {
	if err := a.vault.DeleteSurvey(surveyID, confirmation); err != nil {
		return err
	}
	a.survey.Discard(surveyID)
	return nil
}

// StartSurveySession은 교실 Wi-Fi에서만 사용할 임시 참여 주소와 QR 코드를 만듭니다.
func (a *App) StartSurveySession(surveyID string) (SurveySessionInfo, error) {
	return a.survey.Start(surveyID)
}

// StartSurveyQuestions는 참여 인증을 마친 학생 기기에 설문 문항을 엽니다.
func (a *App) StartSurveyQuestions(surveyID string) (SurveySessionInfo, error) {
	return a.survey.StartQuestions(surveyID)
}

// StopSurveySession은 학생 브라우저의 추가 접속을 닫고 설문을 마감합니다.
func (a *App) StopSurveySession(surveyID string) error { return a.survey.Stop(surveyID) }

// SetSurveyResultsPublic은 마감된 설문 집계 결과의 전자칠판 공개 여부를 바꿉니다.
func (a *App) SetSurveyResultsPublic(surveyID string, enabled bool) (SurveySessionInfo, error) {
	return a.survey.SetPublicResults(surveyID, enabled)
}

// GetSurveySessionInfo는 현재 교실 참여 세션의 접속 주소와 현황을 반환합니다.
func (a *App) GetSurveySessionInfo(surveyID string) (SurveySessionInfo, error) {
	return a.survey.Info(surveyID)
}

// SelectStudentPhoto는 학생 사진 파일을 선택합니다.
func (a *App) SelectStudentPhoto() (string, error) {
	return a.openFileDialog("학생 사진 선택", "사진 파일", "*.jpg;*.jpeg;*.png;*.webp")
}

// SaveStudentPhoto는 학생 사진을 암호화해 data 폴더에 저장합니다.
func (a *App) SaveStudentPhoto(studentID, path string) (Student, error) {
	return a.vault.SaveStudentPhoto(studentID, path)
}

// GetStudentPhoto는 잠금 해제 상태에서만 사진을 화면 표시용으로 반환합니다.
func (a *App) GetStudentPhoto(studentID string) (string, error) {
	return a.vault.GetStudentPhoto(studentID)
}

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

// DeleteConsultation은 선택한 상담 기록과 연결된 후속 기록을 삭제합니다.
func (a *App) DeleteConsultation(id string) (int, error) {
	return a.vault.DeleteConsultation(id)
}

// ResetMasterPassword는 외부 복구 파일과 복구용 암호로 마스터 비밀번호를 재설정합니다.
func (a *App) ResetMasterPassword(recoveryPath, recoveryPassword, newPassword string) error {
	if strings.TrimSpace(recoveryPath) == "" {
		return errors.New("복구 파일을 선택해 주세요")
	}
	return a.vault.ResetMasterPassword(recoveryPath, recoveryPassword, newPassword)
}

// MinimiseWindow은 프로그램 창을 작업 표시줄로 최소화합니다.
func (a *App) MinimiseWindow() {
	if a.window != nil {
		a.window.Minimise()
	}
}

// ToggleMaximiseWindow는 프로그램 창을 최대화하거나 원래 크기로 복원합니다.
func (a *App) ToggleMaximiseWindow() {
	if a.window != nil {
		a.window.ToggleMaximise()
	}
}

// IsWindowMaximised는 현재 창이 최대화 상태인지 반환합니다.
func (a *App) IsWindowMaximised() bool {
	if a.window != nil {
		return a.window.IsMaximised()
	}
	return false
}

// ToggleFullscreen은 전체화면 상태를 전환하고 현재 상태를 반환합니다.
func (a *App) ToggleFullscreen() bool {
	if a.window != nil {
		if a.window.IsFullscreen() {
			a.window.UnFullscreen()
			return false
		}
		a.window.Fullscreen()
		return true
	}
	return false
}

// CloseWindow는 프로그램을 안전하게 종료합니다.
func (a *App) CloseWindow() {
	if appInst := application.Get(); appInst != nil {
		appInst.Quit()
	}
}

// RemoveApplicationAndQuit은 최초 이용 동의를 거부한 경우 종료 뒤 실행 파일만 삭제합니다.
// 아직 보관함을 만들기 전이므로 학생 데이터와 복구 파일은 삭제 대상이 아닙니다.
func (a *App) RemoveApplicationAndQuit() error {
	executable, err := os.Executable()
	if err != nil {
		return errors.New("실행 파일 경로를 확인하지 못했습니다")
	}
	quoted := "'" + strings.ReplaceAll(executable, "'", "''") + "'"
	script := fmt.Sprintf("Start-Sleep -Seconds 1; Remove-Item -LiteralPath %s -Force -ErrorAction SilentlyContinue", quoted)
	command := exec.Command("powershell.exe", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand", encodePowerShellCommand(script))
	if err := command.Start(); err != nil {
		return errors.New("프로그램 삭제 작업을 시작하지 못했습니다")
	}
	if appInst := application.Get(); appInst != nil {
		appInst.Quit()
	}
	return nil
}

func encodePowerShellCommand(script string) string {
	characters := utf16.Encode([]rune(script))
	bytes := make([]byte, 0, len(characters)*2)
	for _, character := range characters {
		bytes = append(bytes, byte(character), byte(character>>8))
	}
	return base64.StdEncoding.EncodeToString(bytes)
}

// SaveAttendancePDF는 화면에서 완성한 단일 페이지를 PDF로 저장하고 기본 PDF 뷰어로 엽니다.
func (a *App) SaveAttendancePDF(pageDataURL, suggestedName string) (string, error) {
	encoded, found := strings.CutPrefix(pageDataURL, "data:image/png;base64,")
	if !found || encoded == "" {
		return "", errors.New("출결 서류 이미지를 준비하지 못했습니다")
	}
	pageImage, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(pageImage) == 0 {
		return "", errors.New("출결 서류 이미지를 읽지 못했습니다")
	}
	suggestedName = strings.TrimSpace(suggestedName)
	if suggestedName == "" {
		suggestedName = "출결 서류.pdf"
	}
	if !strings.EqualFold(filepath.Ext(suggestedName), ".pdf") {
		suggestedName += ".pdf"
	}
	path, err := a.saveFileDialog("출결 서류 PDF 저장", suggestedName, "PDF 파일", "*.pdf")
	if err != nil || path == "" {
		return "", err
	}
	if err := attendance.WriteAttendancePDF(pageImage, path); err != nil {
		return "", err
	}
	fileURL := (&url.URL{Scheme: "file", Path: filepath.ToSlash(path)}).String()
	if appInst := application.Get(); appInst != nil {
		_ = appInst.Browser.OpenURL(fileURL)
	}
	return path, nil
}

// PrintAttendancePDF는 완성된 출결 서류 이미지를 Windows 기본 프린터로 바로 보냅니다.
func (a *App) PrintAttendancePDF(pageDataURL string) error {
	encoded, found := strings.CutPrefix(pageDataURL, "data:image/png;base64,")
	if !found || encoded == "" {
		return errors.New("출결 서류 이미지를 준비하지 못했습니다")
	}
	pageImage, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(pageImage) == 0 {
		return errors.New("출결 서류 이미지를 읽지 못했습니다")
	}
	return attendance.PrintAttendanceImage(pageImage)
}
