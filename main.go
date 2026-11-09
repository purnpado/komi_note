package main

import (
	"embed"
	"log"
	"os"
	"slices"

	"TeacherNote/internal/system"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	primary, err := system.AcquireSingleInstance()
	if err != nil {
		println("프로그램 단일 실행 확인 오류:", err.Error())
		return
	}
	if !primary {
		println("꼬미노트가 이미 실행 중입니다.")
		return
	}

	appService := NewApp()
	services := []application.Service{application.NewService(appService)}
	if notifier, ok := appService.newNotificationService(); ok {
		services = append(services, notifier)
	}
	// Windows 시작 때 자동 실행이고 '창을 닫으면 트레이로'를 켰으면 창 없이 트레이에서 시작한다.
	appService.startHidden = slices.Contains(os.Args[1:], system.AutoStartArg) && appService.backgroundSettings().CloseToTray

	app := application.New(application.Options{
		Name:        "꼬미노트",
		Description: "선생님을 위한 안전한 중등교사 업무 지원 프로그램",
		Services:    services,
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "꼬미노트",
		Width:            1280,
		Height:           800,
		MinWidth:         760,
		MinHeight:        540,
		Frameless:        true,
		StartState:       application.WindowStateMaximised,
		Hidden:           appService.startHidden,
		BackgroundColour: application.NewRGBA(246, 248, 252, 255),
		URL:              "/",
	})

	appService.setMainWindow(win)
	// Alt+F4 등으로 창을 닫을 때도 트레이 설정이면 숨기기만 한다.
	win.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if appService.hideOnClose() {
			event.Cancel()
			win.Hide()
		}
	})
	appService.startup()

	err = app.Run()
	if err != nil {
		log.Fatal("프로그램 실행 오류:", err)
	}
}
