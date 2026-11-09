package vault

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// 보관함 파일 읽기·안전하게 쓰기·이전 보관 파일 돌려 쓰기입니다.

func (s *VaultStore) writeCurrentVaultLocked() error {
	return s.writeVaultDataLocked(s.session)
}

// writeVaultDataLocked는 디스크 저장이 성공한 뒤에만 호출자가 메모리 상태를
// 교체할 수 있도록 후보 데이터를 명시적으로 받습니다.
func (s *VaultStore) writeVaultDataLocked(dataToSave *vaultData) error {
	if dataToSave == nil || len(s.sessionKey) == 0 {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	payload, err := json.Marshal(dataToSave)
	if err != nil {
		return fmt.Errorf("설정을 저장하지 못했습니다: %w", err)
	}
	data, err := seal(s.sessionKey, payload, "vault-data-v1")
	zeroBytes(payload)
	if err != nil {
		return err
	}
	file.Data = data
	if err := writeVaultJSONSecure(s.filePath, file); err != nil {
		return fmt.Errorf("설정을 저장하지 못했습니다: %w", err)
	}
	return nil
}

// migrateLegacyVaultLocked는 이전 Windows 설정 폴더 또는 맥 번들 내부의 암호화 보관함을 최신 data 폴더로 안전하게 옮깁니다.
func (s *VaultStore) migrateLegacyVaultLocked() error {
	if _, err := os.Stat(s.filePath); err == nil {
		return nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("data 폴더의 보관함 상태를 확인하지 못했습니다: %w", err)
	}

	candidates := append([]string{}, s.legacyFilePaths...)
	if s.legacyFilePath != "" {
		candidates = append(candidates, s.legacyFilePath)
	}

	for _, legacyPath := range candidates {
		if legacyPath == "" || filepath.Clean(legacyPath) == filepath.Clean(s.filePath) {
			continue
		}
		legacyData, err := os.ReadFile(legacyPath)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("기존 암호화 보관함을 읽지 못했습니다: %w", err)
		}
		defer zeroBytes(legacyData)
		if err := os.MkdirAll(filepath.Dir(s.filePath), 0700); err != nil {
			return fmt.Errorf("data 폴더를 만들지 못했습니다: %w", err)
		}
		temporaryPath := s.filePath + ".moving"
		if err := os.WriteFile(temporaryPath, legacyData, 0600); err != nil {
			return fmt.Errorf("data 폴더로 보관함을 옮기지 못했습니다: %w", err)
		}
		if err := os.Rename(temporaryPath, s.filePath); err != nil {
			return fmt.Errorf("data 폴더의 보관함을 준비하지 못했습니다: %w", err)
		}
		_ = os.Remove(legacyPath)
		break
	}
	return nil
}

func (s *VaultStore) readVaultFile() (vaultFile, error) {
	var file vaultFile
	if err := readJSON(s.filePath, &file); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return vaultFile{}, errors.New("먼저 최초 설정을 진행해 주세요")
		}
		return vaultFile{}, fmt.Errorf("암호화 보관함을 읽지 못했습니다: %w", err)
	}
	if file.Version != vaultVersion {
		return vaultFile{}, errors.New("지원하지 않는 암호화 보관함 버전입니다")
	}
	return file, nil
}

func readRecoveryFile(path string) (recoveryFile, error) {
	var file recoveryFile
	if err := readJSON(path, &file); err != nil {
		return recoveryFile{}, fmt.Errorf("복구 파일을 읽지 못했습니다: %w", err)
	}
	if file.Version != vaultVersion {
		return recoveryFile{}, errors.New("지원하지 않는 복구 파일 버전입니다")
	}
	return file, nil
}

func writeJSONSecure(path string, value any) error {
	return writeJSONSecureWithBackup(path, value, false)
}

func writeVaultJSONSecure(path string, value any) error {
	return writeJSONSecureWithBackup(path, value, true)
}

func writeJSONSecureWithBackup(path string, value any, keepBackups bool) error {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	defer zeroBytes(payload)
	temporaryPath := path + ".new"
	if err := writeFileAndSync(temporaryPath, payload); err != nil {
		return err
	}
	if keepBackups {
		if err := rotateVaultBackups(path, 3); err != nil {
			_ = os.Remove(temporaryPath)
			return err
		}
	}
	return os.Rename(temporaryPath, path)
}

var (
	zeroBytes        = system.ZeroBytes
	writeFileAndSync = system.WriteFileAndSync
)

// rotateVaultBackups는 직전의 암호화 보관함을 vault.dat.bak.1부터 3개까지
// 순환 보관합니다. 백업 역시 암호문이므로 평문 학생 정보가 생성되지 않습니다.
func rotateVaultBackups(path string, count int) error {
	if count < 1 {
		return nil
	}
	if _, err := os.Stat(path); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return err
	}
	for index := count; index >= 2; index-- {
		from := fmt.Sprintf("%s.bak.%d", path, index-1)
		to := fmt.Sprintf("%s.bak.%d", path, index)
		if _, err := os.Stat(from); errors.Is(err, os.ErrNotExist) {
			continue
		} else if err != nil {
			return err
		}
		if err := os.Remove(to); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		if err := os.Rename(from, to); err != nil {
			return err
		}
	}
	current, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	defer zeroBytes(current)
	return writeFileAndSync(path+".bak.1", current)
}

// rewrapVaultBackups는 비밀번호·PIN을 바꾼 뒤 순환 백업의 잠금 정보도 현재 값으로 바꿉니다.
// 백업 자료는 같은 보관함 키로 암호화되어 있으므로, 예전 비밀번호·PIN 래핑이 남아 있으면
// 유출된 예전 자격 증명으로 백업을 열 수 있습니다. 자료(Data)는 그대로 두고 잠금 정보만 교체합니다.
func rewrapVaultBackups(path string, current vaultFile, count int) error {
	for index := 1; index <= count; index++ {
		backupPath := fmt.Sprintf("%s.bak.%d", path, index)
		var backup vaultFile
		if err := readJSON(backupPath, &backup); err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return err
		}
		backup.PasswordSalt = current.PasswordSalt
		backup.PasswordWrappedKey = current.PasswordWrappedKey
		backup.PinSalt = current.PinSalt
		backup.PinWrappedKey = current.PinWrappedKey
		backup.PinProtected = current.PinProtected
		if err := writeJSONSecure(backupPath, backup); err != nil {
			return err
		}
	}
	return nil
}

// writeCredentialChangeLocked는 잠금 정보가 바뀐 보관함을 저장하고 백업의 잠금 정보도 함께 갱신합니다.
func (s *VaultStore) writeCredentialChangeLocked(file vaultFile) error {
	if err := writeVaultJSONSecure(s.filePath, file); err != nil {
		return err
	}
	if err := rewrapVaultBackups(s.filePath, file, 3); err != nil {
		return fmt.Errorf("새 설정은 저장했지만 이전 백업의 잠금 정보를 바꾸지 못했습니다: %w", err)
	}
	return nil
}

func readJSON(path string, target any) error {
	payload, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	defer zeroBytes(payload)
	return json.Unmarshal(payload, target)
}
