package vault

import (
	"errors"
	"sort"
	"strings"
	"time"

	"TeacherNote/internal/attendance"
)

// AttendanceEntry는 한 학생의 하루 출결 정보입니다.
type AttendanceEntry = attendance.AttendanceEntry

// AttendanceDay는 날짜별 출결 기록입니다.
type AttendanceDay = attendance.AttendanceDay

// AttendanceDocumentPeriod은 일별 출결 기록에서 계산한 서류 출력용 연속 기간입니다.
type AttendanceDocumentPeriod = attendance.AttendanceDocumentPeriod

// SchoolHoliday는 학사 일정의 공휴일·휴업일 하루입니다.
type SchoolHoliday = attendance.SchoolHoliday

var attendanceStatuses = attendance.AttendanceStatuses
var attendanceReasonCategories = attendance.AttendanceReasonCategories

// GetAttendance는 선택일의 재학생 출결을 반환합니다. 저장 전에는 모두 출석으로 시작합니다.
func (s *VaultStore) GetAttendance(date string) (AttendanceDay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceDay{}, errors.New("먼저 보관함을 열어 주세요")
	}
	attendanceDate, err := validateAttendanceDate(date, s.session.Config)
	if err != nil {
		return AttendanceDay{}, err
	}
	result := AttendanceDay{Date: attendanceDate.Format("2006-01-02"), Entries: []AttendanceEntry{}}
	stored := map[string]AttendanceEntry{}
	for _, day := range s.session.AttendanceDays {
		if day.Date == result.Date {
			result.SavedAt = day.SavedAt
			for _, entry := range day.Entries {
				stored[entry.StudentID] = entry
			}
			break
		}
	}
	departed := s.departedOnLocked(attendanceDate)
	for _, student := range s.attendanceRosterLocked(attendanceDate) {
		entry, found := stored[student.ID]
		if !found {
			entry = AttendanceEntry{StudentID: student.ID, Status: "출석"}
		}
		if _, gone := departed[student.ID]; gone {
			entry.DepartedName, entry.DepartedNumber = student.Name, student.Number
		}
		result.Entries = append(result.Entries, entry)
	}
	return result, nil
}

// departedOnLocked는 그 날짜에는 재학했지만 뒤에 학적변동으로 명단에서 빠진 학생들입니다(학적 처리일 전날까지 재학).
func (s *VaultStore) departedOnLocked(date time.Time) map[string]Student {
	result := map[string]Student{}
	day := date.Format("2006-01-02")
	current := map[string]bool{}
	for _, student := range s.session.Students {
		current[student.ID] = true
	}
	for _, change := range s.session.AcademicChanges {
		if change.StudentID == "" || current[change.StudentID] || day >= change.ProcessedDate {
			continue
		}
		result[change.StudentID] = Student{ID: change.StudentID, Name: change.Name, Number: change.Number}
	}
	return result
}

// attendanceRosterLocked는 그 날짜의 출결 명단(재학생 + 그날 재학했던 전출 학생)입니다.
func (s *VaultStore) attendanceRosterLocked(date time.Time) []Student {
	list := append([]Student{}, s.session.Students...)
	for _, student := range s.departedOnLocked(date) {
		list = append(list, student)
	}
	return attendanceEligibleStudents(list, date)
}

// ListStudentAttendance는 학생별로 저장된 비출석 기록을 최신순으로 반환합니다.
func (s *VaultStore) ListStudentAttendance(studentID string) ([]AttendanceDay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	studentID = strings.TrimSpace(studentID)
	if studentID == "" {
		return nil, errors.New("학생 정보를 확인해 주세요")
	}
	result := make([]AttendanceDay, 0)
	for _, day := range s.session.AttendanceDays {
		for _, entry := range day.Entries {
			if entry.StudentID == studentID && entry.Status != "출석" {
				result = append(result, AttendanceDay{Date: day.Date, Entries: []AttendanceEntry{entry}, SavedAt: day.SavedAt})
				break
			}
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date > result[j].Date })
	return result, nil
}

// GetAttendanceDocumentPeriod은 기준일의 같은 출결 상태·사유가 이어진 수업일을 자동으로 묶습니다.
func (s *VaultStore) GetAttendanceDocumentPeriod(studentID, date string) (AttendanceDocumentPeriod, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceDocumentPeriod{}, errors.New("먼저 보관함을 열어 주세요")
	}
	return s.attendanceDocumentPeriodLocked(studentID, date)
}

func (s *VaultStore) attendanceDocumentPeriodLocked(studentID, date string) (AttendanceDocumentPeriod, error) {
	studentID = strings.TrimSpace(studentID)
	date = strings.TrimSpace(date)
	byDate := make(map[string]AttendanceEntry)
	for _, day := range s.session.AttendanceDays {
		for _, entry := range day.Entries {
			if entry.StudentID == studentID {
				byDate[day.Date] = entry
				break
			}
		}
	}
	entry, ok := byDate[date]
	if !ok || entry.Status == "출석" || entry.Status == "교외체험학습" {
		return AttendanceDocumentPeriod{}, errors.New("해당 날짜의 비출석 기록을 찾지 못했습니다")
	}
	base, err := time.Parse("2006-01-02", date)
	if err != nil {
		return AttendanceDocumentPeriod{}, errors.New("출결 날짜를 확인해 주세요")
	}
	// 공휴일·휴업일은 수업일이 아니므로 건너뛰고 이어서 본다(2026-11-10).
	holidays := attendance.HolidaySet(s.session.Config.Holidays)
	start, end := base, base
	for cursor := attendance.PreviousSchoolDay(base, holidays); ; cursor = attendance.PreviousSchoolDay(cursor, holidays) {
		candidate, found := byDate[cursor.Format("2006-01-02")]
		if !found || !sameAttendanceDocumentGroup(entry, candidate) {
			break
		}
		start = cursor
	}
	for cursor := attendance.NextSchoolDay(base, holidays); ; cursor = attendance.NextSchoolDay(cursor, holidays) {
		candidate, found := byDate[cursor.Format("2006-01-02")]
		if !found || !sameAttendanceDocumentGroup(entry, candidate) {
			break
		}
		end = cursor
	}
	endDate := ""
	if !start.Equal(end) {
		endDate = end.Format("2006-01-02")
	}
	return AttendanceDocumentPeriod{Entry: entry, StartDate: start.Format("2006-01-02"), EndDate: endDate, SchoolDays: attendance.SchoolDayCount(start, end, holidays)}, nil
}

func sameAttendanceDocumentGroup(base, candidate AttendanceEntry) bool {
	return attendance.SameAttendanceDocumentGroup(base, candidate)
}

// SaveAttendance는 선택일 재학생 전체의 출결을 암호화 보관함에 저장합니다.
func (s *VaultStore) SaveAttendance(day AttendanceDay) (AttendanceDay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceDay{}, errors.New("먼저 보관함을 열어 주세요")
	}
	attendanceDate, err := validateAttendanceDate(day.Date, s.session.Config)
	if err != nil {
		return AttendanceDay{}, err
	}
	eligible := s.attendanceRosterLocked(attendanceDate)
	numbers := make(map[string]int, len(eligible))
	for _, student := range eligible {
		numbers[student.ID] = student.Number
	}
	if len(day.Entries) != len(eligible) {
		return AttendanceDay{}, errors.New("해당 날짜의 재학생 전체 출결을 확인해 주세요")
	}
	allowed := make(map[string]bool, len(eligible))
	for _, student := range eligible {
		allowed[student.ID] = true
	}
	seen := make(map[string]bool, len(day.Entries))
	entries := make([]AttendanceEntry, 0, len(day.Entries))
	for _, entry := range day.Entries {
		entry.StudentID = strings.TrimSpace(entry.StudentID)
		entry.Status = strings.TrimSpace(entry.Status)
		entry.ReasonCategory = attendance.NormaliseReasonCategory(entry.ReasonCategory)
		entry.Reason = strings.TrimSpace(entry.Reason)
		entry.Period = strings.TrimSpace(entry.Period)
		if !allowed[entry.StudentID] || seen[entry.StudentID] {
			return AttendanceDay{}, errors.New("출결 대상 학생 정보가 올바르지 않습니다")
		}
		if !attendanceStatuses[entry.Status] {
			return AttendanceDay{}, errors.New("출결 상태를 확인해 주세요")
		}
		if !attendanceReasonCategories[entry.ReasonCategory] {
			return AttendanceDay{}, errors.New("출결 사유 구분을 확인해 주세요")
		}
		entry.StartDate = ""
		entry.EndDate = ""
		entry.SchoolDays = 0
		entry.DepartedName, entry.DepartedNumber = "", 0
		if entry.Status == "출석" || entry.Status == "교외체험학습" {
			entry.ReasonCategory = ""
			entry.Reason = ""
			entry.Period = ""
		}
		seen[entry.StudentID] = true
		entries = append(entries, entry)
	}
	for _, student := range eligible {
		if !seen[student.ID] {
			return AttendanceDay{}, errors.New("출결 대상 학생 전체를 확인해 주세요")
		}
	}
	sort.Slice(entries, func(i, j int) bool {
		return numbers[entries[i].StudentID] < numbers[entries[j].StudentID]
	})
	saved := AttendanceDay{Date: attendanceDate.Format("2006-01-02"), Entries: entries, SavedAt: time.Now().UTC().Format(time.RFC3339)}
	replaced := false
	for index := range s.session.AttendanceDays {
		if s.session.AttendanceDays[index].Date == saved.Date {
			s.session.AttendanceDays[index] = saved
			replaced = true
			break
		}
	}
	if !replaced {
		s.session.AttendanceDays = append(s.session.AttendanceDays, saved)
	}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return AttendanceDay{}, err
	}
	return saved, nil
}

func validateAttendanceDate(value string, config ClassConfig) (time.Time, error) {
	periods := [][2]string{
		{config.Semester1StartDate, config.Semester1EndDate},
		{config.Semester2StartDate, config.Semester2EndDate},
	}
	return attendance.ValidateAttendanceDate(value, periods, attendance.HolidaySet(config.Holidays))
}

func attendanceEligibleStudents(students []Student, date time.Time) []Student {
	return attendance.AttendanceEligibleStudents(students, date)
}

func removeAttendanceForStudent(days []AttendanceDay, studentID string) []AttendanceDay {
	return attendance.RemoveAttendanceForStudent(days, studentID)
}
