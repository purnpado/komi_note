//go:build windows

package system

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/windows"
)

var singleInstanceHandle windows.Handle

// AcquireSingleInstance는 같은 Windows 사용자 세션에서 보관함을 동시에 여는 일을 막는다.
func AcquireSingleInstance() (bool, error) {
	kernel32 := windows.NewLazySystemDLL("kernel32.dll")
	createMutex := kernel32.NewProc("CreateMutexW")
	name, err := windows.UTF16PtrFromString("Local\\KkomiNoteSingleInstanceMutex")
	if err != nil {
		return false, err
	}
	handle, _, callErr := createMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
	if handle == 0 {
		if callErr != nil && !errors.Is(callErr, windows.ERROR_SUCCESS) {
			return false, callErr
		}
		return false, errors.New("단일 실행 잠금을 만들지 못했습니다")
	}
	if windows.GetLastError() == windows.ERROR_ALREADY_EXISTS {
		_ = windows.CloseHandle(windows.Handle(handle))
		return false, nil
	}
	singleInstanceHandle = windows.Handle(handle)
	return true, nil
}

