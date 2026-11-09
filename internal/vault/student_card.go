package vault

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const maxStudentPhotoSize = 5 * 1024 * 1024

// ResetStudents는 학생 명렬·사진·상담 기록만 초기화하고 학급 설정은 유지합니다.
func (s *VaultStore) ResetStudents(confirmation string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return 0, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "학생 명렬 초기화" {
		return 0, errors.New("확인 문구가 일치하지 않습니다")
	}
	count := len(s.session.Students)
	for _, student := range s.session.Students {
		path := s.photoPath(student.ID)
		if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return 0, fmt.Errorf("학생 사진을 삭제하지 못했습니다: %w", err)
		}
	}
	for _, student := range s.session.Students {
		removeStudentReferences(s.session, student.ID)
	}
	s.session.Students = []Student{}
	s.session.Consultations = []Consultation{}
	s.session.AcademicChanges = []AcademicChange{}
	s.session.AttendanceDays = []AttendanceDay{}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return 0, err
	}
	return count, nil
}

// DeleteStudent는 한 학생의 개인정보·사진·상담 기록을 함께 삭제합니다.
func (s *VaultStore) DeleteStudent(studentID, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "학생 삭제" {
		return errors.New("확인 문구가 일치하지 않습니다")
	}
	_, index := findStudent(s.session.Students, studentID)
	if index < 0 {
		return errors.New("학생을 찾지 못했습니다")
	}
	if err := os.Remove(s.photoPath(studentID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("학생 사진을 삭제하지 못했습니다: %w", err)
	}
	s.session.Students = append(s.session.Students[:index], s.session.Students[index+1:]...)
	s.session.AttendanceDays = removeAttendanceForStudent(s.session.AttendanceDays, studentID)
	consultations := make([]Consultation, 0, len(s.session.Consultations))
	for _, item := range s.session.Consultations {
		if item.StudentID != studentID {
			consultations = append(consultations, item)
		}
	}
	s.session.Consultations = consultations
	removeStudentReferences(s.session, studentID)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return err
	}
	return nil
}

var academicChangeStatuses = map[string]bool{
	"전출":   true,
	"유예":   true,
	"자퇴":   true,
	"면제":   true,
	"정원외":  true,
	"조기졸업": true,
}

// ListAcademicChanges는 개인정보를 삭제한 학적변동 최소 이력을 반환합니다.
func (s *VaultStore) ListAcademicChanges() ([]AcademicChange, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]AcademicChange{}, s.session.AcademicChanges...)
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].ProcessedDate == items[j].ProcessedDate {
			return items[i].Name < items[j].Name
		}
		return items[i].ProcessedDate > items[j].ProcessedDate
	})
	return items, nil
}

// ProcessAcademicChange는 학생 상세정보를 삭제하고 최소 학적변동 이력만 남깁니다.
func (s *VaultStore) ProcessAcademicChange(studentID, status, processedDate, confirmation string) (AcademicChange, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AcademicChange{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "학적변동 처리" {
		return AcademicChange{}, errors.New("확인 문구가 일치하지 않습니다")
	}
	status = strings.TrimSpace(status)
	if !academicChangeStatuses[status] {
		return AcademicChange{}, errors.New("학적변동 종류를 선택해 주세요")
	}
	processedDate = strings.TrimSpace(processedDate)
	if _, err := time.Parse("2006-01-02", processedDate); err != nil {
		return AcademicChange{}, errors.New("학적 처리일은 YYYY-MM-DD 형식으로 입력해 주세요")
	}
	student, index := findStudent(s.session.Students, studentID)
	if index < 0 {
		return AcademicChange{}, errors.New("학생을 찾지 못했습니다")
	}
	if err := os.Remove(s.photoPath(studentID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return AcademicChange{}, fmt.Errorf("학생 사진을 삭제하지 못했습니다: %w", err)
	}
	consultations := make([]Consultation, 0, len(s.session.Consultations))
	for _, item := range s.session.Consultations {
		if item.StudentID != studentID {
			consultations = append(consultations, item)
		}
	}
	changeID, err := newStudentID()
	if err != nil {
		return AcademicChange{}, err
	}
	change := AcademicChange{ID: changeID, Name: student.Name, Status: status, ProcessedDate: processedDate}
	s.session.Students = append(s.session.Students[:index], s.session.Students[index+1:]...)
	s.session.Consultations = consultations
	s.session.AttendanceDays = removeAttendanceForStudent(s.session.AttendanceDays, studentID)
	removeStudentReferences(s.session, studentID)
	s.session.AcademicChanges = append(s.session.AcademicChanges, change)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return AcademicChange{}, err
	}
	return change, nil
}

// removeStudentReferences는 삭제·학적변동 뒤 남을 수 있는 간접 식별자를 정리합니다.
// 설문 답변의 내용은 학급 집계를 위해 유지하되, 학생 ID와 이름은 익명화합니다.
// 호출자는 반드시 VaultStore 잠금을 잡은 상태여야 합니다.
func removeStudentReferences(data *vaultData, studentID string) {
	if data == nil || strings.TrimSpace(studentID) == "" {
		return
	}
	removeStudentRecords(data, studentID)
	for surveyIndex := range data.Surveys {
		for responseIndex := range data.Surveys[surveyIndex].Responses {
			response := &data.Surveys[surveyIndex].Responses[responseIndex]
			if response.StudentID == studentID {
				response.StudentID = ""
				response.RespondentName = ""
			}
		}
	}
	for planIndex := range data.SeatingPlans {
		plan := &data.SeatingPlans[planIndex]
		for seatIndex := range plan.Seats {
			if plan.Seats[seatIndex].StudentID == studentID {
				plan.Seats[seatIndex].StudentID = ""
			}
		}
		fixed := plan.FixedStudentIDs[:0]
		for _, fixedID := range plan.FixedStudentIDs {
			if fixedID != studentID {
				fixed = append(fixed, fixedID)
			}
		}
		plan.FixedStudentIDs = fixed
	}
	for planIndex := range data.CleaningPlans {
		plan := &data.CleaningPlans[planIndex]
		assignments := plan.Assignments[:0]
		for _, assignment := range plan.Assignments {
			if assignment.StudentID != studentID {
				assignments = append(assignments, assignment)
			}
		}
		plan.Assignments = assignments
	}
	for documentIndex := range data.SubmissionDocuments {
		document := &data.SubmissionDocuments[documentIndex]
		statuses := document.Statuses[:0]
		for _, status := range document.Statuses {
			if status.StudentID != studentID {
				statuses = append(statuses, status)
			}
		}
		document.Statuses = statuses
	}
}

// Consultation은 학생별로 누적하는 상담 기록입니다.
type Consultation struct {
	ID           string `json:"id"`
	StudentID    string `json:"studentId"`
	ParentID     string `json:"parentId"`
	RootID       string `json:"rootId"`
	Date         string `json:"date"`
	Type         string `json:"type"`
	Content      string `json:"content"`
	FollowUpDate string `json:"followUpDate"`
	FollowUpDone bool   `json:"followUpDone"`
	// ManualDone은 후속 기록 없이 교사가 직접 "확인 완료"로 끝낸 표시입니다.
	ManualDone bool   `json:"manualDone,omitempty"`
	RecordedAt string `json:"recordedAt"`
}

const (
	maxConsultationContent = 5000
	maxConsultationType    = 20
)

// sortConsultations는 상담 날짜 최신 순, 같은 날짜는 나중에 쓴 기록이 먼저 오도록 정렬합니다.
func sortConsultations(items []Consultation) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Date != items[j].Date {
			return items[i].Date > items[j].Date
		}
		return items[i].RecordedAt > items[j].RecordedAt
	})
}

// refreshFollowUpDone은 후속 기록이 있거나 직접 완료한 기록만 확인 완료로 맞춥니다.
func refreshFollowUpDone(items []Consultation) {
	hasChild := map[string]bool{}
	for _, item := range items {
		if item.ParentID != "" {
			hasChild[item.ParentID] = true
		}
	}
	for i := range items {
		items[i].FollowUpDone = hasChild[items[i].ID] || items[i].ManualDone
	}
}

type studentPhoto struct {
	MIME string `json:"mime"`
	Data string `json:"data"`
}

func (s *VaultStore) SaveStudentPhoto(studentID, path string) (Student, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Student{}, errors.New("먼저 보관함을 열어 주세요")
	}
	student, index := findStudent(s.session.Students, studentID)
	if index < 0 {
		return Student{}, errors.New("학생을 찾지 못했습니다")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return Student{}, fmt.Errorf("사진 파일을 읽지 못했습니다: %w", err)
	}
	defer zeroBytes(contents)
	if len(contents) == 0 || len(contents) > maxStudentPhotoSize {
		return Student{}, errors.New("사진은 5MB 이하의 이미지 파일만 사용할 수 있습니다")
	}
	mime := http.DetectContentType(contents)
	if mime != "image/jpeg" && mime != "image/png" && mime != "image/webp" {
		return Student{}, errors.New("JPG, PNG, WEBP 사진 파일만 사용할 수 있습니다")
	}
	payload, err := json.Marshal(studentPhoto{MIME: mime, Data: base64.StdEncoding.EncodeToString(contents)})
	if err != nil {
		return Student{}, errors.New("사진 저장을 준비하지 못했습니다")
	}
	defer zeroBytes(payload)
	encrypted, err := seal(s.sessionKey, payload, studentPhotoAAD(studentID))
	if err != nil {
		return Student{}, err
	}
	if err := writeJSONSecure(s.photoPath(studentID), encrypted); err != nil {
		return Student{}, fmt.Errorf("학생 사진을 저장하지 못했습니다: %w", err)
	}
	student.HasPhoto = true
	s.session.Students[index] = student
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return Student{}, err
	}
	return student, nil
}

func (s *VaultStore) GetStudentPhoto(studentID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return "", errors.New("먼저 보관함을 열어 주세요")
	}
	if _, index := findStudent(s.session.Students, studentID); index < 0 {
		return "", errors.New("학생을 찾지 못했습니다")
	}
	var encrypted encryptedBlob
	if err := readJSON(s.photoPath(studentID), &encrypted); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", nil
		}
		return "", errors.New("학생 사진을 읽지 못했습니다")
	}
	payload, err := open(s.sessionKey, encrypted, studentPhotoAAD(studentID))
	if err != nil {
		// 2026-11 이전 사진은 학생 ID 없이 암호화되었다. 예전 방식으로 열리면
		// 이 학생 ID를 넣어 다시 암호화해 둔다. 다시 저장에 실패해도 사진은 보여 준다.
		legacy, legacyErr := open(s.sessionKey, encrypted, legacyStudentPhotoAAD)
		if legacyErr != nil {
			return "", errors.New("학생 사진을 열지 못했습니다")
		}
		payload = legacy
		if resealed, sealErr := seal(s.sessionKey, payload, studentPhotoAAD(studentID)); sealErr == nil {
			_ = writeJSONSecure(s.photoPath(studentID), resealed)
		}
	}
	defer zeroBytes(payload)
	var photo studentPhoto
	if err := json.Unmarshal(payload, &photo); err != nil {
		return "", errors.New("학생 사진 형식이 올바르지 않습니다")
	}
	return "data:" + photo.MIME + ";base64," + photo.Data, nil
}

func (s *VaultStore) ListConsultations(studentID string) ([]Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := []Consultation{}
	for _, item := range s.session.Consultations {
		if item.StudentID == studentID {
			items = append(items, item)
		}
	}
	sortConsultations(items)
	return items, nil
}

// ListAllConsultations는 상담 기록 메뉴에서 사용하는 전체 누적 기록을 반환합니다.
func (s *VaultStore) ListAllConsultations() ([]Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]Consultation{}, s.session.Consultations...)
	sortConsultations(items)
	return items, nil
}

func (s *VaultStore) SaveConsultation(item Consultation) (Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Consultation{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if _, index := findStudent(s.session.Students, item.StudentID); index < 0 {
		return Consultation{}, errors.New("학생을 찾지 못했습니다")
	}
	item.Date = strings.TrimSpace(item.Date)
	item.Type = strings.TrimSpace(item.Type)
	item.Content = strings.TrimSpace(item.Content)
	item.FollowUpDate = strings.TrimSpace(item.FollowUpDate)
	if item.Date == "" || item.Type == "" || item.Content == "" {
		return Consultation{}, errors.New("상담 날짜, 유형, 내용을 입력해 주세요")
	}
	if _, err := time.Parse("2006-01-02", item.Date); err != nil {
		return Consultation{}, errors.New("상담 날짜를 확인해 주세요")
	}
	if item.FollowUpDate != "" {
		if _, err := time.Parse("2006-01-02", item.FollowUpDate); err != nil {
			return Consultation{}, errors.New("다음 확인 예정일을 확인해 주세요")
		}
		if item.FollowUpDate < item.Date {
			return Consultation{}, errors.New("다음 확인 예정일은 상담 날짜와 같거나 그 뒤로 정해 주세요")
		}
	}
	if utf8.RuneCountInString(item.Content) > maxConsultationContent {
		return Consultation{}, fmt.Errorf("상담 내용은 %d자 이하로 입력해 주세요", maxConsultationContent)
	}
	if utf8.RuneCountInString(item.Type) > maxConsultationType {
		return Consultation{}, fmt.Errorf("상담 유형은 %d자 이하로 입력해 주세요", maxConsultationType)
	}
	// 저장에 실패하면 이 상태로 되돌린다(메모리에만 남아 다음 저장 때 섞여 들어가지 않게).
	previous := append([]Consultation{}, s.session.Consultations...)
	if item.ID == "" {
		item.ManualDone = false
		if item.ParentID != "" {
			found := false
			for _, parent := range s.session.Consultations {
				if parent.ID == item.ParentID && parent.StudentID == item.StudentID {
					item.RootID = parent.RootID
					if item.RootID == "" {
						item.RootID = parent.ID
					}
					found = true
					break
				}
			}
			if !found {
				return Consultation{}, errors.New("연결할 상담 기록을 찾지 못했습니다")
			}
		}
		id, err := newStudentID()
		if err != nil {
			return Consultation{}, err
		}
		item.ID = id
		item.RecordedAt = time.Now().In(time.Local).Format(time.RFC3339)
		if item.RootID == "" {
			item.RootID = item.ID
		}
		// 후속 기록이 남으면 바로 앞 기록의 확인은 끝난 것으로 봅니다(refreshFollowUpDone).
		s.session.Consultations = append(s.session.Consultations, item)
	} else {
		index := -1
		for i := range s.session.Consultations {
			if s.session.Consultations[i].ID == item.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return Consultation{}, errors.New("수정할 상담 기록을 찾지 못했습니다")
		}
		existing := s.session.Consultations[index]
		if existing.StudentID != item.StudentID {
			return Consultation{}, errors.New("학생을 바꿔 상담 기록을 수정할 수 없습니다")
		}
		// 연결·작성 시각·완료 상태는 화면 값이 아니라 보관함 값을 유지합니다.
		item.ParentID = existing.ParentID
		item.RootID = existing.RootID
		item.RecordedAt = existing.RecordedAt
		item.ManualDone = existing.ManualDone
		if item.FollowUpDate == "" {
			item.ManualDone = false
		}
		s.session.Consultations[index] = item
	}
	refreshFollowUpDone(s.session.Consultations)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return Consultation{}, err
	}
	for _, saved := range s.session.Consultations {
		if saved.ID == item.ID {
			return saved, nil
		}
	}
	return item, nil
}

// SetConsultationFollowUpDone은 후속 기록 없이 "확인 완료"로 끝내거나(done) 그 표시를 취소합니다.
// 후속 기록이 있는 기록은 이미 완료이므로 취소해도 완료로 남습니다.
func (s *VaultStore) SetConsultationFollowUpDone(id string, done bool) (Consultation, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Consultation{}, errors.New("먼저 보관함을 열어 주세요")
	}
	index := -1
	for i := range s.session.Consultations {
		if s.session.Consultations[i].ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return Consultation{}, errors.New("상담 기록을 찾지 못했습니다")
	}
	if done && s.session.Consultations[index].FollowUpDate == "" {
		return Consultation{}, errors.New("다음 확인 예정일이 있는 기록만 확인 완료로 표시할 수 있습니다")
	}
	previous := append([]Consultation{}, s.session.Consultations...)
	s.session.Consultations[index].ManualDone = done
	refreshFollowUpDone(s.session.Consultations)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return Consultation{}, err
	}
	return s.session.Consultations[index], nil
}

// DeleteConsultation은 선택한 상담 기록과 연결된 모든 후속 기록을 함께 삭제합니다.
func (s *VaultStore) DeleteConsultation(id string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return 0, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(id) == "" {
		return 0, errors.New("삭제할 상담 기록을 찾지 못했습니다")
	}
	removeIDs := map[string]bool{id: true}
	changed := true
	for changed {
		changed = false
		for _, item := range s.session.Consultations {
			if removeIDs[item.ParentID] && !removeIDs[item.ID] {
				removeIDs[item.ID] = true
				changed = true
			}
		}
	}
	kept := make([]Consultation, 0, len(s.session.Consultations))
	for _, item := range s.session.Consultations {
		if !removeIDs[item.ID] {
			kept = append(kept, item)
		}
	}
	if len(kept) == len(s.session.Consultations) {
		return 0, errors.New("삭제할 상담 기록을 찾지 못했습니다")
	}
	previous := s.session.Consultations
	refreshFollowUpDone(kept)
	s.session.Consultations = kept
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Consultations = previous
		return 0, err
	}
	return len(removeIDs), nil
}

// legacyStudentPhotoAAD는 학생 ID를 묶기 전 사진의 추가 인증 값이다. 읽기 호환에만 쓴다.
const legacyStudentPhotoAAD = "student-photo-v1"

// studentPhotoAAD는 사진 암호문을 해당 학생 ID에 묶는다.
// 다른 학생의 사진 파일을 이 학생 이름으로 바꿔 넣으면 열리지 않는다.
func studentPhotoAAD(studentID string) string {
	return "student-photo-v2:" + studentID
}

func (s *VaultStore) photoPath(studentID string) string {
	return filepath.Join(filepath.Dir(s.filePath), "photos", studentID+".photo")
}
func findStudent(students []Student, id string) (Student, int) {
	for index, student := range students {
		if student.ID == id {
			return student, index
		}
	}
	return Student{}, -1
}
