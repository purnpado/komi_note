package system

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// ResolveBaseDirectory는 운영체제 및 실행 환경에 맞는 안전한 데이터 저장소 기본 디렉터리를 결정합니다.
// - Windows/Linux: 실행 파일(.exe)이 위치한 폴더 (포터블 무설치 기준)
// - macOS:
//   1. 터미널/바이너리 직접 실행: 바이너리가 위치한 폴더
//   2. 맥 앱 번들(.app) 내부 실행:
//      - .app 바로 옆에 data/ 폴더가 있거나 .portable 마커가 있는 경우: .app이 놓인 폴더 (포터블 모드)
//      - 그 외(/Applications 등): 맥 표준 사용자 데이터 경로 (~/Library/Application Support/꼬미노트)
func ResolveBaseDirectory() string {
	executablePath, err := os.Executable()
	if err != nil {
		return "."
	}
	return ResolveBaseDirFromExecutable(executablePath)
}

// ResolveBaseDirFromExecutable은 주어진 실행 파일 경로를 기준으로 기본 데이터 폴더를 계산합니다 (테스트 가능).
func ResolveBaseDirFromExecutable(executablePath string) string {
	execDir := filepath.Dir(executablePath)

	if runtime.GOOS != "darwin" {
		return execDir
	}

	cleanPath := filepath.Clean(executablePath)
	if !strings.Contains(cleanPath, ".app/Contents/MacOS") {
		return execDir
	}

	// .app 번들이 놓여 있는 상위 폴더 찾기
	appParentDir := execDir
	curr := execDir
	for {
		if strings.HasSuffix(curr, ".app") {
			appParentDir = filepath.Dir(curr)
			break
		}
		parent := filepath.Dir(curr)
		if parent == curr {
			break
		}
		curr = parent
	}

	// 1순위: .app 바로 옆에 data 폴더가 이미 있거나 .portable 마커가 있으면 포터블 모드로 사용
	if _, err := os.Stat(filepath.Join(appParentDir, "data")); err == nil {
		return appParentDir
	}
	if _, err := os.Stat(filepath.Join(appParentDir, ".portable")); err == nil {
		return appParentDir
	}

	// 2순위: 맥 표준 사용자 설정/데이터 경로 (~/Library/Application Support/꼬미노트)
	configDir, err := os.UserConfigDir()
	if err == nil && configDir != "" {
		return filepath.Join(configDir, "꼬미노트")
	}

	return appParentDir
}

