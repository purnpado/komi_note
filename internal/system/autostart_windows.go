//go:build windows

package system

import (
	"errors"
	"os"

	"golang.org/x/sys/windows/registry"
)

const autostartKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const autostartName = "KkomiNote"

// AutoStartArg는 Windows 시작 때 붙는 표시입니다(트레이로 조용히 시작할지 판단).
const AutoStartArg = "--autostart"

// SetAutoStart는 현재 사용자 시작 프로그램에 꼬미노트를 등록하거나 지웁니다(관리자 권한 필요 없음).
func SetAutoStart(enabled bool) error {
	key, _, err := registry.CreateKey(registry.CURRENT_USER, autostartKey, registry.SET_VALUE|registry.QUERY_VALUE)
	if err != nil {
		return errors.New("Windows 시작 프로그램 설정을 열지 못했습니다")
	}
	defer key.Close()
	if !enabled {
		if err := key.DeleteValue(autostartName); err != nil && !errors.Is(err, registry.ErrNotExist) {
			return errors.New("Windows 시작 프로그램에서 지우지 못했습니다")
		}
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	// 경로를 따옴표로 감싸 한글·빈칸이 있는 폴더도 그대로 실행되게 한다.
	if err := key.SetStringValue(autostartName, `"`+exe+`" `+AutoStartArg); err != nil {
		return errors.New("Windows 시작 프로그램에 등록하지 못했습니다")
	}
	return nil
}

// AutoStartSupported는 이 운영체제에서 자동 시작을 지원하는지 알려 줍니다.
func AutoStartSupported() bool { return true }
