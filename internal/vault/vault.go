package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/argon2"

	"TeacherNote/internal/system"
)

const (
	vaultVersion       = 1
	minimumPasswordLen = 10
)

// ClassConfig은 암호화 보관함 안에 저장하는 학급 기본 설정입니다.
type ClassConfig struct {
	SchoolName                  string   `json:"schoolName"`
	SchoolYear                  string   `json:"schoolYear"`
	TeacherRole                 string   `json:"teacherRole"`
	Grade                       string   `json:"grade"`
	ClassNumber                 string   `json:"classNumber"`
	TeacherLabel                string   `json:"teacherLabel"`
	TeachingSubject             string   `json:"teachingSubject"`
	TeachingClasses             []string `json:"teachingClasses"`
	Theme                       string   `json:"theme"`
	AutoLockMinutes             int      `json:"autoLockMinutes"`
	ExperienceLearningUnit      string   `json:"experienceLearningUnit"`
	ExperienceLearningYearLimit int      `json:"experienceLearningYearLimit"`
	Semester1StartDate          string   `json:"semester1StartDate"`
	Semester1EndDate            string   `json:"semester1EndDate"`
	Semester1ExperienceLimit    int      `json:"semester1ExperienceLimit"`
	Semester2StartDate          string   `json:"semester2StartDate"`
	Semester2EndDate            string   `json:"semester2EndDate"`
	Semester2ExperienceLimit    int      `json:"semester2ExperienceLimit"`
	TermsVersion                string   `json:"termsVersion"`
	TermsAcceptedAt             string   `json:"termsAcceptedAt"`
}

// SetupRequest는 최초 설정에 필요한 값입니다.
type SetupRequest struct {
	Config           ClassConfig `json:"config"`
	MasterPassword   string      `json:"masterPassword"`
	RecoveryPassword string      `json:"recoveryPassword"`
	RecoveryFilePath string      `json:"recoveryFilePath"`
}

// AppState는 잠금 화면에서 사용 가능한 최소 상태입니다.
type AppState struct {
	NeedsSetup     bool `json:"needsSetup"`
	Locked         bool `json:"locked"`
	HasPin         bool `json:"hasPin"`
	PinLocked      bool `json:"pinLocked"`
	PinAttempts    int  `json:"pinAttempts"`
	MaxPinAttempts int  `json:"maxPinAttempts"`
	// PinNotice는 PIN이 등록되어 있지만 이 PC에서 쓸 수 없을 때 잠금 화면에 보여 줄 안내입니다.
	PinNotice string `json:"pinNotice,omitempty"`
}

// SessionResult는 잠금 해제 뒤에만 화면에 제공하는 설정입니다.
type SessionResult struct {
	Config ClassConfig `json:"config"`
}

type encryptedBlob struct {
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

type vaultFile struct {
	Version            int           `json:"version"`
	PasswordSalt       string        `json:"passwordSalt"`
	PasswordWrappedKey encryptedBlob `json:"passwordWrappedKey"`
	PinSalt            string        `json:"pinSalt,omitempty"`
	PinWrappedKey      encryptedBlob `json:"pinWrappedKey,omitempty"`
	// PinProtected는 PIN 솔트·래핑 키를 이 PC·Windows 계정에 묶어(DPAPI) 감싼 값입니다.
	// 이 값이 있으면 PinSalt·PinWrappedKey는 비워 두며, 이전 형식은 다음 PIN 로그인 때 자동 전환합니다.
	PinProtected string `json:"pinProtected,omitempty"`
	Data               encryptedBlob `json:"data"`
}

type recoveryFile struct {
	Version            int           `json:"version"`
	RecoverySalt       string        `json:"recoverySalt"`
	RecoveryWrappedKey encryptedBlob `json:"recoveryWrappedKey"`
}

type vaultData struct {
	Config              ClassConfig          `json:"config"`
	Students            []Student            `json:"students"`
	Consultations       []Consultation       `json:"consultations"`
	AcademicChanges     []AcademicChange     `json:"academicChanges"`
	AttendanceDays      []AttendanceDay      `json:"attendanceDays"`
	AttendanceTemplates []AttendanceTemplate `json:"attendanceTemplates"`
	Surveys             []Survey             `json:"surveys"`
	SubmissionDocuments []SubmissionDocument `json:"submissionDocuments"`
	SeatingPlans        []SeatingPlan        `json:"seatingPlans"`
	CleaningPlans       []CleaningPlan       `json:"cleaningPlans"`
	Assessments         []Assessment         `json:"assessments"`
	CourseRosters       []CourseRoster       `json:"courseRosters,omitempty"`
	Timetable           *TimetableBook       `json:"timetable,omitempty"`
	Grouping            *GroupingBook        `json:"grouping,omitempty"`
	CreatedAt           time.Time            `json:"createdAt"`
	UpdatedAt           time.Time            `json:"updatedAt"`
	RecoveryCreated     bool                 `json:"recoveryCreated"`
}

// VaultStore는 디스크 암호화 파일과 메모리 세션을 관리합니다.
type VaultStore struct {
	mu              sync.Mutex
	filePath        string
	backupKeyDir    string
	legacyFilePath  string
	legacyFilePaths []string
	sessionKey      []byte
	session         *vaultData
	pinAttempts     int
}

// NewVaultStore는 실행 환경에 맞는 안전한 data 보관함을 사용합니다.
// 윈도우에서는 실행 파일 옆, 맥 앱 번들에서는 맥 표준 사용자 데이터 경로 또는 .app 옆 포터블 경로를 사용합니다.
func NewVaultStore() *VaultStore {
	baseDir := system.ResolveBaseDirectory()
	var legacyPaths []string

	if legacyBaseDir, err := os.UserConfigDir(); err == nil && legacyBaseDir != "" {
		legacyPaths = append(legacyPaths, filepath.Join(legacyBaseDir, "GGUK", "TeacherNote", "vault.dat"))
	}

	// 맥 앱 번들 내부(Contents/MacOS/data) 등 실행 바이너리 옆에 혹시 잔존하는 이전 보관함도 후보로 등록
	if executablePath, err := os.Executable(); err == nil {
		legacyPaths = append(legacyPaths, filepath.Join(filepath.Dir(executablePath), "data", "vault.dat"))
	}

	dataDir := filepath.Join(baseDir, "data")
	backupKeyDir := filepath.Join(baseDir, "backup_key")
	// 프로그램을 처음 실행하면 개인정보 보관함과 복구키 폴더를 미리 준비합니다.
	// 실제 보관함 파일은 최초 설정을 마친 뒤에만 생성합니다.
	_ = os.MkdirAll(dataDir, 0700)
	_ = os.MkdirAll(backupKeyDir, 0700)
	return &VaultStore{
		filePath:        filepath.Join(dataDir, "vault.dat"),
		backupKeyDir:    backupKeyDir,
		legacyFilePaths: legacyPaths,
	}
}

// NewVaultStoreWithPaths는 테스트 또는 특정 경로가 지정된 보관함 인스턴스를 생성합니다.
func NewVaultStoreWithPaths(filePath, backupKeyDir string) *VaultStore {
	if dir := filepath.Dir(filePath); dir != "" {
		_ = os.MkdirAll(dir, 0700)
	}
	if backupKeyDir != "" {
		_ = os.MkdirAll(backupKeyDir, 0700)
	}
	return &VaultStore{
		filePath:     filePath,
		backupKeyDir: backupKeyDir,
	}
}

// State는 설정 필요 여부와 잠금 상태, 그리고 간편 PIN 설정 여부를 반환합니다.
func (s *VaultStore) State() (AppState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return AppState{}, err
	}
	_, err := os.Stat(s.filePath)
	if errors.Is(err, os.ErrNotExist) {
		return AppState{NeedsSetup: true, Locked: true}, nil
	}
	if err != nil {
		return AppState{}, fmt.Errorf("보관함 상태를 확인하지 못했습니다: %w", err)
	}
	hasPin, pinNotice := false, ""
	if file, err := s.readVaultFile(); err == nil {
		hasPin, pinNotice = pinUsable(file)
	}
	attempts := s.currentPinAttemptsLocked()
	return AppState{
		NeedsSetup:     false,
		Locked:         s.session == nil,
		HasPin:         hasPin,
		PinLocked:      attempts >= maxPinAttempts,
		PinAttempts:    attempts,
		MaxPinAttempts: maxPinAttempts,
		PinNotice:      pinNotice,
	}, nil
}

// Initialize는 보관함과 별도 복구 파일을 함께 생성합니다.
func (s *VaultStore) Initialize(request SetupRequest) (SessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	request.MasterPassword = strings.TrimSpace(request.MasterPassword)
	request.RecoveryPassword = strings.TrimSpace(request.RecoveryPassword)
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return SessionResult{}, err
	}

	if _, err := os.Stat(s.filePath); err == nil {
		return SessionResult{}, errors.New("이미 설정된 보관함이 있습니다")
	} else if !errors.Is(err, os.ErrNotExist) {
		return SessionResult{}, fmt.Errorf("보관함 상태를 확인하지 못했습니다: %w", err)
	}
	if strings.TrimSpace(request.RecoveryFilePath) == "" {
		request.RecoveryFilePath = s.defaultRecoveryFilePath()
	}
	if err := validateSetup(request); err != nil {
		return SessionResult{}, err
	}

	vaultKey, err := randomBytes(32)
	if err != nil {
		return SessionResult{}, err
	}
	passwordSalt, err := randomBytes(16)
	if err != nil {
		return SessionResult{}, err
	}
	passwordKey := deriveKey(request.MasterPassword, passwordSalt)
	wrappedVaultKey, err := seal(passwordKey, vaultKey, "master-key-v1")
	zeroBytes(passwordKey)
	if err != nil {
		return SessionResult{}, err
	}

	now := time.Now().UTC()
	data := vaultData{Config: normaliseConfig(request.Config), CreatedAt: now, UpdatedAt: now, RecoveryCreated: true}
	payload, err := json.Marshal(data)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, fmt.Errorf("초기 설정을 준비하지 못했습니다: %w", err)
	}
	encryptedData, err := seal(vaultKey, payload, "vault-data-v1")
	zeroBytes(payload)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, err
	}

	recoverySalt, err := randomBytes(16)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, err
	}
	recoveryPasswordKey := deriveKey(request.RecoveryPassword, recoverySalt)
	recoveryWrappedKey, err := seal(recoveryPasswordKey, vaultKey, "recovery-key-v1")
	zeroBytes(recoveryPasswordKey)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, err
	}

	if err := writeJSONSecure(request.RecoveryFilePath, recoveryFile{Version: vaultVersion, RecoverySalt: encode(recoverySalt), RecoveryWrappedKey: recoveryWrappedKey}); err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, fmt.Errorf("복구 파일을 저장하지 못했습니다: %w", err)
	}
	if err := writeVaultJSONSecure(s.filePath, vaultFile{Version: vaultVersion, PasswordSalt: encode(passwordSalt), PasswordWrappedKey: wrappedVaultKey, Data: encryptedData}); err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, fmt.Errorf("암호화 보관함을 저장하지 못했습니다: %w", err)
	}

	s.sessionKey = vaultKey
	s.session = &data
	return SessionResult{Config: data.Config}, nil
}

// DefaultRecoveryFilePath은 최초 설정에 제안하는 프로그램 폴더 안의 복구키 경로입니다.
func (s *VaultStore) DefaultRecoveryFilePath() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.defaultRecoveryFilePath()
}

func (s *VaultStore) defaultRecoveryFilePath() string {
	return filepath.Join(s.backupKeyDir, "꼬미노트-복구키.teacher-recovery")
}

// Unlock은 마스터 비밀번호로 키를 복원하고 설정을 복호화합니다.
func (s *VaultStore) Unlock(password string) (SessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	password = strings.TrimSpace(password)
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return SessionResult{}, err
	}
	if len([]rune(password)) < minimumPasswordLen {
		return SessionResult{}, fmt.Errorf("비밀번호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	file, err := s.readVaultFile()
	if err != nil {
		return SessionResult{}, err
	}
	salt, err := decode(file.PasswordSalt)
	if err != nil {
		return SessionResult{}, errors.New("암호화 보관함 형식이 올바르지 않습니다")
	}
	passwordKey := deriveKey(password, salt)
	vaultKey, err := open(passwordKey, file.PasswordWrappedKey, "master-key-v1")
	zeroBytes(passwordKey)
	if err != nil {
		return SessionResult{}, errors.New("비밀번호가 올바르지 않거나 보관함을 열 수 없습니다")
	}
	data, err := decryptVaultData(vaultKey, file.Data)
	if err != nil {
		zeroBytes(vaultKey)
		return SessionResult{}, errors.New("암호화 보관함을 열 수 없습니다")
	}
	s.clearSessionLocked()
	s.resetPinAttemptsLocked()
	s.sessionKey = vaultKey
	s.session = &data
	return SessionResult{Config: data.Config}, nil
}

// CurrentSession은 이미 열린 보관함의 설정을 돌려줍니다. 화면을 다시 불러왔을 때 자료를 다시 읽는 데 씁니다.
func (s *VaultStore) CurrentSession() (SessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return SessionResult{}, errors.New("먼저 보관함을 열어 주세요")
	}
	return SessionResult{Config: s.session.Config}, nil
}

// Lock은 메모리에만 있던 암호 키를 즉시 지웁니다.
func (s *VaultStore) Lock() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.clearSessionLocked()
}

// UpdateConfig는 잠금 해제 상태에서만 암호화 설정을 갱신합니다.
func (s *VaultStore) UpdateConfig(config ClassConfig) (SessionResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil || len(s.sessionKey) == 0 {
		return SessionResult{}, errors.New("먼저 보관함을 열어 주세요")
	}
	config = normaliseConfig(config)
	if err := validateConfig(config); err != nil {
		return SessionResult{}, err
	}
	s.session.Config = config
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return SessionResult{}, err
	}
	return SessionResult{Config: config}, nil
}

// ResetMasterPassword는 복구 파일로 기존 보관함의 마스터 비밀번호만 바꿉니다.
func (s *VaultStore) ResetMasterPassword(recoveryPath, recoveryPassword, newPassword string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	recoveryPassword = strings.TrimSpace(recoveryPassword)
	newPassword = strings.TrimSpace(newPassword)
	if err := s.migrateLegacyVaultLocked(); err != nil {
		return err
	}
	if len([]rune(recoveryPassword)) < minimumPasswordLen || len([]rune(newPassword)) < minimumPasswordLen {
		return fmt.Errorf("복구용 암호와 새 비밀번호는 각각 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	file, err := s.readVaultFile()
	if err != nil {
		return err
	}
	recovery, err := readRecoveryFile(recoveryPath)
	if err != nil {
		return err
	}
	recoverySalt, err := decode(recovery.RecoverySalt)
	if err != nil {
		return errors.New("복구 파일 형식이 올바르지 않습니다")
	}
	recoveryPasswordKey := deriveKey(recoveryPassword, recoverySalt)
	vaultKey, err := open(recoveryPasswordKey, recovery.RecoveryWrappedKey, "recovery-key-v1")
	zeroBytes(recoveryPasswordKey)
	if err != nil {
		return errors.New("복구용 암호가 올바르지 않거나 복구 파일을 열 수 없습니다")
	}
	if _, err := decryptVaultData(vaultKey, file.Data); err != nil {
		zeroBytes(vaultKey)
		return errors.New("복구 파일이 현재 보관함과 일치하지 않습니다")
	}

	newSalt, err := randomBytes(16)
	if err != nil {
		zeroBytes(vaultKey)
		return err
	}
	newPasswordKey := deriveKey(newPassword, newSalt)
	wrappedKey, err := seal(newPasswordKey, vaultKey, "master-key-v1")
	zeroBytes(newPasswordKey)
	zeroBytes(vaultKey)
	if err != nil {
		return err
	}
	file.PasswordSalt = encode(newSalt)
	file.PasswordWrappedKey = wrappedKey
	err = s.writeCredentialChangeLocked(file)
	s.clearSessionLocked()
	if err != nil {
		return fmt.Errorf("새 비밀번호를 저장하지 못했습니다: %w", err)
	}
	return nil
}

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

func validateSetup(request SetupRequest) error {
	if err := validateConfig(normaliseConfig(request.Config)); err != nil {
		return err
	}
	if len([]rune(request.MasterPassword)) < minimumPasswordLen {
		return fmt.Errorf("마스터 비밀번호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if len([]rune(request.RecoveryPassword)) < minimumPasswordLen {
		return fmt.Errorf("복구용 암호는 %d자 이상 입력해 주세요", minimumPasswordLen)
	}
	if strings.TrimSpace(request.RecoveryFilePath) == "" {
		return errors.New("복구 파일 저장 위치를 선택해 주세요")
	}
	return nil
}

func validateConfig(config ClassConfig) error {
	if strings.TrimSpace(config.SchoolYear) == "" {
		return errors.New("학년도를 입력해 주세요")
	}
	role := config.TeacherRole
	if role == "" {
		// 이전 설정을 직접 검사하는 경우에도 기존 담임 설정으로 해석합니다.
		role = "담임 교사"
	}
	if role != "담임 교사" && role != "비담임 교과 교사" {
		return errors.New("담임 교사 또는 비담임 교과 교사를 선택해 주세요")
	}
	if role == "담임 교사" && (strings.TrimSpace(config.Grade) == "" || strings.TrimSpace(config.ClassNumber) == "") {
		return errors.New("담임 교사는 학년과 반을 입력해 주세요")
	}
	if config.AutoLockMinutes < 1 || config.AutoLockMinutes > 120 {
		return errors.New("자동 잠금 시간은 1분에서 120분 사이로 설정해 주세요")
	}
	if config.ExperienceLearningUnit != "학년" && config.ExperienceLearningUnit != "학기" {
		return errors.New("교외체험학습 관리 단위를 학년 또는 학기로 선택해 주세요")
	}
	if config.ExperienceLearningYearLimit < 0 || config.Semester1ExperienceLimit < 0 || config.Semester2ExperienceLimit < 0 {
		return errors.New("교외체험학습 허용 일수는 0일 이상으로 입력해 주세요")
	}
	if err := validateSemesterRange("1학기", config.Semester1StartDate, config.Semester1EndDate); err != nil {
		return err
	}
	if err := validateSemesterRange("2학기", config.Semester2StartDate, config.Semester2EndDate); err != nil {
		return err
	}
	if config.ExperienceLearningUnit == "학기" && (config.Semester1StartDate == "" || config.Semester2StartDate == "") {
		return errors.New("학기 단위 관리는 1학기와 2학기 기간을 모두 입력해 주세요")
	}
	return nil
}

func validateSemesterRange(name, start, end string) error {
	if start == "" && end == "" {
		return nil
	}
	if start == "" || end == "" {
		return fmt.Errorf("%s 시작일과 종료일을 모두 입력해 주세요", name)
	}
	startDate, startErr := time.Parse("2006-01-02", start)
	endDate, endErr := time.Parse("2006-01-02", end)
	if startErr != nil || endErr != nil || endDate.Before(startDate) {
		return fmt.Errorf("%s 기간을 올바르게 입력해 주세요", name)
	}
	return nil
}

func normaliseConfig(config ClassConfig) ClassConfig {
	config.SchoolName = strings.TrimSpace(config.SchoolName)
	config.SchoolYear = strings.TrimSpace(config.SchoolYear)
	config.TeacherRole = strings.TrimSpace(config.TeacherRole)
	config.Grade = strings.TrimSpace(config.Grade)
	config.ClassNumber = strings.TrimSpace(config.ClassNumber)
	config.TeacherLabel = strings.TrimSpace(config.TeacherLabel)
	config.TeachingSubject = strings.TrimSpace(config.TeachingSubject)
	classes := make([]string, 0, len(config.TeachingClasses))
	seenClasses := map[string]bool{}
	for _, className := range config.TeachingClasses {
		className = strings.TrimSpace(className)
		if className != "" && !seenClasses[className] {
			classes = append(classes, className)
			seenClasses[className] = true
		}
	}
	config.TeachingClasses = classes
	config.ExperienceLearningUnit = strings.TrimSpace(config.ExperienceLearningUnit)
	config.Semester1StartDate = strings.TrimSpace(config.Semester1StartDate)
	config.Semester1EndDate = strings.TrimSpace(config.Semester1EndDate)
	config.Semester2StartDate = strings.TrimSpace(config.Semester2StartDate)
	config.Semester2EndDate = strings.TrimSpace(config.Semester2EndDate)
	config.TermsVersion = strings.TrimSpace(config.TermsVersion)
	config.TermsAcceptedAt = strings.TrimSpace(config.TermsAcceptedAt)
	if config.AutoLockMinutes == 0 {
		config.AutoLockMinutes = 5
	}
	if config.TeacherRole == "" {
		// 기존 보관함은 담임 교사 설정으로 안전하게 이어받습니다.
		config.TeacherRole = "담임 교사"
	}
	if config.ExperienceLearningUnit == "" {
		config.ExperienceLearningUnit = "학년"
	}
	return config
}

func decryptVaultData(key []byte, data encryptedBlob) (vaultData, error) {
	payload, err := open(key, data, "vault-data-v1")
	if err != nil {
		return vaultData{}, err
	}
	defer zeroBytes(payload)
	var result vaultData
	if err := json.Unmarshal(payload, &result); err != nil {
		return vaultData{}, err
	}
	return result, nil
}

func deriveKey(password string, salt []byte) []byte {
	return argon2.IDKey([]byte(password), salt, 3, 64*1024, 4, 32)
}

func seal(key, plaintext []byte, additionalData string) (encryptedBlob, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return encryptedBlob{}, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return encryptedBlob{}, err
	}
	nonce, err := randomBytes(gcm.NonceSize())
	if err != nil {
		return encryptedBlob{}, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, []byte(additionalData))
	return encryptedBlob{Nonce: encode(nonce), Ciphertext: encode(ciphertext)}, nil
}

func open(key []byte, encrypted encryptedBlob, additionalData string) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce, err := decode(encrypted.Nonce)
	if err != nil || len(nonce) != gcm.NonceSize() {
		return nil, errors.New("잘못된 암호화 데이터입니다")
	}
	ciphertext, err := decode(encrypted.Ciphertext)
	if err != nil {
		return nil, err
	}
	return gcm.Open(nil, nonce, ciphertext, []byte(additionalData))
}

func randomBytes(length int) ([]byte, error) {
	value := make([]byte, length)
	if _, err := io.ReadFull(rand.Reader, value); err != nil {
		return nil, fmt.Errorf("안전한 난수를 만들지 못했습니다: %w", err)
	}
	return value, nil
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

func encode(value []byte) string { return base64.RawStdEncoding.EncodeToString(value) }

func decode(value string) ([]byte, error) { return base64.RawStdEncoding.DecodeString(value) }


func (s *VaultStore) clearSessionLocked() {
	zeroBytes(s.sessionKey)
	s.sessionKey = nil
	s.session = nil
}
