package background

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSettings기본값과저장읽기(t *testing.T) {
	dir := t.TempDir()
	got := Load(dir)
	if got.NotifyEnabled || got.CloseToTray || got.AutoStart || got.NotifyDetail != DetailProtected {
		t.Fatalf("모두 기본 끔·보호 표시: %+v", got)
	}
	saved, err := Save(dir, Settings{NotifyEnabled: true, NotifyDetail: "아무거나", CloseToTray: true})
	if err != nil {
		t.Fatal(err)
	}
	if saved.NotifyDetail != DetailProtected || saved.QuietStart != "22:00" {
		t.Fatalf("빈 값 채우기: %+v", saved)
	}
	if again := Load(dir); again != saved {
		t.Fatalf("다시 읽기: %+v", again)
	}
	if _, err := Save(dir, Settings{QuietEnabled: true, QuietStart: "25:00"}); err == nil {
		t.Fatal("잘못된 시각은 거부")
	}
	os.WriteFile(filepath.Join(dir, fileName), []byte("{깨짐"), 0o600)
	if Load(dir) != Default() {
		t.Fatal("깨진 파일은 기본값")
	}
}

func TestSettings조용한시간(t *testing.T) {
	at := func(clock string) time.Time {
		v, _ := time.ParseInLocation("2006-01-02 15:04", "2026-11-09 "+clock, time.Local)
		return v
	}
	night := Settings{QuietEnabled: true, QuietStart: "22:00", QuietEnd: "07:00"}
	for clock, want := range map[string]bool{"21:59": false, "22:00": true, "03:00": true, "06:59": true, "07:00": false, "12:00": false} {
		if night.InQuiet(at(clock)) != want {
			t.Errorf("밤 구간 %s: %v", clock, !want)
		}
	}
	lunch := Settings{QuietEnabled: true, QuietStart: "12:00", QuietEnd: "13:00"}
	if !lunch.InQuiet(at("12:30")) || lunch.InQuiet(at("13:00")) {
		t.Fatal("낮 구간")
	}
	if (Settings{QuietStart: "00:00", QuietEnd: "23:59"}).InQuiet(at("10:00")) {
		t.Fatal("끈 상태는 조용한 시간 아님")
	}
}
