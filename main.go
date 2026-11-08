package main

import (
	"embed"
	"log"

	"TeacherNote/internal/system"

	"github.com/wailsapp/wails/v3/pkg/application"
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

	app := application.New(application.Options{
		Name:        "꼬미노트",
		Description: "선생님을 위한 안전한 중등교사 업무 지원 프로그램",
		Services: []application.Service{
			application.NewService(appService),
		},
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
		BackgroundColour: application.NewRGBA(246, 248, 252, 255),
		URL:              "/",
	})

	appService.setMainWindow(win)
	appService.startup()

	err = app.Run()
	if err != nil {
		log.Fatal("프로그램 실행 오류:", err)
	}
}
