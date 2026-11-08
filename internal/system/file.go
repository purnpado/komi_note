package system

import (
	"os"
)

// ZeroBytes는 메모리에 남은 민감한 바이트 슬라이스를 0으로 덮어씁니다.
func ZeroBytes(value []byte) {
	for index := range value {
		value[index] = 0
	}
}

// WriteFileAndSync는 파일을 안전하게 쓰고 디스크에 즉시 동기화(fsync)합니다.
func WriteFileAndSync(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	if _, err := file.Write(payload); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	return file.Close()
}

