package system

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestResolveBaseDirFromExecutable(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS 전용 경로 테스트입니다.")
	}

	tempDir := t.TempDir()

	// 1. 일반 바이너리 실행 테스트
	plainBin := filepath.Join(tempDir, "bin", "꼬미노트")
	resolved := ResolveBaseDirFromExecutable(plainBin)
	if resolved != filepath.Join(tempDir, "bin") {
		t.Fatalf("일반 바이너리 경로 불일치: %s", resolved)
	}

	// 2. .app 번들 기본 테스트 (표준 Application Support 경로)
	appBundlePath := filepath.Join(tempDir, "Apps", "꼬미노트.app", "Contents", "MacOS", "꼬미노트")
	_ = os.MkdirAll(filepath.Dir(appBundlePath), 0755)

	userConfig, _ := os.UserConfigDir()
	expectedStandard := filepath.Join(userConfig, "꼬미노트")

	resolvedApp := ResolveBaseDirFromExecutable(appBundlePath)
	if resolvedApp != expectedStandard {
		t.Fatalf(".app 번들 표준 경로 불일치: got=%s, want=%s", resolvedApp, expectedStandard)
	}

	// 3. .app 옆에 data 폴더가 있는 경우 (포터블 모드 감지)
	appParent := filepath.Join(tempDir, "Apps")
	_ = os.MkdirAll(filepath.Join(appParent, "data"), 0755)

	resolvedPortable := ResolveBaseDirFromExecutable(appBundlePath)
	if resolvedPortable != appParent {
		t.Fatalf(".app 포터블 감지 경로 불일치: got=%s, want=%s", resolvedPortable, appParent)
	}
}

