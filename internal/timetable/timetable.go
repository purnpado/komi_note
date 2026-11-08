// Package timetable은 반 시간표와 교사 개인 시간표, 교시 시각, 날짜별 교체·보강 기록의
// 입력 정리와 검사 규칙을 담당합니다. 저장은 vault 패키지가 암호화 보관함에 합니다.
package timetable

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	// KindTeacher는 교사 개인(내 수업) 시간표입니다.
	KindTeacher = "teacher"
	// KindClass는 담임 학급(우리 반) 시간표입니다.
	KindClass = "class"

	// MaxPeriods는 하루 최대 교시 수입니다.
	MaxPeriods = 10
	// Weekdays는 월(1)~금(5) 다섯 요일입니다.
	Weekdays = 5

	maxShortText = 40
	maxNoteText  = 200
	maxChanges   = 500
)

// ChangeKinds는 날짜별 변경 종류입니다.
var ChangeKinds = []string{"교체", "보강", "결강"}

// BellRule은 교시 시각을 자동 계산하는 학교 규칙입니다.
type BellRule struct {
	FirstStart    string `json:"firstStart"`
	LessonMinutes int    `json:"lessonMinutes"`
	BreakMinutes  int    `json:"breakMinutes"`
	LunchAfter    int    `json:"lunchAfter"`
	LunchMinutes  int    `json:"lunchMinutes"`
	PeriodCount   int    `json:"periodCount"`
}

// Period는 한 교시의 시작·끝 시각("09:00")입니다.
type Period struct {
	Number int    `json:"number"`
	Start  string `json:"start"`
	End    string `json:"end"`
}

// Cell은 시간표 한 칸(요일·교시)입니다. 학생 정보는 담지 않습니다.
type Cell struct {
	Day            int    `json:"day"`
	Period         int    `json:"period"`
	Subject        string `json:"subject"`
	ClassName      string `json:"className"`
	Room           string `json:"room"`
	Note           string `json:"note"`
	CourseRosterID string `json:"courseRosterId"`
}

// Timetable은 학년도·학기별 한 종류의 시간표입니다.
type Timetable struct {
	ID         string `json:"id"`
	Kind       string `json:"kind"`
	SchoolYear string `json:"schoolYear"`
	Semester   string `json:"semester"`
	Cells      []Cell `json:"cells"`
}

// Change는 특정 날짜·교시의 교체·보강·결강 기록입니다.
type Change struct {
	ID             string `json:"id"`
	Date           string `json:"date"`
	Period         int    `json:"period"`
	Kind           string `json:"kind"`
	Target         string `json:"target"`
	Subject        string `json:"subject"`
	ClassName      string `json:"className"`
	Room           string `json:"room"`
	Note           string `json:"note"`
	CourseRosterID string `json:"courseRosterId"`
}

// Book은 보관함에 저장되는 시간표 전체입니다.
type Book struct {
	Rule             BellRule    `json:"rule"`
	Periods          []Period    `json:"periods"`
	ActiveSchoolYear string      `json:"activeSchoolYear"`
	ActiveSemester   string      `json:"activeSemester"`
	Timetables       []Timetable `json:"timetables"`
	Changes          []Change    `json:"changes"`
	UpdatedAt        string      `json:"updatedAt"`
}

// ParseClock은 "9:05"·"09:05"를 자정부터의 분으로 바꿉니다.
func ParseClock(value string) (int, error) {
	value = strings.TrimSpace(value)
	parsed, err := time.Parse("15:04", value)
	if err != nil {
		if parsed, err = time.Parse("3:04", value); err != nil {
			return 0, fmt.Errorf("시각 %q는 09:00처럼 입력해 주세요", value)
		}
	}
	return parsed.Hour()*60 + parsed.Minute(), nil
}

// FormatClock은 분을 "09:05" 형식으로 바꿉니다.
func FormatClock(minutes int) string {
	return fmt.Sprintf("%02d:%02d", minutes/60, minutes%60)
}

// ComputePeriods는 학교 규칙으로 교시별 시각을 계산합니다.
func ComputePeriods(rule BellRule) ([]Period, error) {
	start, err := ParseClock(rule.FirstStart)
	if err != nil {
		return nil, errors.New("1교시 시작 시각을 09:00처럼 입력해 주세요")
	}
	if rule.PeriodCount < 1 || rule.PeriodCount > MaxPeriods {
		return nil, fmt.Errorf("교시 수는 1~%d 사이로 입력해 주세요", MaxPeriods)
	}
	if rule.LessonMinutes < 10 || rule.LessonMinutes > 180 {
		return nil, errors.New("수업 길이는 10~180분 사이로 입력해 주세요")
	}
	if rule.BreakMinutes < 0 || rule.BreakMinutes > 60 {
		return nil, errors.New("쉬는 시간은 0~60분 사이로 입력해 주세요")
	}
	if rule.LunchAfter < 0 || (rule.LunchAfter != 0 && rule.LunchAfter >= rule.PeriodCount) {
		return nil, errors.New("점심시간은 마지막 교시보다 앞 교시 뒤에 넣어 주세요")
	}
	if rule.LunchAfter > 0 && (rule.LunchMinutes < 10 || rule.LunchMinutes > 180) {
		return nil, errors.New("점심시간 길이는 10~180분 사이로 입력해 주세요")
	}
	periods := make([]Period, 0, rule.PeriodCount)
	cursor := start
	for number := 1; number <= rule.PeriodCount; number++ {
		end := cursor + rule.LessonMinutes
		if end >= 24*60 {
			return nil, errors.New("마지막 교시가 자정을 넘습니다. 시작 시각과 길이를 확인해 주세요")
		}
		periods = append(periods, Period{Number: number, Start: FormatClock(cursor), End: FormatClock(end)})
		if number == rule.LunchAfter {
			cursor = end + rule.LunchMinutes
		} else {
			cursor = end + rule.BreakMinutes
		}
	}
	return periods, nil
}

func clip(value string, limit int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}

func validSemester(value string) bool { return value == "1" || value == "2" }

func validYear(value string) bool {
	if len(value) != 4 {
		return false
	}
	for _, r := range value {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// TimetableID는 종류·학년도·학기로 정해지는 시간표 식별값입니다.
func TimetableID(kind, schoolYear, semester string) string {
	return kind + "-" + schoolYear + "-" + semester
}

func normalisePeriods(periods []Period) ([]Period, error) {
	if len(periods) > MaxPeriods {
		return nil, fmt.Errorf("교시는 %d개까지 둘 수 있습니다", MaxPeriods)
	}
	result := make([]Period, 0, len(periods))
	previousEnd := -1
	for index, period := range periods {
		start, err := ParseClock(period.Start)
		if err != nil {
			return nil, fmt.Errorf("%d교시 시작 시각을 09:00처럼 입력해 주세요", index+1)
		}
		end, err := ParseClock(period.End)
		if err != nil {
			return nil, fmt.Errorf("%d교시 끝 시각을 09:45처럼 입력해 주세요", index+1)
		}
		if end <= start {
			return nil, fmt.Errorf("%d교시 끝 시각이 시작 시각보다 늦어야 합니다", index+1)
		}
		if start < previousEnd {
			return nil, fmt.Errorf("%d교시가 앞 교시와 겹칩니다", index+1)
		}
		previousEnd = end
		result = append(result, Period{Number: index + 1, Start: FormatClock(start), End: FormatClock(end)})
	}
	return result, nil
}

func normaliseCell(cell Cell) Cell {
	cell.Subject = clip(cell.Subject, maxShortText)
	cell.ClassName = clip(cell.ClassName, maxShortText)
	cell.Room = clip(cell.Room, maxShortText)
	cell.Note = clip(cell.Note, maxNoteText)
	cell.CourseRosterID = clip(cell.CourseRosterID, 80)
	return cell
}

func (cell Cell) empty() bool {
	return cell.Subject == "" && cell.ClassName == "" && cell.Room == "" && cell.Note == "" && cell.CourseRosterID == ""
}

// Normalise는 시간표 전체를 정리하고 잘못된 값이 있으면 교사가 이해할 수 있는 오류를 돌려줍니다.
// newID는 날짜별 변경에 식별값이 없을 때 쓰는 생성 함수입니다.
func Normalise(book Book, newID func() (string, error)) (Book, error) {
	periods, err := normalisePeriods(book.Periods)
	if err != nil {
		return Book{}, err
	}
	book.Periods = periods
	count := len(periods)
	book.Rule.FirstStart = strings.TrimSpace(book.Rule.FirstStart)
	if book.Rule.PeriodCount < 0 || book.Rule.PeriodCount > MaxPeriods {
		book.Rule.PeriodCount = count
	}

	book.ActiveSchoolYear = strings.TrimSpace(book.ActiveSchoolYear)
	book.ActiveSemester = strings.TrimSpace(book.ActiveSemester)
	if book.ActiveSchoolYear != "" && !validYear(book.ActiveSchoolYear) {
		return Book{}, errors.New("학년도는 2026처럼 네 자리로 입력해 주세요")
	}
	if book.ActiveSemester != "" && !validSemester(book.ActiveSemester) {
		return Book{}, errors.New("학기는 1학기 또는 2학기만 고를 수 있습니다")
	}

	timetables := make([]Timetable, 0, len(book.Timetables))
	seenTables := map[string]bool{}
	for _, table := range book.Timetables {
		table.Kind = strings.TrimSpace(table.Kind)
		table.SchoolYear = strings.TrimSpace(table.SchoolYear)
		table.Semester = strings.TrimSpace(table.Semester)
		if table.Kind != KindTeacher && table.Kind != KindClass {
			return Book{}, errors.New("시간표 종류가 올바르지 않습니다")
		}
		if !validYear(table.SchoolYear) || !validSemester(table.Semester) {
			return Book{}, errors.New("시간표의 학년도·학기가 올바르지 않습니다")
		}
		table.ID = TimetableID(table.Kind, table.SchoolYear, table.Semester)
		if seenTables[table.ID] {
			return Book{}, errors.New("같은 학기의 같은 시간표가 두 번 들어 있습니다")
		}
		seenTables[table.ID] = true
		cells := make([]Cell, 0, len(table.Cells))
		seenCells := map[[2]int]bool{}
		for _, cell := range table.Cells {
			cell = normaliseCell(cell)
			if cell.empty() {
				continue
			}
			if cell.Day < 1 || cell.Day > Weekdays {
				return Book{}, errors.New("시간표 요일은 월~금만 쓸 수 있습니다")
			}
			if cell.Period < 1 || cell.Period > count {
				if count == 0 {
					return Book{}, errors.New("먼저 교시 시간을 설정해 주세요")
				}
				return Book{}, fmt.Errorf("%d교시는 교시 설정에 없습니다. 교시 수를 늘리거나 그 칸을 비워 주세요", cell.Period)
			}
			key := [2]int{cell.Day, cell.Period}
			if seenCells[key] {
				return Book{}, errors.New("같은 요일·교시에 두 수업이 들어 있습니다")
			}
			seenCells[key] = true
			cells = append(cells, cell)
		}
		sort.Slice(cells, func(i, j int) bool {
			if cells[i].Day != cells[j].Day {
				return cells[i].Day < cells[j].Day
			}
			return cells[i].Period < cells[j].Period
		})
		table.Cells = cells
		timetables = append(timetables, table)
	}
	sort.Slice(timetables, func(i, j int) bool { return timetables[i].ID < timetables[j].ID })
	book.Timetables = timetables

	if len(book.Changes) > maxChanges {
		return Book{}, fmt.Errorf("날짜별 변경은 %d개까지 저장할 수 있습니다. 지난 기록을 지워 주세요", maxChanges)
	}
	changes := make([]Change, 0, len(book.Changes))
	seenChanges := map[string]bool{}
	seenSlots := map[string]bool{}
	for _, change := range book.Changes {
		change.ID = strings.TrimSpace(change.ID)
		change.Date = strings.TrimSpace(change.Date)
		change.Kind = strings.TrimSpace(change.Kind)
		change.Target = strings.TrimSpace(change.Target)
		change.Subject = clip(change.Subject, maxShortText)
		change.ClassName = clip(change.ClassName, maxShortText)
		change.Room = clip(change.Room, maxShortText)
		change.Note = clip(change.Note, maxNoteText)
		change.CourseRosterID = clip(change.CourseRosterID, 80)
		if _, err := time.Parse("2006-01-02", change.Date); err != nil {
			return Book{}, errors.New("교체·보강 날짜가 올바르지 않습니다")
		}
		if change.Period < 1 || change.Period > count {
			return Book{}, fmt.Errorf("%s의 %d교시는 교시 설정에 없습니다", change.Date, change.Period)
		}
		validKind := false
		for _, kind := range ChangeKinds {
			validKind = validKind || kind == change.Kind
		}
		if !validKind {
			return Book{}, errors.New("변경 종류는 교체·보강·결강 중에서 골라 주세요")
		}
		if change.Target != KindTeacher && change.Target != KindClass {
			change.Target = KindTeacher
		}
		if change.Kind != "결강" && change.Subject == "" && change.ClassName == "" {
			return Book{}, fmt.Errorf("%s %d교시 %s에 과목이나 반을 적어 주세요", change.Date, change.Period, change.Kind)
		}
		slot := fmt.Sprintf("%s|%s|%d", change.Target, change.Date, change.Period)
		if seenSlots[slot] {
			return Book{}, fmt.Errorf("%s %d교시에 변경이 이미 있습니다. 기존 기록을 고쳐 주세요", change.Date, change.Period)
		}
		seenSlots[slot] = true
		if change.ID == "" || seenChanges[change.ID] {
			id, err := newID()
			if err != nil {
				return Book{}, err
			}
			change.ID = id
		}
		seenChanges[change.ID] = true
		changes = append(changes, change)
	}
	sort.SliceStable(changes, func(i, j int) bool {
		if changes[i].Date != changes[j].Date {
			return changes[i].Date < changes[j].Date
		}
		return changes[i].Period < changes[j].Period
	})
	book.Changes = changes
	return book, nil
}
