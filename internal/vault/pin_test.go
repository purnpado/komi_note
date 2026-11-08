package vault

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	pinTestMaster   = "마스터비밀번호1234"
	pinTestRecovery = "복구비밀번호1234"
	pinTestPin      = "1234"
)

func newPinTestStore(t *testing.T) *VaultStore {
	t.Helper()
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "vault.dat")}
	request := SetupRequest{
		Config:           ClassConfig{SchoolYear: "2026", Grade: "1", ClassNumber: "2", AutoLockMinutes: 5},
		MasterPassword:   pinTestMaster,
		RecoveryPassword: pinTestRecovery,
		RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery"),
	}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	if err := store.SetPin(pinTestPin); err != nil {
		t.Fatal(err)
	}
	return store
}

func readPinTestFile(t *testing.T, store *VaultStore) vaultFile {
	t.Helper()
	file, err := store.readVaultFile()
	if err != nil {
		t.Fatal(err)
	}
	return file
}

// 다른 PC·다른 Windows 계정에서 DPAPI가 풀리지 않는 상황을 흉내 냅니다.
func simulateOtherPC(t *testing.T) {
	t.Helper()
	original := unprotectLocal
	unprotectLocal = func(data, entropy []byte) ([]byte, error) { return nil, errors.New("다른 PC") }
	t.Cleanup(func() { unprotectLocal = original })
}

func Test새PIN은이PC에묶인형식으로만저장한다(t *testing.T) {
	store := newPinTestStore(t)
	file := readPinTestFile(t, store)
	if file.PinProtected == "" {
		t.Fatal("PIN이 이 PC에 묶인 형식으로 저장되지 않음")
	}
	if file.PinSalt != "" || file.PinWrappedKey.Ciphertext != "" {
		t.Fatal("감싸지 않은 PIN 정보가 보관함에 남음")
	}
	for index := 1; index <= 3; index++ {
		var backup vaultFile
		err := readJSON(store.filePath+".bak."+string(rune('0'+index)), &backup)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if backup.PinSalt != "" || strings.TrimSpace(backup.PinWrappedKey.Ciphertext) != "" {
			t.Fatalf("백업 %d에 감싸지 않은 PIN 정보가 남음", index)
		}
	}
	store.Lock()
	if _, err := store.UnlockWithPin(pinTestPin); err != nil {
		t.Fatalf("새 형식 PIN으로 열지 못함: %v", err)
	}
}

func Test기존형식PIN은로그인성공시자동전환한다(t *testing.T) {
	store := newPinTestStore(t)
	// 이전 버전처럼 PIN 정보를 감싸지 않은 형식으로 되돌립니다.
	file := readPinTestFile(t, store)
	material, legacy, err := loadPinMaterial(file)
	if err != nil || legacy {
		t.Fatalf("PIN 자료를 읽지 못함: %v", err)
	}
	file.PinProtected = ""
	file.PinSalt = material.Salt
	file.PinWrappedKey = material.WrappedKey
	if err := writeVaultJSONSecure(store.filePath, file); err != nil {
		t.Fatal(err)
	}

	store.Lock()
	state, _ := store.State()
	if !state.HasPin {
		t.Fatal("기존 형식 PIN이 등록된 것으로 보이지 않음")
	}
	if _, err := store.UnlockWithPin(pinTestPin); err != nil {
		t.Fatalf("기존 형식 PIN으로 열지 못함: %v", err)
	}
	converted := readPinTestFile(t, store)
	if converted.PinProtected == "" || converted.PinSalt != "" || converted.PinWrappedKey.Ciphertext != "" {
		t.Fatal("기존 형식 PIN이 이 PC에 묶인 형식으로 전환되지 않음")
	}
	store.Lock()
	if _, err := store.UnlockWithPin(pinTestPin); err != nil {
		t.Fatalf("전환 뒤 PIN으로 열지 못함: %v", err)
	}
}

func Test다른PC에서는PIN대신마스터비밀번호를안내한다(t *testing.T) {
	store := newPinTestStore(t)
	store.Lock()
	simulateOtherPC(t)

	state, err := store.State()
	if err != nil {
		t.Fatal(err)
	}
	if state.HasPin || state.PinNotice == "" {
		t.Fatalf("다른 PC에서 PIN 사용 불가 안내가 없음: %#v", state)
	}
	if hasPin, _ := store.HasPin(); hasPin {
		t.Fatal("다른 PC에서 PIN이 사용 가능한 것으로 보임")
	}
	if _, err := store.UnlockWithPin(pinTestPin); !errors.Is(err, errPinNotThisPC) {
		t.Fatalf("다른 PC에서 PIN이 거부되지 않음: %v", err)
	}
	if state, _ := store.State(); state.PinAttempts != 0 {
		t.Fatalf("다른 PC 안내를 실패 횟수로 세면 안 됨: %d", state.PinAttempts)
	}
	if _, err := store.Unlock(pinTestMaster); err != nil {
		t.Fatalf("다른 PC에서 마스터 비밀번호로 열지 못함: %v", err)
	}
	// 마스터 비밀번호로 연 뒤 이 PC에서 PIN을 다시 등록할 수 있어야 합니다.
	if err := store.SetPin("5678"); err != nil {
		t.Fatalf("PIN 재등록 실패: %v", err)
	}
}

func TestPIN실패횟수는프로그램을다시켜도유지된다(t *testing.T) {
	store := newPinTestStore(t)
	store.Lock()
	for attempt := 0; attempt < 3; attempt++ {
		if _, err := store.UnlockWithPin("9999"); err == nil {
			t.Fatal("틀린 PIN으로 열림")
		}
	}
	// 프로그램을 다시 켠 것처럼 새 인스턴스로 같은 보관함을 엽니다.
	restarted := &VaultStore{filePath: store.filePath}
	state, _ := restarted.State()
	if state.PinAttempts != 3 {
		t.Fatalf("재시작 뒤 실패 횟수가 유지되지 않음: %d", state.PinAttempts)
	}
	for attempt := 0; attempt < 2; attempt++ {
		_, _ = restarted.UnlockWithPin("9999")
	}
	again := &VaultStore{filePath: store.filePath}
	if state, _ := again.State(); !state.PinLocked {
		t.Fatal("재시작 뒤에도 5회 실패 잠금이 유지되어야 함")
	}
	if _, err := again.UnlockWithPin(pinTestPin); err == nil {
		t.Fatal("잠긴 상태에서 올바른 PIN으로 열림")
	}
	if _, err := again.Unlock(pinTestMaster); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(again.pinAttemptsPath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatal("마스터 비밀번호 로그인 뒤 실패 횟수 파일이 지워지지 않음")
	}
	fresh := &VaultStore{filePath: store.filePath}
	if state, _ := fresh.State(); state.PinLocked || state.PinAttempts != 0 {
		t.Fatalf("마스터 비밀번호 로그인 뒤 실패 횟수가 초기화되지 않음: %#v", state)
	}
}
