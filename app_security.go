package main

// 보관함 열기·잠금·PIN·백업·복구·환경 설정·업데이트 바인딩

import (
	"errors"
	"path/filepath"
	"strings"
	"time"

	"TeacherNote/internal/system"
)

// ParticipationSafetyState는 자동 잠금 판단에 필요한 공개 최소 상태입니다.
// 회차 제목·학생 정보·QR 토큰은 포함하지 않습니다.
type ParticipationSafetyState struct {
	Active bool `json:"active"`
	Paused bool `json:"paused"`
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
	if a.reminders != nil {
		a.reminders.OnLock()
	}
}

// UpdateSettings는 잠금 해제한 사용자의 기본 설정을 저장합니다.
func (a *App) UpdateSettings(config ClassConfig) (SessionResult, error) {
	return a.vault.UpdateConfig(config)
}

// ResetMasterPassword는 외부 복구 파일과 복구용 암호로 마스터 비밀번호를 재설정합니다.
func (a *App) ResetMasterPassword(recoveryPath, recoveryPassword, newPassword string) error {
	if strings.TrimSpace(recoveryPath) == "" {
		return errors.New("복구 파일을 선택해 주세요")
	}
	return a.vault.ResetMasterPassword(recoveryPath, recoveryPassword, newPassword)
}
