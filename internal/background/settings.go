// Package background는 Windows 자동 시작·트레이·알림 설정을 담는다.
// 프로그램을 켜자마자(보관함이 잠긴 채로) 읽어야 하므로 data 폴더의 평문 파일에 둔다.
// 학생 정보·일정 내용은 넣지 않고 켜기/끄기와 시각만 둔다.
package background

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// DetailProtected는 알림에 내용을 숨기는 보호 표시, DetailTitle은 제목을 보이는 표시다.
const (
	DetailProtected = "보호"
	DetailTitle     = "제목"
	fileName        = "background-settings.json"
)

// Settings는 알림·트레이·자동 시작 설정이다. 모두 기본 끔.
type Settings struct {
	NotifyEnabled bool   `json:"notifyEnabled"`
	NotifyDetail  string `json:"notifyDetail"`
	CloseToTray   bool   `json:"closeToTray"`
	AutoStart     bool   `json:"autoStart"`
	QuietEnabled  bool   `json:"quietEnabled"`
	QuietStart    string `json:"quietStart"`
	QuietEnd      string `json:"quietEnd"`
}

// Default는 처음 값이다(알림 끔·보호 표시·창 닫으면 완전 종료·자동 시작 끔·조용한 시간 22~07시 끔).
func Default() Settings {
	return Settings{NotifyDetail: DetailProtected, QuietStart: "22:00", QuietEnd: "07:00"}
}

func validClock(value string) bool {
	_, err := time.Parse("15:04", value)
	return err == nil
}

// Normalize는 설정을 검사하고 빈 값을 채운다.
func Normalize(s Settings) (Settings, error) {
	if s.NotifyDetail != DetailTitle {
		s.NotifyDetail = DetailProtected
	}
	if s.QuietStart == "" {
		s.QuietStart = "22:00"
	}
	if s.QuietEnd == "" {
		s.QuietEnd = "07:00"
	}
	if !validClock(s.QuietStart) || !validClock(s.QuietEnd) {
		return Settings{}, errors.New("조용한 시간을 확인해 주세요")
	}
	if s.QuietEnabled && s.QuietStart == s.QuietEnd {
		return Settings{}, errors.New("조용한 시간의 시작과 끝이 같습니다")
	}
	return s, nil
}

// Load는 data 폴더의 설정을 읽는다. 없거나 깨졌으면 기본값을 쓴다.
func Load(dataDir string) Settings {
	raw, err := os.ReadFile(filepath.Join(dataDir, fileName))
	if err != nil {
		return Default()
	}
	var s Settings
	if json.Unmarshal(raw, &s) != nil {
		return Default()
	}
	normalized, err := Normalize(s)
	if err != nil {
		return Default()
	}
	return normalized
}

// Save는 설정을 검사해 data 폴더에 저장한다.
func Save(dataDir string, s Settings) (Settings, error) {
	normalized, err := Normalize(s)
	if err != nil {
		return Settings{}, err
	}
	raw, err := json.MarshalIndent(normalized, "", "  ")
	if err != nil {
		return Settings{}, err
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return Settings{}, err
	}
	path := filepath.Join(dataDir, fileName)
	temp := path + ".tmp"
	if err := os.WriteFile(temp, raw, 0o600); err != nil {
		return Settings{}, err
	}
	if err := os.Rename(temp, path); err != nil {
		_ = os.Remove(temp)
		return Settings{}, err
	}
	return normalized, nil
}

// InQuiet은 now가 조용한 시간 안인지 알려 준다(밤을 넘는 구간도 처리).
func (s Settings) InQuiet(now time.Time) bool {
	if !s.QuietEnabled {
		return false
	}
	clock := now.Format("15:04")
	if s.QuietStart < s.QuietEnd {
		return clock >= s.QuietStart && clock < s.QuietEnd
	}
	return clock >= s.QuietStart || clock < s.QuietEnd
}
