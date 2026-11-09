//go:build !windows

package system

import "errors"

// AutoStartArg는 Windows 시작 때 붙는 표시입니다.
const AutoStartArg = "--autostart"

// SetAutoStart는 Windows에서만 동작합니다(맥 개발용에서는 끄기만 허용).
func SetAutoStart(enabled bool) error {
	if enabled {
		return errors.New("Windows 시작 시 자동 실행은 Windows에서만 쓸 수 있습니다")
	}
	return nil
}

// AutoStartSupported는 이 운영체제에서 자동 시작을 지원하는지 알려 줍니다.
func AutoStartSupported() bool { return false }
