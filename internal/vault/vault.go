package vault

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

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
	// Holidays는 학사 일정의 공휴일·학교 휴업일(2026-11-10). 출결 입력을 막고 결석일수에서 뺀다.
	Holidays        []SchoolHoliday `json:"holidays,omitempty"`
	TermsVersion    string          `json:"termsVersion"`
	TermsAcceptedAt string          `json:"termsAcceptedAt"`
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
	PinProtected string        `json:"pinProtected,omitempty"`
	Data         encryptedBlob `json:"data"`
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
	Records             *RecordBook          `json:"records,omitempty"`
	Memo                *MemoBook            `json:"memo,omitempty"`
	Schedule            *ScheduleBook        `json:"schedule,omitempty"`
	ReminderSent        []string             `json:"reminderSent,omitempty"`
	Budget              *BudgetBook          `json:"budget,omitempty"`
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

func (s *VaultStore) clearSessionLocked() {
	zeroBytes(s.sessionKey)
	s.sessionKey = nil
	s.session = nil
}
