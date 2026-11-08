package vault

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"strings"
)

// 암호화 백업 내보내기·되살리기, 마스터 비밀번호 변경, 복구 파일 다시 만들기를 모은다.
// 백업 파일은 보관함 파일과 같은 형식(마스터 비밀번호로만 열림)이며, 이 PC에 묶인 PIN 정보는 넣지 않는다.

// backupFileOf는 현재 보관함 파일에서 PIN 잠금 정보를 뺀 백업용 사본을 만든다.
func backupFileOf(file vaultFile) vaultFile {
	file.PinSalt = ""
	file.PinWrappedKey = encryptedBlob{}
	file.PinProtected = ""
	return file
}

// ExportBackup은 현재 보관함을 암호화된 상태 그대로 path에 저장한다.
// 보관함이 열려 있을 때만 허용해, 잠긴 PC에서 다른 사람이 자료를 빼 가는 동작을 막는다.
func (s *VaultStore) ExportBackup(path string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(path) == "" {
		return errors.New("백업 파일 위치를 선택해 주세요")
	}
	// 메모리의 최신 자료를 먼저 디스크에 맞춘 뒤 그 파일을 복사한다.
	if err := s.writeCurrentVaultLocked(); err != nil {
		return err
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	if err := writeJSONSecure(path, backupFileOf(file)); err != nil {
		return fmt.Errorf("백업 파일을 저장하지 못했습니다: %w", err)
	}
	return nil
}

// readBackupWithPassword는 백업 파일을 백업 당시 마스터 비밀번호로 열어 키와 자료를 돌려준다.
func readBackupWithPassword(path, password string) (vaultFile, []byte, vaultData, error) {
	var file vaultFile
	if err := readJSON(path, &file); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return vaultFile{}, nil, vaultData{}, errors.New("백업 파일을 찾지 못했습니다")
		}
		return vaultFile{}, nil, vaultData{}, errors.New("꼬미노트 백업 파일 형식이 아닙니다")
	}
	if file.PasswordSalt == "" || file.PasswordWrappedKey.Ciphertext == "" || file.Data.Ciphertext == "" {
		return vaultFile{}, nil, vaultData{}, errors.New("꼬미노트 백업 파일 형식이 아닙니다")
	}
	salt, err := decode(file.PasswordSalt)
	if err != nil {
		return vaultFile{}, nil, vaultData{}, errors.New("꼬미노트 백업 파일 형식이 아닙니다")
	}
	passwordKey := deriveKey(strings.TrimSpace(password), salt)
	vaultKey, err := open(passwordKey, file.PasswordWrappedKey, "master-key-v1")
	zeroBytes(passwordKey)
	if err != nil {
		return vaultFile{}, nil, vaultData{}, errors.New("백업할 때의 마스터 비밀번호가 올바르지 않습니다")
	}
	data, err := decryptVaultData(vaultKey, file.Data)
	if err != nil {
		zeroBytes(vaultKey)
		return vaultFile{}, nil, vaultData{}, errors.New("백업 파일이 손상되어 열 수 없습니다")
	}
	return file, vaultKey, data, nil
}

// RestoreResult는 되살리기 뒤 교사에게 안내할 내용을 담는다.
type RestoreResult struct {
	Config ClassConfig `json:"config"`
	// RecoveryMismatch가 참이면 지금 가진 복구 파일로는 되살린 보관함을 열 수 없으므로 새로 만들어야 한다.
	RecoveryMismatch bool `json:"recoveryMismatch"`
	StudentCount     int  `json:"studentCount"`
}

// RestoreBackup은 백업 파일로 보관함을 되살린다.
// 보관함이 열려 있거나(교사 확인 뒤 교체) 아직 보관함이 없는 새 PC에서만 허용한다.
// 기존 보관함은 순환 백업(.bak.1)으로 남겨 실수로 되살려도 되돌릴 수 있다. PIN은 다시 등록해야 한다.
func (s *VaultStore) RestoreBackup(path, password string) (RestoreResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return RestoreResult{}, err
	}
	_, statErr := os.Stat(s.filePath)
	vaultExists := statErr == nil
	if vaultExists && (s.session == nil || len(s.sessionKey) == 0) {
		return RestoreResult{}, errors.New("먼저 지금 보관함을 연 뒤 되살릴 수 있습니다")
	}
	file, vaultKey, data, err := readBackupWithPassword(path, password)
	if err != nil {
		return RestoreResult{}, err
	}
	sameKey := vaultExists && bytes.Equal(vaultKey, s.sessionKey)
	if err := writeVaultJSONSecure(s.filePath, backupFileOf(file)); err != nil {
		zeroBytes(vaultKey)
		return RestoreResult{}, fmt.Errorf("보관함을 되살리지 못했습니다: %w", err)
	}
	s.clearSessionLocked()
	s.resetPinAttemptsLocked()
	s.sessionKey = vaultKey
	s.session = &data
	return RestoreResult{Config: data.Config, RecoveryMismatch: !sameKey, StudentCount: len(data.Students)}, nil
}

// ChangeMasterPassword는 열린 보관함의 마스터 비밀번호만 바꾼다.
// 보관함 키는 그대로이므로 PIN과 복구 파일은 계속 쓸 수 있다.
func (s *VaultStore) ChangeMasterPassword(currentPassword, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	currentPassword = strings.TrimSpace(currentPassword)
	newPassword = strings.TrimSpace(newPassword)
	if len([]rune(newPassword)) < minimumPasswordLen {
		return fmt.Errorf("새 비밀번호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if currentPassword == newPassword {
		return errors.New("새 비밀번호가 지금 비밀번호와 같습니다")
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	salt, err := decode(file.PasswordSalt)
	if err != nil {
		return errors.New("암호화 보관함 형식이 올바르지 않습니다")
	}
	currentKey := deriveKey(currentPassword, salt)
	unwrapped, err := open(currentKey, file.PasswordWrappedKey, "master-key-v1")
	zeroBytes(currentKey)
	if err != nil || !bytes.Equal(unwrapped, s.sessionKey) {
		zeroBytes(unwrapped)
		return errors.New("지금 비밀번호가 올바르지 않습니다")
	}
	zeroBytes(unwrapped)
	newSalt, err := randomBytes(16)
	if err != nil {
		return err
	}
	newKey := deriveKey(newPassword, newSalt)
	wrapped, err := seal(newKey, s.sessionKey, "master-key-v1")
	zeroBytes(newKey)
	if err != nil {
		return err
	}
	file.PasswordSalt = encode(newSalt)
	file.PasswordWrappedKey = wrapped
	if err := s.writeCredentialChangeLocked(file); err != nil {
		return fmt.Errorf("새 비밀번호를 저장하지 못했습니다: %w", err)
	}
	return nil
}

// CreateRecoveryFile은 열린 보관함의 키로 새 복구 파일을 만든다(백업을 되살린 뒤 등).
func (s *VaultStore) CreateRecoveryFile(path, recoveryPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	recoveryPassword = strings.TrimSpace(recoveryPassword)
	if len([]rune(recoveryPassword)) < minimumPasswordLen {
		return fmt.Errorf("복구용 암호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if strings.TrimSpace(path) == "" {
		return errors.New("복구 파일 위치를 선택해 주세요")
	}
	salt, err := randomBytes(16)
	if err != nil {
		return err
	}
	key := deriveKey(recoveryPassword, salt)
	wrapped, err := seal(key, s.sessionKey, "recovery-key-v1")
	zeroBytes(key)
	if err != nil {
		return err
	}
	if err := writeJSONSecure(path, recoveryFile{Version: vaultVersion, RecoverySalt: encode(salt), RecoveryWrappedKey: wrapped}); err != nil {
		return fmt.Errorf("복구 파일을 저장하지 못했습니다: %w", err)
	}
	return nil
}
