//go:build !server

package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

// 데스크톱(Windows·맥) 전용: 트레이 아이콘·창 닫기 동작·운영체제 알림.

const serverMode = false

//go:embed build/tray-icon.png
var trayIcon []byte

type desktopToaster struct {
	service *notifications.NotificationService
}

func (t desktopToaster) Send(id, title, body string) error {
	return t.service.SendNotification(notifications.NotificationOptions{ID: id, Title: title, Body: body})
}

// newNotificationService는 운영체제 알림 서비스를 만들고, 알림을 누르면 창을 연다.
func (a *App) newNotificationService() (application.Service, bool) {
	service := notifications.New()
	service.OnNotificationResponse(func(notifications.NotificationResult) { a.showMainWindow() })
	a.reminders.toast = desktopToaster{service: service}
	return application.NewService(service), true
}

func (a *App) showMainWindow() {
	if a.window == nil {
		return
	}
	a.window.Show()
	a.window.UnMinimise()
	a.window.Focus()
}

// applyTray는 '창을 닫으면 트레이로' 설정에 맞춰 트레이 아이콘을 만들거나 없앤다.
func (a *App) applyTray() {
	appInst := application.Get()
	if appInst == nil {
		return
	}
	want := a.backgroundSettings().CloseToTray
	a.trayMu.Lock()
	defer a.trayMu.Unlock()
	if !want {
		if a.tray != nil {
			a.tray.Destroy()
			a.tray = nil
		}
		return
	}
	if a.tray != nil {
		return
	}
	tray := appInst.SystemTray.New()
	tray.SetIcon(trayIcon)
	tray.SetTooltip("꼬미노트")
	menu := application.NewMenu()
	menu.Add("꼬미노트 열기").OnClick(func(*application.Context) { a.showMainWindow() })
	menu.Add("빠른 메모").OnClick(func(*application.Context) {
		a.showMainWindow()
		appInst.Event.Emit("app:빠른메모", nil)
	})
	menu.Add("화면 잠금").OnClick(func(*application.Context) { appInst.Event.Emit("app:잠금요청", nil) })
	menu.AddSeparator()
	menu.Add("완전 종료").OnClick(func(*application.Context) {
		a.quitting.Store(true)
		appInst.Quit()
	})
	tray.SetMenu(menu)
	tray.OnClick(a.showMainWindow)
	a.tray = tray
}

// hideOnClose는 창을 닫을 때 끄지 않고 트레이로 숨길지 알려 준다.
func (a *App) hideOnClose() bool {
	a.trayMu.Lock()
	defer a.trayMu.Unlock()
	return a.tray != nil && a.backgroundSettings().CloseToTray && !a.quitting.Load()
}
