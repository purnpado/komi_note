package vault

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"TeacherNote/internal/system"
)

const (
	maxPinAttempts = 5
	// pinProtectionEntropy는 DPAPI에 함께 넘기는 꼬미노트 전용 구분 값입니다.
	pinProtectionEntropy = "kkomi-note-pin-v1"
	pinAttemptsFileName  = "pin_attempts"
)

// 테스트에서 "다른 PC" 상황을 흉내 낼 수 있도록 변수로 둡니다.
var (
	protectLocal   = system.ProtectLocal
	unprotectLocal = system.UnprotectLocal
)

var (
	errPinNotThisPC = errors.New("이 컴퓨터에서 등록한 간편 PIN이 아닙니다. 마스터 비밀번호로 연 뒤 환경 설정에서 PIN을 다시 등록해 주세요.")
	errNoPin        = errors.New("등록된 간편 PIN 번호가 없습니다. 마스터 비밀번호로 로그인해 주세요.")
)

// pinMaterial은 PIN으로 보관함 키를 푸는 데 필요한 솔트와 래핑 키입니다.
// 디스크에는 이 값을 그대로 두지 않고 DPAPI로 감싼 PinProtected로만 저장합니다.
type pinMaterial struct {
	Salt       string        `json:"salt"`
	WrappedKey encryptedBlob `json:"wrappedKey"`
}

// validatePin은 4~8자리 숫자 핀번호 규격을 검사합니다.
func validatePin(pin string) error {
	pin = strings.TrimSpace(pin)
	if len(pin) < 4 || len(pin) > 8 {
		return errors.New("간편 PIN 번호는 4~8자리 숫자로 입력해 주세요")
	}
	for _, ch := range pin {
		if ch < '0' || ch > '9' {
			return errors.New("간편 PIN 번호는 숫자만 입력할 수 있습니다")
		}
	}
	return nil
}

func pinRegistered(file vaultFile) bool {
	return strings.TrimSpace(file.PinProtected) != "" || strings.TrimSpace(file.PinWrappedKey.Ciphertext) != ""
}

// pinUsable은 PIN이 이 PC에서 실제로 쓸 수 있는지와, 쓸 수 없을 때의 안내 문구를 돌려줍니다.
func pinUsable(file vaultFile) (bool, string) {
	if !pinRegistered(file) {
		return false, ""
	}
	if _, _, err := loadPinMaterial(file); err != nil {
		if errors.Is(err, errPinNotThisPC) {
			return false, err.Error()
		}
		return false, ""
	}
	return true, ""
}

// loadPinMaterial은 보관함 파일에서 PIN 자료를 꺼냅니다. legacy가 true면 이전(감싸지 않은) 형식입니다.
func loadPinMaterial(file vaultFile) (pinMaterial, bool, error) {
	if protectedText := strings.TrimSpace(file.PinProtected); protectedText != "" {
		protected, err := decode(protectedText)
		if err != nil {
			return pinMaterial{}, false, errors.New("암호화 보관함 형식이 올바르지 않습니다")
		}
		raw, err := unprotectLocal(protected, []byte(pinProtectionEntropy))
		if err != nil {
			return pinMaterial{}, false, errPinNotThisPC
		}
		defer zeroBytes(raw)
		var material pinMaterial
		if err := json.Unmarshal(raw, &material); err != nil {
			return pinMaterial{}, false, errors.New("간편 PIN 정보 형식이 올바르지 않습니다")
		}
		return material, false, nil
	}
	if strings.TrimSpace(file.PinWrappedKey.Ciphertext) != "" && strings.TrimSpace(file.PinSalt) != "" {
		return pinMaterial{Salt: file.PinSalt, WrappedKey: file.PinWrappedKey}, true, nil
	}
	return pinMaterial{}, false, errNoPin
}

// storeProtectedPin은 PIN 자료를 DPAPI로 감싸 보관함 파일에 넣고 이전 형식 값은 지웁니다.
func storeProtectedPin(file *vaultFile, material pinMaterial) error {
	raw, err := json.Marshal(material)
	if err != nil {
		return err
	}
	defer zeroBytes(raw)
	protected, err := protectLocal(raw, []byte(pinProtectionEntropy))
	if err != nil {
		return fmt.Errorf("간편 PIN을 이 컴퓨터에 묶지 못했습니다: %w", err)
	}
	file.PinProtected = encode(protected)
	file.PinSalt = ""
	file.PinWrappedKey = encryptedBlob{}
	return nil
}

// UnlockWithPin은 간편 숫자 PIN 번호로 보관함을 엽니다.
func (s *VaultStore) UnlockWithPin(pin string) (SessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	pin = strings.TrimSpace(pin)

	attempts := s.currentPinAttemptsLocked()
	if attempts >= maxPinAttempts {
		return SessionResult{}, errors.New("PIN 번호 입력 실패 횟수(5회)를 초과하여 간편 로그인이 잠겼습니다. 마스터 비밀번호로 로그인해 주세요.")
	}
	if err := validatePin(pin); err != nil {
		return SessionResult{}, err
	}
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return SessionResult{}, err
	}
	file, err := s.readVaultFile()
	if err != nil {
		return SessionResult{}, err
	}
	material, legacy, err := loadPinMaterial(file)
	if err != nil {
		return SessionResult{}, err
	}
	salt, err := decode(material.Salt)
	if err != nil {
		return SessionResult{}, errors.New("암호화 보관함 형식이 올바르지 않습니다")
	}

	pinKey := deriveKey(pin, salt)
	vaultKey, err := open(pinKey, material.WrappedKey, "pin-key-v1")
	zeroBytes(pinKey)
	if err != nil {
		attempts++
		s.setPinAttemptsLocked(attempts)
		remaining := maxPinAttempts - attempts
		if remaining <= 0 {
			return SessionResult{}, errors.New("PIN 번호가 올바르지 않습니다. 5회 연속 실패하여 간편 로그인이 잠겼습니다. 마스터 비밀번호로 로그인해 주세요.")
		}
		return SessionResult{}, fmt.Errorf("PIN 번호가 올바르지 않습니다. (남은 입력 횟수: %d회)", remaining)
	}

	data, err := decryptVaultData(vaultKey, file.Data)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, errors.New("암호화 보관함을 열 수 없습니다")
	}

	// 이전 형식 PIN은 로그인에 성공한 지금 이 PC에 묶는 형식으로 바꿉니다.
	// 전환에 실패해도 로그인은 그대로 진행하고 다음 로그인 때 다시 시도합니다.
	if legacy {
		if err := storeProtectedPin(&file, material); err == nil {
			_ = s.writeCredentialChangeLocked(file)
		}
	}

	s.clearSessionLocked()
	s.resetPinAttemptsLocked()
	s.sessionKey = vaultKey
	s.session = &data
	return SessionResult{Config: data.Config}, nil
}

// SetPin은 보관함이 열려 있는 상태에서 간편 숫자 PIN 번호를 설정 또는 변경합니다.
func (s *VaultStore) SetPin(pin string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	pin = strings.TrimSpace(pin)
	if err := validatePin(pin); err != nil {
		return err
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	pinSalt, err := randomBytes(16)
	if err != nil {
		return fmt.Errorf("간편 PIN 암호화 솔트를 생성하지 못했습니다: %w", err)
	}
	pinKey := deriveKey(pin, pinSalt)
	wrappedVaultKey, err := seal(pinKey, s.sessionKey, "pin-key-v1")
	zeroBytes(pinKey)
	if err != nil {
		return fmt.Errorf("간편 PIN 암호화 키를 생성하지 못했습니다: %w", err)
	}
	if err := storeProtectedPin(&file, pinMaterial{Salt: encode(pinSalt), WrappedKey: wrappedVaultKey}); err != nil {
		return err
	}
	if err := s.writeCredentialChangeLocked(file); err != nil {
		return fmt.Errorf("간편 PIN 설정을 저장하지 못했습니다: %w", err)
	}
	s.resetPinAttemptsLocked()
	return nil
}

// RemovePin은 등록된 간편 PIN 번호를 삭제합니다.
func (s *VaultStore) RemovePin() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	file.PinSalt = ""
	file.PinWrappedKey = encryptedBlob{}
	file.PinProtected = ""
	if err := s.writeCredentialChangeLocked(file); err != nil {
		return fmt.Errorf("간편 PIN 해제 설정을 저장하지 못했습니다: %w", err)
	}
	s.resetPinAttemptsLocked()
	return nil
}

// HasPin은 이 PC에서 쓸 수 있는 간편 PIN 번호가 등록되어 있는지 확인합니다.
// 다른 PC에서 등록한 PIN은 쓸 수 없으므로 미등록으로 보고, 교사가 다시 등록하게 합니다.
func (s *VaultStore) HasPin() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	file, err := s.readVaultFile()
	if err != nil {
		return false, err
	}
	usable, _ := pinUsable(file)
	return usable, nil
}

// PIN 실패 횟수는 data 폴더의 별도 파일에도 저장해 프로그램을 다시 켜도 5회 제한이 유지되게 합니다.
// 보관함 파일에 쓰지 않으므로 실패할 때마다 암호문 백업이 밀려나지 않습니다.
func (s *VaultStore) pinAttemptsPath() string {
	return filepath.Join(filepath.Dir(s.filePath), pinAttemptsFileName)
}

func (s *VaultStore) currentPinAttemptsLocked() int {
	attempts := s.pinAttempts
	if payload, err := os.ReadFile(s.pinAttemptsPath()); err == nil {
		if saved, err := strconv.Atoi(strings.TrimSpace(string(payload))); err == nil && saved > attempts {
			attempts = saved
		}
	}
	s.pinAttempts = attempts
	return attempts
}

func (s *VaultStore) setPinAttemptsLocked(attempts int) {
	s.pinAttempts = attempts
	_ = writeFileAndSync(s.pinAttemptsPath(), []byte(strconv.Itoa(attempts)))
}

func (s *VaultStore) resetPinAttemptsLocked() {
	s.pinAttempts = 0
	if err := os.Remove(s.pinAttemptsPath()); err != nil && !errors.Is(err, os.ErrNotExist) {
		_ = writeFileAndSync(s.pinAttemptsPath(), []byte("0"))
	}
}
