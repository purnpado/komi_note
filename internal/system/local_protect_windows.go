//go:build windows

package system

import (
	"errors"
	"unsafe"

	"golang.org/x/sys/windows"
)

// LocalProtectionAvailable은 이 PC·계정에 묶는 보호 기능이 실제로 동작하는지 알려 줍니다.
const LocalProtectionAvailable = true

// ProtectLocal은 Windows DPAPI로 자료를 감싸 같은 PC의 같은 Windows 계정에서만 풀리게 합니다.
// entropy는 꼬미노트 전용 구분 값으로, 다른 프로그램이 같은 계정으로 감싼 자료와 섞이지 않게 합니다.
func ProtectLocal(data, entropy []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("보호할 자료가 비어 있습니다")
	}
	in := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var entropyBlob *windows.DataBlob
	if len(entropy) > 0 {
		entropyBlob = &windows.DataBlob{Size: uint32(len(entropy)), Data: &entropy[0]}
	}
	var out windows.DataBlob
	if err := windows.CryptProtectData(&in, nil, entropyBlob, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return takeDataBlob(&out), nil
}

// UnprotectLocal은 ProtectLocal로 감싼 자료를 풉니다. 다른 PC나 다른 Windows 계정에서는 실패합니다.
func UnprotectLocal(data, entropy []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("보호된 자료가 비어 있습니다")
	}
	in := windows.DataBlob{Size: uint32(len(data)), Data: &data[0]}
	var entropyBlob *windows.DataBlob
	if len(entropy) > 0 {
		entropyBlob = &windows.DataBlob{Size: uint32(len(entropy)), Data: &entropy[0]}
	}
	var out windows.DataBlob
	if err := windows.CryptUnprotectData(&in, nil, entropyBlob, 0, nil, windows.CRYPTPROTECT_UI_FORBIDDEN, &out); err != nil {
		return nil, err
	}
	return takeDataBlob(&out), nil
}

// takeDataBlob은 Windows가 할당한 결과를 Go 메모리로 복사하고, 원본을 0으로 지운 뒤 해제합니다.
func takeDataBlob(blob *windows.DataBlob) []byte {
	if blob.Data == nil || blob.Size == 0 {
		return nil
	}
	source := unsafe.Slice(blob.Data, blob.Size)
	result := make([]byte, len(source))
	copy(result, source)
	ZeroBytes(source)
	_, _ = windows.LocalFree(windows.Handle(unsafe.Pointer(blob.Data)))
	return result
}
