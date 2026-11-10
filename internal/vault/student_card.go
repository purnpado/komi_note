package vault

import (
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

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
	change := AcademicChange{ID: changeID, Name: student.Name, Status: status, ProcessedDate: processedDate, StudentID: student.ID, Number: student.Number}
	s.session.Students = append(s.session.Students[:index], s.session.Students[index+1:]...)
	s.session.Consultations = consultations
	// 출결 기록은 지우지 않는다(2026-11-10 사용자 결정): 학적 처리일 전 날짜의 출결 화면에 "(전출)" 줄로 남는다.
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

func findStudent(students []Student, id string) (Student, int) {
	for index, student := range students {
		if student.ID == id {
			return student, index
		}
	}
	return Student{}, -1
}
