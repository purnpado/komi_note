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
	for _, student := range attendanceEligibleStudents(s.session.Students, attendanceDate) {
		entry, found := stored[student.ID]
		if !found {
			entry = AttendanceEntry{StudentID: student.ID, Status: "출석"}
		}
		result.Entries = append(result.Entries, entry)
	}
	return result, nil
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
	start, end := base, base
	for cursor := previousWeekday(base); ; cursor = previousWeekday(cursor) {
		candidate, found := byDate[cursor.Format("2006-01-02")]
		if !found || !sameAttendanceDocumentGroup(entry, candidate) {
			break
		}
		start = cursor
	}
	for cursor := nextWeekday(base); ; cursor = nextWeekday(cursor) {
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
	return AttendanceDocumentPeriod{Entry: entry, StartDate: start.Format("2006-01-02"), EndDate: endDate, SchoolDays: weekdayCount(start, end)}, nil
}

func sameAttendanceDocumentGroup(base, candidate AttendanceEntry) bool {
	return attendance.SameAttendanceDocumentGroup(base, candidate)
}

func previousWeekday(value time.Time) time.Time {
	return attendance.PreviousWeekday(value)
}

func nextWeekday(value time.Time) time.Time {
	return attendance.NextWeekday(value)
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
	eligible := attendanceEligibleStudents(s.session.Students, attendanceDate)
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
		entry.ReasonCategory = strings.TrimSpace(entry.ReasonCategory)
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
		return studentNumber(s.session.Students, entries[i].StudentID) < studentNumber(s.session.Students, entries[j].StudentID)
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

func weekdayCount(start, end time.Time) int {
	return attendance.WeekdayCount(start, end)
}

func validateAttendanceDate(value string, config ClassConfig) (time.Time, error) {
	periods := [][2]string{
		{config.Semester1StartDate, config.Semester1EndDate},
		{config.Semester2StartDate, config.Semester2EndDate},
	}
	return attendance.ValidateAttendanceDate(value, periods)
}

func attendanceEligibleStudents(students []Student, date time.Time) []Student {
	return attendance.AttendanceEligibleStudents(students, date)
}

func studentNumber(students []Student, id string) int {
	for _, student := range students {
		if student.ID == id {
			return student.Number
		}
	}
	return 0
}

func removeAttendanceForStudent(days []AttendanceDay, studentID string) []AttendanceDay {
	return attendance.RemoveAttendanceForStudent(days, studentID)
}
