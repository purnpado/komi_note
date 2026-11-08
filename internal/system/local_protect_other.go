//go:build !windows

package system

import "errors"

// LocalProtectionAvailable은 이 PC·계정에 묶는 보호 기능이 실제로 동작하는지 알려 줍니다.
// 맥 개발용 빌드에서는 동작하지 않으며, 같은 흐름만 시험할 수 있도록 자료를 그대로 통과시킵니다.
const LocalProtectionAvailable = false

// ProtectLocal은 맥 개발용 대체 구현입니다. 실제 보호 효과는 없으며 Windows 빌드에서만 보호됩니다.
func ProtectLocal(data, entropy []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("보호할 자료가 비어 있습니다")
	}
	return append([]byte(nil), data...), nil
}

// UnprotectLocal은 맥 개발용 대체 구현입니다.
func UnprotectLocal(data, entropy []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("보호된 자료가 비어 있습니다")
	}
	return append([]byte(nil), data...), nil
}
