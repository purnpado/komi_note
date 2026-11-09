package main

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"TeacherNote/internal/assessment"
	"TeacherNote/internal/background"
	"TeacherNote/internal/groupsession"
	"TeacherNote/internal/seating"
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
	// 알림·트레이·자동 시작(app_background.go, app_reminder.go, app_tray_*.go)
	bg          backgroundState
	reminders   *reminderRunner
	tray        *application.SystemTray
	trayMu      sync.Mutex
	quitting    atomic.Bool
	startHidden bool
}

func (a *App) setMainWindow(win *application.WebviewWindow) {
	a.window = win
}

// 공용 유틸리티 연결
var (
	zeroBytes        = system.ZeroBytes
	writeFileAndSync = system.WriteFileAndSync
)

// NewApp은 프로그램 보관함을 준비합니다.
func NewApp() *App {
	vaultStore := vault.NewVaultStore()
	events := assessment.NewAssessmentEventBus()
	app := &App{vault: vaultStore, survey: survey.NewSurveyServer(vaultStore), seating: seating.NewSeatingServer(notifyingSeatingStore{vaultStore}), groupSession: groupsession.NewServer(), assessmentEvents: events}
	app.assessment = assessment.NewAssessmentServer(vaultStore, events)
	app.survey.OnResponse = func(surveyID string) { notifyChange(eventSurveyChanged, changeAnswered, surveyID) }
	app.bg.settings = background.Load(vaultStore.DataDir())
	app.reminders = newReminderRunner(vaultStore, app.backgroundSettings)
	events.Subscribe(func(event AssessmentEvent) {
		if appInst := application.Get(); appInst != nil {
			appInst.Event.Emit("assessment:"+event.Type, event)
		}
	})
	return app
}

// startup은 프로그램 시작 시 실행 환경을 보관합니다.
func (a *App) startup() {
	system.CleanupUpdateArtifacts()
	a.applyTray()
	go a.reminders.loop(make(chan struct{}))
	if a.startHidden {
		// Windows 시작 때 자동 실행 + 트레이 설정이면 창을 띄우지 않고 트레이에서 기다린다.
		return
	}
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
