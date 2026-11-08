//go:build !windows

package system

// AcquireSingleInstance는 개발 도구의 비Windows 검사 환경에서는 단일 실행 잠금을 적용하지 않는다.
func AcquireSingleInstance() (bool, error) { return true, nil }

