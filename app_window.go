package main

// 창 제어·파일 창·인쇄·프로그램 제거 바인딩

import (
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"unicode/utf16"

	"github.com/wailsapp/wails/v3/pkg/application"
)

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

func (a *App) PrintCurrentDocument() {
	if a.window != nil {
		_ = a.window.Print()
	}
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
	if a.hideOnClose() && a.window != nil {
		a.window.Hide()
		return
	}
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
