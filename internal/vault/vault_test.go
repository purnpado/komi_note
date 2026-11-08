package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func Test암호화보관함초기화잠금해제와복구(t *testing.T) {
	temporaryDir := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(temporaryDir, "vault.dat")}
	recoveryPath := filepath.Join(temporaryDir, "복구키.teacher-recovery")
	request := SetupRequest{
		Config: ClassConfig{
			SchoolName:      "가람중학교",
			SchoolYear:      "2026",
			Grade:           "2",
			ClassNumber:     "3",
			TeacherLabel:    "담임",
			AutoLockMinutes: 5,
		},
		MasterPassword:   "안전한마스터암호1234",
		RecoveryPassword: "안전한복구암호1234",
		RecoveryFilePath: recoveryPath,
	}

	result, err := store.Initialize(request)
	if err != nil {
		t.Fatalf("초기화 실패: %v", err)
	}
	if result.Config.SchoolName != "가람중학교" {
		t.Fatal("초기 설정을 복호화하지 못했습니다")
	}

	storedVault, err := os.ReadFile(store.filePath)
	if err != nil {
		t.Fatalf("보관함 읽기 실패: %v", err)
	}
	if strings.Contains(string(storedVault), "가람중학교") || strings.Contains(string(storedVault), request.MasterPassword) {
		t.Fatal("보관함에 평문 개인정보 또는 비밀번호가 남았습니다")
	}

	store.Lock()
	if _, err := store.Unlock("잘못된암호1234"); err == nil {
		t.Fatal("잘못된 비밀번호로 보관함이 열렸습니다")
	}
	if _, err := store.Unlock(request.MasterPassword); err != nil {
		t.Fatalf("올바른 비밀번호로 보관함을 열지 못했습니다: %v", err)
	}

	updated := request.Config
	updated.AutoLockMinutes = 12
	updated.ExperienceLearningUnit = "학기"
	updated.Semester1StartDate = "2026-03-02"
	updated.Semester1EndDate = "2026-07-20"
	updated.Semester1ExperienceLimit = 10
	updated.Semester2StartDate = "2026-08-17"
	updated.Semester2EndDate = "2027-01-08"
	updated.Semester2ExperienceLimit = 10
	if _, err := store.UpdateConfig(updated); err != nil {
		t.Fatalf("설정 갱신 실패: %v", err)
	}
	store.Lock()
	if err := store.ResetMasterPassword(recoveryPath, request.RecoveryPassword, "새마스터암호1234"); err != nil {
		t.Fatalf("복구 파일로 비밀번호 재설정 실패: %v", err)
	}
	if _, err := store.Unlock(request.MasterPassword); err == nil {
		t.Fatal("이전 비밀번호로 보관함이 열렸습니다")
	}
	result, err = store.Unlock("새마스터암호1234")
	if err != nil {
		t.Fatalf("새 비밀번호로 보관함을 열지 못했습니다: %v", err)
	}
	if result.Config.AutoLockMinutes != 12 || result.Config.ExperienceLearningUnit != "학기" || result.Config.Semester2ExperienceLimit != 10 {
		t.Fatal("암호화된 설정 변경값이 유지되지 않았습니다")
	}
}

func Test보관함저장시암호문순환백업을남긴다(t *testing.T) {
	temporaryDir := t.TempDir()
	path := filepath.Join(temporaryDir, "vault.dat")
	if err := writeVaultJSONSecure(path, map[string]string{"value": "첫 저장"}); err != nil {
		t.Fatalf("첫 보관함 저장 실패: %v", err)
	}
	first, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("첫 보관함 읽기 실패: %v", err)
	}
	defer zeroBytes(first)
	if err := writeVaultJSONSecure(path, map[string]string{"value": "둘째 저장"}); err != nil {
		t.Fatalf("둘째 보관함 저장 실패: %v", err)
	}
	backup, err := os.ReadFile(path + ".bak.1")
	if err != nil {
		t.Fatalf("직전 보관함 백업이 없습니다: %v", err)
	}
	defer zeroBytes(backup)
	if string(backup) != string(first) {
		t.Fatal("직전 보관함이 첫 번째 순환 백업에 보존되지 않았습니다")
	}
}

func Test자동잠금시간검사(t *testing.T) {
	if err := validateConfig(ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 0}); err == nil {
		t.Fatal("0분 자동 잠금을 허용했습니다")
	}
	if err := validateConfig(ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 121}); err == nil {
		t.Fatal("120분 초과 자동 잠금을 허용했습니다")
	}
}

func Test학기단위교외체험학습설정을검사한다(t *testing.T) {
	config := ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5, ExperienceLearningUnit: "학기", Semester1StartDate: "2026-03-02", Semester1EndDate: "2026-07-20", Semester2StartDate: "2026-08-17", Semester2EndDate: "2027-01-08"}
	if err := validateConfig(config); err != nil {
		t.Fatalf("올바른 학기 설정을 거부했습니다: %v", err)
	}
	config.Semester2EndDate = "2026-08-01"
	if err := validateConfig(config); err == nil {
		t.Fatal("종료일이 시작일보다 빠른 학기 설정을 허용했습니다")
	}
}

func Test기존보관함을실행파일data폴더로옮긴다(t *testing.T) {
	temporaryDir := t.TempDir()
	legacyPath := filepath.Join(temporaryDir, "이전", "vault.dat")
	newPath := filepath.Join(temporaryDir, "담임노트", "data", "vault.dat")
	legacyStore := &VaultStore{filePath: legacyPath}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(temporaryDir, "복구.teacher-recovery")}
	if _, err := legacyStore.Initialize(request); err != nil {
		t.Fatalf("기존 보관함 생성 실패: %v", err)
	}
	store := &VaultStore{filePath: newPath, legacyFilePath: legacyPath}
	state, err := store.State()
	if err != nil {
		t.Fatalf("보관함 이전 실패: %v", err)
	}
	if state.NeedsSetup {
		t.Fatal("이전한 보관함을 최초 설정으로 잘못 판단했습니다")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("data 폴더에 보관함이 없습니다: %v", err)
	}
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatal("이전 보관함이 남아 있습니다")
	}
	if _, err := store.Unlock(request.MasterPassword); err != nil {
		t.Fatalf("이전한 보관함을 열지 못했습니다: %v", err)
	}
}

func Test맥번들등다중레거시경로보관함이전(t *testing.T) {
	temporaryDir := t.TempDir()
	candidate1 := filepath.Join(temporaryDir, "존재하지않는경로", "vault.dat")
	bundlePath := filepath.Join(temporaryDir, "꼬미노트.app", "Contents", "MacOS", "data", "vault.dat")
	standardPath := filepath.Join(temporaryDir, "Library", "Application Support", "꼬미노트", "data", "vault.dat")

	bundleStore := &VaultStore{filePath: bundlePath}
	request := SetupRequest{
		Config:           ClassConfig{SchoolYear: "2026", Grade: "3", ClassNumber: "1", AutoLockMinutes: 10},
		MasterPassword:   "안전한마스터암호1234",
		RecoveryPassword: "안전한복구암호1234",
		RecoveryFilePath: filepath.Join(temporaryDir, "복구.teacher-recovery"),
	}
	if _, err := bundleStore.Initialize(request); err != nil {
		t.Fatalf("번들 내부 보관함 초기화 실패: %v", err)
	}

	newStore := &VaultStore{
		filePath:        standardPath,
		legacyFilePaths: []string{candidate1, bundlePath},
	}
	state, err := newStore.State()
	if err != nil {
		t.Fatalf("다중 후보 마이그레이션 실패: %v", err)
	}
	if state.NeedsSetup {
		t.Fatal("마이그레이션된 보관함을 최초 설정 상태로 잘못 판단했습니다")
	}
	if _, err := os.Stat(standardPath); err != nil {
		t.Fatalf("표준 경로에 보관함이 없습니다: %v", err)
	}
	if _, err := os.Stat(bundlePath); !os.IsNotExist(err) {
		t.Fatal("번들 내부의 이전 보관함이 삭제되지 않고 남아 있습니다")
	}
	if _, err := newStore.Unlock(request.MasterPassword); err != nil {
		t.Fatalf("마이그레이션된 보관함을 열지 못했습니다: %v", err)
	}
}

func Test간편PIN로그인및실패제한(t *testing.T) {
	temporaryDir := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(temporaryDir, "vault.dat")}
	request := SetupRequest{
		Config:           ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "2", AutoLockMinutes: 5},
		MasterPassword:   "마스터비밀번호1234",
		RecoveryPassword: "복구비밀번호1234",
		RecoveryFilePath: filepath.Join(temporaryDir, "복구.teacher-recovery"),
	}

	if _, err := store.Initialize(request); err != nil {
		t.Fatalf("초기화 실패: %v", err)
	}

	// 초기 상태: PIN 미설정
	hasPin, err := store.HasPin()
	if err != nil || hasPin {
		t.Fatalf("초기 상태에 PIN이 없어야 합니다: %v", err)
	}

	// 유효하지 않은 PIN (문자 포함 또는 길이 오류)
	if err := store.SetPin("12a4"); err == nil {
		t.Fatal("숫자가 아닌 PIN이 허용되었습니다")
	}
	if err := store.SetPin("123"); err == nil {
		t.Fatal("4자리 미만 PIN이 허용되었습니다")
	}

	// 6자리 PIN 설정 성공
	if err := store.SetPin("123456"); err != nil {
		t.Fatalf("PIN 설정 실패: %v", err)
	}
	hasPin, err = store.HasPin()
	if err != nil || !hasPin {
		t.Fatal("PIN 설정 후 HasPin이 true여야 합니다")
	}

	// 잠금 후 PIN 로그인
	store.Lock()

	// 잘못된 PIN 4회 입력
	for i := 1; i <= 4; i++ {
		if _, err := store.UnlockWithPin("999999"); err == nil {
			t.Fatal("잘못된 PIN으로 보관함이 열렸습니다")
		}
	}
	state, _ := store.State()
	if state.PinLocked {
		t.Fatal("4회 실패에서는 아직 잠기지 않아야 합니다")
	}
	if state.PinAttempts != 4 {
		t.Fatalf("실패 횟수가 4여야 합니다: %d", state.PinAttempts)
	}

	// 5회째 실패 -> PIN 잠금
	if _, err := store.UnlockWithPin("999999"); err == nil {
		t.Fatal("잘못된 PIN으로 보관함이 열렸습니다")
	}
	state, _ = store.State()
	if !state.PinLocked {
		t.Fatal("5회 실패 시 PIN이 잠겨야 합니다")
	}

	// PIN이 잠긴 상태에서는 올바른 PIN도 거부됨
	if _, err := store.UnlockWithPin("123456"); err == nil {
		t.Fatal("PIN 잠금 상태에서는 올바른 PIN도 로그인할 수 없어야 합니다")
	}

	// 마스터 비밀번호로 로그인하면 PIN 잠금 해제 및 리셋
	if _, err := store.Unlock(request.MasterPassword); err != nil {
		t.Fatalf("마스터 비밀번호로 보관함을 열지 못했습니다: %v", err)
	}
	state, _ = store.State()
	if state.PinLocked || state.PinAttempts != 0 {
		t.Fatal("마스터 비밀번호 로그인 후 PIN 실패 카운터가 리셋되어야 합니다")
	}

	// 다시 잠금 후 이번엔 올바른 PIN으로 로그인 성공 확인
	store.Lock()
	res, err := store.UnlockWithPin("123456")
	if err != nil {
		t.Fatalf("올바른 PIN으로 보관함을 열지 못했습니다: %v", err)
	}
	if res.Config.Grade != "1" {
		t.Fatal("PIN으로 열린 보관함 설정이 올바르지 않습니다")
	}

	// PIN 삭제 테스트
	if err := store.RemovePin(); err != nil {
		t.Fatalf("PIN 삭제 실패: %v", err)
	}
	hasPin, err = store.HasPin()
	if err != nil || hasPin {
		t.Fatal("PIN 삭제 후 HasPin이 false여야 합니다")
	}
}

// Test비밀번호와PIN변경후예전백업이예전자격증명으로열리지않는다는 순환 백업에
// 예전 비밀번호·PIN 래핑이 남아 유출된 예전 자격 증명으로 학생 자료가 열리는 문제를 막는다.
func Test비밀번호와PIN변경후예전백업이예전자격증명으로열리지않는다(t *testing.T) {
	temporaryDir := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(temporaryDir, "vault.dat")}
	recoveryPath := filepath.Join(temporaryDir, "복구키.teacher-recovery")
	oldPassword, newPassword, recoveryPassword := "예전마스터암호1234", "새마스터암호12345", "안전한복구암호1234"
	config := ClassConfig{SchoolName: "가람중학교", SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}
	if _, err := store.Initialize(SetupRequest{Config: config, MasterPassword: oldPassword, RecoveryPassword: recoveryPassword, RecoveryFilePath: recoveryPath}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPin("1234"); err != nil {
		t.Fatal(err)
	}
	for minutes := 6; minutes <= 8; minutes++ {
		config.AutoLockMinutes = minutes
		if _, err := store.UpdateConfig(config); err != nil {
			t.Fatal(err)
		}
	}
	if err := store.RemovePin(); err != nil {
		t.Fatal(err)
	}
	backupPaths := []string{store.filePath + ".bak.1", store.filePath + ".bak.2", store.filePath + ".bak.3"}
	for _, backupPath := range backupPaths {
		backup := NewVaultStoreWithPaths(backupPath, "")
		if _, err := backup.UnlockWithPin("1234"); err == nil {
			t.Fatalf("PIN 삭제 뒤에도 예전 PIN으로 백업이 열림: %s", backupPath)
		}
	}

	store.Lock()
	if err := store.ResetMasterPassword(recoveryPath, recoveryPassword, newPassword); err != nil {
		t.Fatal(err)
	}
	for _, backupPath := range backupPaths {
		backup := NewVaultStoreWithPaths(backupPath, "")
		if _, err := backup.Unlock(oldPassword); err == nil {
			t.Fatalf("비밀번호 재설정 뒤에도 예전 비밀번호로 백업이 열림: %s", backupPath)
		}
		if _, err := backup.Unlock(newPassword); err != nil {
			t.Fatalf("새 비밀번호로 백업을 복원할 수 없음: %s: %v", backupPath, err)
		}
	}
	if _, err := store.Unlock(newPassword); err != nil {
		t.Fatalf("새 비밀번호로 보관함을 열지 못함: %v", err)
	}
}
