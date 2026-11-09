package main

import (
	"errors"
	"sync"

	"TeacherNote/internal/background"
	"TeacherNote/internal/system"
)

// 알림·트레이·자동 시작 설정과 '확인할 알림' 바인딩. 설정은 data 폴더 평문 파일(켜기/끄기·시각만)에 둔다.

type BackgroundSettings = background.Settings

// BackgroundInfo는 설정과 이 컴퓨터에서 쓸 수 있는 기능을 함께 돌려준다.
type BackgroundInfo struct {
	Settings           BackgroundSettings `json:"settings"`
	AutoStartSupported bool               `json:"autoStartSupported"`
	DesktopSupported   bool               `json:"desktopSupported"`
}

type backgroundState struct {
	mu       sync.Mutex
	settings background.Settings
}

func (a *App) backgroundSettings() background.Settings {
	a.bg.mu.Lock()
	defer a.bg.mu.Unlock()
	return a.bg.settings
}

func (a *App) backgroundInfo() BackgroundInfo {
	return BackgroundInfo{Settings: a.backgroundSettings(), AutoStartSupported: system.AutoStartSupported() && !serverMode, DesktopSupported: !serverMode}
}

// GetBackgroundSettings는 알림·트레이·자동 시작 설정을 돌려줍니다.
func (a *App) GetBackgroundSettings() BackgroundInfo { return a.backgroundInfo() }

// SaveBackgroundSettings는 설정을 저장하고 자동 시작·트레이에 바로 적용합니다.
func (a *App) SaveBackgroundSettings(next BackgroundSettings) (BackgroundInfo, error) {
	if !a.vault.IsUnlocked() {
		return BackgroundInfo{}, errors.New("먼저 보관함을 열어 주세요")
	}
	previous := a.backgroundSettings()
	if next.AutoStart != previous.AutoStart {
		if err := system.SetAutoStart(next.AutoStart); err != nil {
			return BackgroundInfo{}, err
		}
	}
	saved, err := background.Save(a.vault.DataDir(), next)
	if err != nil {
		if next.AutoStart != previous.AutoStart {
			_ = system.SetAutoStart(previous.AutoStart)
		}
		return BackgroundInfo{}, err
	}
	a.bg.mu.Lock()
	a.bg.settings = saved
	a.bg.mu.Unlock()
	a.applyTray()
	return a.backgroundInfo(), nil
}

// SendTestNotification은 Windows 알림이 보이는지 확인하는 시험 알림을 보냅니다.
func (a *App) SendTestNotification() error {
	if a.reminders.toast == nil {
		return errors.New("이 실행 환경에서는 Windows 알림을 보낼 수 없습니다(화면 검사용 서버 모드)")
	}
	return a.reminders.toast.Send("kkomi-test", "꼬미노트 시험 알림", "이 알림이 보이면 Windows 알림 설정이 끝났습니다.")
}

// GetReminderInbox는 프로그램 안 '확인할 알림' 목록을 돌려줍니다.
func (a *App) GetReminderInbox() ([]ReminderInboxItem, error) {
	if !a.vault.IsUnlocked() {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	return a.reminders.Inbox(), nil
}

// DismissReminder는 알림을 확인 처리합니다(빈 번호면 모두).
func (a *App) DismissReminder(key string) {
	a.reminders.Dismiss(key)
	notifyChange(eventReminderChanged, "확인", key)
}

// SnoozeReminder는 알림을 minutes분 뒤에 다시 울리게 합니다.
func (a *App) SnoozeReminder(key string, minutes int) error {
	if err := a.reminders.Snooze(key, minutes); err != nil {
		return err
	}
	notifyChange(eventReminderChanged, "다시 알림", key)
	return nil
}
