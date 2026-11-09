//go:build server

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// 화면 검사용 서버 모드: 트레이·운영체제 알림이 없다(알림은 프로그램 안 목록에만 쌓인다).

const serverMode = true

func (a *App) newNotificationService() (application.Service, bool) {
	return application.Service{}, false
}
func (a *App) showMainWindow()   {}
func (a *App) applyTray()        {}
func (a *App) hideOnClose() bool { return false }
