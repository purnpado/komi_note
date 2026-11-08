//go:build !windows

package attendance

import "errors"

// PrintAttendanceImage는 출결 서류 이미지를 기본 프린터로 전송합니다.
func PrintAttendanceImage([]byte) error {
	return errors.New("바로 인쇄는 Windows에서만 사용할 수 있습니다")
}
