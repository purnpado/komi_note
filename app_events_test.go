package main

import (
	"encoding/json"
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"TeacherNote/internal/assessment"
	"TeacherNote/internal/survey"
	"TeacherNote/internal/vault"
)

type sentChange struct {
	Name   string
	Notice ChangeNotice
}

// captureChanges는 테스트 동안 변경 알림을 가로채 모읍니다.
func captureChanges(t *testing.T) func() []sentChange {
	t.Helper()
	var mu sync.Mutex
	var sent []sentChange
	previous := emitChange
	emitChange = func(name string, notice ChangeNotice) {
		mu.Lock()
		defer mu.Unlock()
		sent = append(sent, sentChange{Name: name, Notice: notice})
	}
	t.Cleanup(func() { emitChange = previous })
	return func() []sentChange {
		mu.Lock()
		defer mu.Unlock()
		return append([]sentChange{}, sent...)
	}
}

// newUnlockedTestApp은 임시 폴더에 새 보관함을 만들어 연 App을 돌려줍니다.
func newUnlockedTestApp(t *testing.T) *App {
	t.Helper()
	dir := t.TempDir()
	store := vault.NewVaultStoreWithPaths(filepath.Join(dir, "data", "vault.dat"), filepath.Join(dir, "backup_key"))
	events := assessment.NewAssessmentEventBus()
	app := &App{vault: store, survey: survey.NewSurveyServer(store), assessmentEvents: events, assessment: assessment.NewAssessmentServer(store, events)}
	_, err := app.InitializeVault(SetupRequest{
		Config:           ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", TeacherRole: "담임 교사", AutoLockMinutes: 10},
		MasterPassword:   "테스트용암호123456!",
		RecoveryPassword: "테스트용복구123456!",
		RecoveryFilePath: filepath.Join(dir, "backup_key", "복구.teacher-recovery"),
	})
	if err != nil {
		t.Fatalf("보관함 준비 실패: %v", err)
	}
	return app
}

func TestNotifyAfter는성공때만알림을보낸다(t *testing.T) {
	sent := captureChanges(t)
	value, err := notifyAfter(eventMemoChanged, changeAdded, func(v string) string { return v }, "m1", nil)
	if err != nil || value != "m1" {
		t.Fatalf("결과가 바뀌면 안 됩니다: %v %v", value, err)
	}
	_, err = notifyAfter(eventMemoChanged, changeAdded, func(v string) string { return v }, "m2", errors.New("저장 실패"))
	if err == nil {
		t.Fatal("오류가 그대로 돌아와야 합니다")
	}
	got := sent()
	if len(got) != 1 || got[0].Name != "memo:변경" || got[0].Notice != (ChangeNotice{Kind: "추가", ID: "m1"}) {
		t.Fatalf("성공한 저장 하나만 알려야 합니다: %+v", got)
	}
}

func TestChangeNotice에는종류와번호만있다(t *testing.T) {
	raw, err := json.Marshal(ChangeNotice{Kind: changeDeleted, ID: "abc"})
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]any
	if err := json.Unmarshal(raw, &fields); err != nil {
		t.Fatal(err)
	}
	if len(fields) != 2 || fields["kind"] != "삭제" || fields["id"] != "abc" {
		t.Fatalf("알림에는 kind·id만 있어야 합니다: %s", raw)
	}
}

func Test수업명렬바꾸면변경알림을보낸다(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	_, err := app.UpdateCourseRosterStudent("없는-명렬", CourseRoster{}, "edit", "1", CourseRosterStudent{}, "")
	if err == nil {
		t.Fatal("없는 명렬은 오류여야 합니다")
	}
	if len(sent()) != 0 {
		t.Fatalf("실패하면 알림을 보내면 안 됩니다: %+v", sent())
	}
}
