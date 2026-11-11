package attendance

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"TeacherNote/internal/students"
)

// AttendanceEntry는 한 학생의 하루 출결 정보입니다.
type AttendanceEntry struct {
	StudentID      string `json:"studentId"`
	Status         string `json:"status"`
	ReasonCategory string `json:"reasonCategory"`
	Reason         string `json:"reason"`
	Period         string `json:"period"`
	StartDate      string `json:"startDate"`
	EndDate        string `json:"endDate"`
	SchoolDays     int    `json:"schoolDays"`
	// DepartedName·DepartedNumber는 화면 표시용(저장하지 않음): 학적변동으로 명단에서 빠진 학생의 그날 줄.
	DepartedName   string `json:"departedName,omitempty"`
	DepartedNumber int    `json:"departedNumber,omitempty"`
}

// AttendanceDay는 날짜별 출결 기록입니다.
type AttendanceDay struct {
	Date    string            `json:"date"`
	Entries []AttendanceEntry `json:"entries"`
	SavedAt string            `json:"savedAt"`
}

// AttendanceDocumentPeriod은 일별 출결 기록에서 계산한 서류 출력용 연속 기간입니다.
type AttendanceDocumentPeriod struct {
	Entry      AttendanceEntry `json:"entry"`
	StartDate  string          `json:"startDate"`
	EndDate    string          `json:"endDate"`
	SchoolDays int             `json:"schoolDays"`
}

// AttendanceTemplate은 학교별 결석계 양식과 교사가 지정한 입력 위치입니다.
type AttendanceTemplate struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	FileName     string                 `json:"fileName"`
	Format       string                 `json:"format"`
	Statuses     []string               `json:"statuses"`
	PreviewData  string                 `json:"previewData"`
	Mappings     []AttendanceFieldPoint `json:"mappings"`
	CustomValues map[string]string      `json:"customValues"`
	CreatedAt    string                 `json:"createdAt"`
}

// AttendanceFieldPoint는 양식 미리보기의 가로·세로 비율 좌표입니다.
type AttendanceFieldPoint struct {
	ID       string  `json:"id"`
	Field    string  `json:"field"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Width    float64 `json:"width"`
	Height   float64 `json:"height"`
	FontSize float64 `json:"fontSize"`
	Format   string  `json:"format"`
}

// AttendanceHWPXBuildResult는 원본을 수정하지 않고 만든 결과 바이트와
// 서식에서 아직 채우지 못한 치환자 목록을 함께 전달합니다.
type AttendanceHWPXBuildResult struct {
	Data       []byte   `json:"data"`
	FileName   string   `json:"fileName"`
	Unresolved []string `json:"unresolved"`
}

var AttendanceStatuses = map[string]bool{
	"출석":     true,
	"결석":     true,
	"지각":     true,
	"조퇴":     true,
	"결과":     true,
	"교외체험학습": true,
}

// AttendanceReasonCategoryList는 화면에서 고르는 사유 구분입니다(학교생활기록부와 같음, 2026-11-10 정리).
// 화면 목록 frontend/src/features/attendance/attendanceReasonState.ts의 REASON_CATEGORIES와 같아야 합니다.
var AttendanceReasonCategoryList = []string{"질병", "미인정", "기타", "출석인정"}

// LegacyCustomReasonCategory는 예전 화면에 있던 '직접 입력'입니다. 이미 저장된 기록은 그대로 두므로 다시 저장해도 받습니다.
const LegacyCustomReasonCategory = "직접 입력"

// AttendanceReasonCategories는 저장할 때 받는 사유 구분입니다(선택 안 함 + 목록 + 예전 '직접 입력').
var AttendanceReasonCategories = func() map[string]bool {
	result := map[string]bool{"": true, LegacyCustomReasonCategory: true}
	for _, item := range AttendanceReasonCategoryList {
		result[item] = true
	}
	return result
}()

// NormaliseReasonCategory는 앞뒤 빈칸을 지우고 예전 값 '인정'을 '출석인정'으로 바꿉니다.
func NormaliseReasonCategory(value string) string {
	value = strings.TrimSpace(value)
	if value == "인정" {
		return "출석인정"
	}
	return value
}

// UpgradeLegacyReasonCategories는 보관함을 열 때 저장된 '인정'을 '출석인정'으로 바꿉니다(같은 사유끼리 서류 기간이 이어지게).
func UpgradeLegacyReasonCategories(days []AttendanceDay) {
	for dayIndex := range days {
		for entryIndex := range days[dayIndex].Entries {
			entry := &days[dayIndex].Entries[entryIndex]
			entry.ReasonCategory = NormaliseReasonCategory(entry.ReasonCategory)
		}
	}
}

// WeekdayCount는 시작일부터 종료일까지의 주말 제외 수업일 수를 반환합니다.
func WeekdayCount(start, end time.Time) int {
	count := 0
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		if day.Weekday() != time.Saturday && day.Weekday() != time.Sunday {
			count++
		}
	}
	return count
}

// PreviousWeekday는 이전 평일(월~금)을 반환합니다.
func PreviousWeekday(value time.Time) time.Time {
	for value = value.AddDate(0, 0, -1); value.Weekday() == time.Saturday || value.Weekday() == time.Sunday; value = value.AddDate(0, 0, -1) {
	}
	return value
}

// NextWeekday는 다음 평일(월~금)을 반환합니다.
func NextWeekday(value time.Time) time.Time {
	for value = value.AddDate(0, 0, 1); value.Weekday() == time.Saturday || value.Weekday() == time.Sunday; value = value.AddDate(0, 0, 1) {
	}
	return value
}

// SameAttendanceDocumentGroup은 서류로 함께 묶을 수 있는 동일 사유 연속 출결인지 판정합니다.
func SameAttendanceDocumentGroup(base, candidate AttendanceEntry) bool {
	return candidate.Status == base.Status && candidate.ReasonCategory == base.ReasonCategory && candidate.Status != "출석" && candidate.Status != "교외체험학습"
}

// AttendanceEligibleStudents는 지정일 기준 전입일 이전 학생을 제외한 출결 대상 학생을 번호순으로 반환합니다.
func AttendanceEligibleStudents(list []students.Student, date time.Time) []students.Student {
	items := make([]students.Student, 0, len(list))
	for _, student := range list {
		if student.TransferInDate != "" {
			transferDate, err := time.Parse("2006-01-02", student.TransferInDate)
			if err != nil || date.Before(transferDate) {
				continue
			}
		}
		items = append(items, student)
	}
	students.SortStudents(items)
	return items
}

// RemoveAttendanceForStudent는 학생 삭제 시 해당 학생의 출결 기록을 제거합니다.
func RemoveAttendanceForStudent(days []AttendanceDay, studentID string) []AttendanceDay {
	result := make([]AttendanceDay, 0, len(days))
	for _, day := range days {
		entries := make([]AttendanceEntry, 0, len(day.Entries))
		for _, entry := range day.Entries {
			if entry.StudentID != studentID {
				entries = append(entries, entry)
			}
		}
		if len(entries) > 0 {
			day.Entries = entries
			result = append(result, day)
		}
	}
	return result
}

// ValidateAttendanceDate는 입력된 출결 날짜 형식 및 평일 여부를 검증합니다.
// 학기 기간은 교사가 입력한 정보로 "확실히 수업이 없는 날"(1학기 시작 전, 1·2학기 사이 방학,
// 2학기 종료 뒤)만 막습니다. 2학기 기간을 아직 입력하지 않았다면 1학기 뒤 날짜는 막지 않습니다.
// holidays(선택)는 학사 일정의 공휴일·휴업일 표(날짜 → 이름)이며, 그날도 막습니다.
func ValidateAttendanceDate(value string, semesterPeriods [][2]string, holidays ...map[string]string) (time.Time, error) {
	date, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, errors.New("출결 날짜를 확인해 주세요")
	}
	if date.Weekday() == time.Saturday || date.Weekday() == time.Sunday {
		return time.Time{}, errors.New("주말에는 출결을 입력할 수 없습니다")
	}
	for _, set := range holidays {
		if name, found := set[date.Format("2006-01-02")]; found {
			return time.Time{}, errors.New(koreanMonthDay(date) + "은 " + name + "(공휴일·휴업일)이라 출결을 입력할 수 없습니다. 환경 설정의 \"학사 일정\"에서 바꿀 수 있습니다.")
		}
	}
	if reason := outsideSemesterReason(date, semesterPeriods); reason != "" {
		return time.Time{}, errors.New(reason)
	}
	return date, nil
}

type semesterPeriod struct {
	start, end time.Time
	ok         bool
}

func parseSemesterPeriod(period [2]string) semesterPeriod {
	start, startErr := time.Parse("2006-01-02", strings.TrimSpace(period[0]))
	end, endErr := time.Parse("2006-01-02", strings.TrimSpace(period[1]))
	if startErr != nil || endErr != nil || end.Before(start) {
		return semesterPeriod{}
	}
	return semesterPeriod{start: start, end: end, ok: true}
}

func koreanMonthDay(date time.Time) string {
	return fmt.Sprintf("%d월 %d일", int(date.Month()), date.Day())
}

// outsideSemesterReason은 날짜가 학기 밖이라고 확실히 말할 수 있을 때만 안내 문장을 돌려줍니다.
func outsideSemesterReason(date time.Time, periods [][2]string) string {
	var first, second semesterPeriod
	if len(periods) > 0 {
		first = parseSemesterPeriod(periods[0])
	}
	if len(periods) > 1 {
		second = parseSemesterPeriod(periods[1])
	}
	within := func(period semesterPeriod) bool {
		return period.ok && !date.Before(period.start) && !date.After(period.end)
	}
	if within(first) || within(second) {
		return ""
	}
	const hint = " 학기 기간은 환경 설정의 \"학사 일정\"에서 바꿀 수 있습니다."
	if first.ok && date.Before(first.start) {
		return "1학기 시작일(" + koreanMonthDay(first.start) + ") 전이라 출결을 입력할 수 없습니다." + hint
	}
	if first.ok && second.ok && date.After(first.end) && date.Before(second.start) {
		return "1학기와 2학기 사이 방학(" + koreanMonthDay(first.end.AddDate(0, 0, 1)) + "~" + koreanMonthDay(second.start.AddDate(0, 0, -1)) + ")이라 출결을 입력할 수 없습니다." + hint
	}
	if second.ok && date.After(second.end) {
		return "2학기 종료일(" + koreanMonthDay(second.end) + ") 뒤라 출결을 입력할 수 없습니다." + hint
	}
	// 나머지(2학기 미입력 상태의 1학기 뒤, 1학기 미입력 상태의 2학기 전)는 수업일일 수 있어 막지 않는다.
	return ""
}
