package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	testMaster   = "안전한마스터암호1234"
	testRecovery = "안전한복구암호1234"
)

func newTestVault(t *testing.T, dir string) *VaultStore {
	t.Helper()
	store := &VaultStore{filePath: filepath.Join(dir, "data", "vault.dat")}
	if err := os.MkdirAll(filepath.Join(dir, "data"), 0o700); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: testMaster, RecoveryPassword: testRecovery, RecoveryFilePath: filepath.Join(dir, "복구.teacher-recovery")}); err != nil {
		t.Fatalf("보관함 생성 실패: %v", err)
	}
	return store
}

func TestExportAndRestoreBackupRoundTrip(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	if _, err := store.AddStudent(Student{Number: 1, Name: "가상학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"}); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPin("1234"); err != nil {
		t.Fatal(err)
	}
	backupPath := filepath.Join(dir, "usb", "백업.kkomi-backup")
	if err := os.MkdirAll(filepath.Dir(backupPath), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatalf("백업 실패: %v", err)
	}
	raw, _ := os.ReadFile(backupPath)
	if strings.Contains(string(raw), "가상학생") {
		t.Fatal("백업 파일에 학생 이름이 평문으로 있으면 안 됩니다")
	}
	if strings.Contains(string(raw), "pinProtected") || strings.Contains(string(raw), "pinSalt") {
		t.Fatal("백업 파일에는 이 PC에 묶인 PIN 정보가 없어야 합니다")
	}

	// 백업 뒤 학생을 지웠다가 되살리면 다시 나타나야 한다.
	if _, err := store.ResetStudents("학생 명렬 초기화"); err != nil {
		t.Fatalf("명렬 초기화 실패: %v", err)
	}
	result, err := store.RestoreBackup(backupPath, testMaster)
	if err != nil {
		t.Fatalf("되살리기 실패: %v", err)
	}
	if result.StudentCount != 1 || result.RecoveryMismatch {
		t.Fatalf("되살리기 결과가 올바르지 않습니다: %#v", result)
	}
	list, _ := store.ListStudents()
	if len(list) != 1 || list[0].Name != "가상학생" {
		t.Fatalf("되살린 명렬이 올바르지 않습니다: %#v", list)
	}
	if has, _ := store.HasPin(); has {
		t.Fatal("되살린 뒤에는 PIN을 다시 등록해야 합니다")
	}
	// 되살리기 전 보관함은 순환 백업으로 남는다.
	if _, err := os.Stat(store.filePath + ".bak.1"); err != nil {
		t.Fatalf("되살리기 전 보관함 백업이 없습니다: %v", err)
	}
	store.Lock()
	if _, err := store.Unlock(testMaster); err != nil {
		t.Fatalf("되살린 보관함을 다시 열지 못했습니다: %v", err)
	}
}

func TestRestoreBackupRejectsWrongPasswordAndLockedVault(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	backupPath := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RestoreBackup(backupPath, "틀린비밀번호입니다12"); err == nil || !strings.Contains(err.Error(), "비밀번호") {
		t.Fatalf("틀린 비밀번호는 거부해야 합니다: %v", err)
	}
	store.Lock()
	if _, err := store.RestoreBackup(backupPath, testMaster); err == nil {
		t.Fatal("보관함이 있는데 잠겨 있으면 되살리기를 거부해야 합니다")
	}
	if err := store.ExportBackup(backupPath); err == nil {
		t.Fatal("잠긴 보관함은 백업할 수 없어야 합니다")
	}
	notBackup := filepath.Join(dir, "다른파일.kkomi-backup")
	_ = os.WriteFile(notBackup, []byte(`{"hello":"world"}`), 0o600)
	fresh := &VaultStore{filePath: filepath.Join(dir, "new", "data", "vault.dat")}
	if _, err := fresh.RestoreBackup(notBackup, testMaster); err == nil || !strings.Contains(err.Error(), "형식") {
		t.Fatalf("꼬미노트 백업이 아닌 파일은 거부해야 합니다: %v", err)
	}
}

// 새 PC(보관함 없음)에서 백업으로 되살리면 바로 열린 상태가 되고, 다른 보관함이므로 복구 파일 안내가 나온다.
func TestRestoreBackupIntoNewComputer(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	backupPath := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backupPath); err != nil {
		t.Fatal(err)
	}
	newDir := filepath.Join(dir, "새PC")
	_ = os.MkdirAll(filepath.Join(newDir, "data"), 0o700)
	fresh := &VaultStore{filePath: filepath.Join(newDir, "data", "vault.dat")}
	result, err := fresh.RestoreBackup(backupPath, testMaster)
	if err != nil {
		t.Fatalf("새 PC 되살리기 실패: %v", err)
	}
	if !result.RecoveryMismatch || result.Config.Grade != "2" {
		t.Fatalf("새 PC 결과가 올바르지 않습니다: %#v", result)
	}
	// 원래 복구 파일은 같은 보관함 키라서 새 PC에서도 비밀번호 재설정에 쓸 수 있다.
	if err := fresh.ResetMasterPassword(filepath.Join(dir, "복구.teacher-recovery"), testRecovery, "새로정한마스터암호99"); err != nil {
		t.Fatalf("원래 복구 파일로 재설정 실패: %v", err)
	}
}

func TestChangeMasterPasswordKeepsPinAndRecovery(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	if err := store.SetPin("5678"); err != nil {
		t.Fatal(err)
	}
	if err := store.ChangeMasterPassword("틀린지금비밀번호123", "새마스터비밀번호1234"); err == nil {
		t.Fatal("지금 비밀번호가 틀리면 거부해야 합니다")
	}
	if err := store.ChangeMasterPassword(testMaster, "짧음"); err == nil {
		t.Fatal("짧은 새 비밀번호는 거부해야 합니다")
	}
	if err := store.ChangeMasterPassword(testMaster, testMaster); err == nil {
		t.Fatal("같은 비밀번호로는 바꿀 수 없어야 합니다")
	}
	if err := store.ChangeMasterPassword(testMaster, "새마스터비밀번호1234"); err != nil {
		t.Fatalf("비밀번호 변경 실패: %v", err)
	}
	store.Lock()
	if _, err := store.Unlock(testMaster); err == nil {
		t.Fatal("예전 비밀번호로는 열리면 안 됩니다")
	}
	if _, err := store.Unlock("새마스터비밀번호1234"); err != nil {
		t.Fatalf("새 비밀번호로 열지 못했습니다: %v", err)
	}
	store.Lock()
	if _, err := store.UnlockWithPin("5678"); err != nil {
		t.Fatalf("비밀번호를 바꾼 뒤에도 PIN으로 열려야 합니다: %v", err)
	}
	// 순환 백업도 새 비밀번호로만 열린다.
	if _, _, _, err := readBackupWithPassword(store.filePath+".bak.1", testMaster); err == nil {
		t.Fatal("순환 백업이 예전 비밀번호로 열리면 안 됩니다")
	}
}

func TestCreateRecoveryFileCanResetPassword(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	path := filepath.Join(dir, "새복구.teacher-recovery")
	if err := store.CreateRecoveryFile(path, "새복구용암호입니다12"); err != nil {
		t.Fatalf("복구 파일 만들기 실패: %v", err)
	}
	store.Lock()
	if err := store.ResetMasterPassword(path, "새복구용암호입니다12", "재설정한마스터암호12"); err != nil {
		t.Fatalf("새 복구 파일로 재설정 실패: %v", err)
	}
	if _, err := store.Unlock("재설정한마스터암호12"); err != nil {
		t.Fatalf("재설정한 비밀번호로 열지 못했습니다: %v", err)
	}
}
