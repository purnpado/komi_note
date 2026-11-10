package attendance

import (
	"sort"
	"strings"
	"time"
)

// SchoolHoliday는 학사 일정의 공휴일·학교 휴업일 하루입니다(2026-11-10).
// 이 날은 출결을 입력하지 않고, 결석일수·연속 기간 계산에서도 수업일로 세지 않습니다.
type SchoolHoliday struct {
	Date string `json:"date"`
	Name string `json:"name"`
}

const maxSchoolHolidays = 300

// NormaliseHolidays는 날짜 형식이 맞는 것만 남기고 날짜순으로 정리합니다(같은 날짜는 처음 것만).
// 날짜 형식이 틀린 항목이 있으면 ok=false를 돌려줍니다.
func NormaliseHolidays(list []SchoolHoliday) (result []SchoolHoliday, ok bool) {
	ok = true
	seen := map[string]bool{}
	for _, item := range list {
		date := strings.TrimSpace(item.Date)
		if _, err := time.Parse("2006-01-02", date); err != nil {
			ok = false
			continue
		}
		if seen[date] {
			continue
		}
		seen[date] = true
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = "휴업일"
		}
		if len([]rune(name)) > 30 {
			name = string([]rune(name)[:30])
		}
		result = append(result, SchoolHoliday{Date: date, Name: name})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	if len(result) > maxSchoolHolidays {
		result = result[:maxSchoolHolidays]
	}
	return result, ok
}

// HolidaySet은 날짜 → 이름 표를 만듭니다.
func HolidaySet(list []SchoolHoliday) map[string]string {
	set := make(map[string]string, len(list))
	for _, item := range list {
		set[strings.TrimSpace(item.Date)] = strings.TrimSpace(item.Name)
	}
	return set
}

func isSchoolDay(day time.Time, holidays map[string]string) bool {
	if day.Weekday() == time.Saturday || day.Weekday() == time.Sunday {
		return false
	}
	_, holiday := holidays[day.Format("2006-01-02")]
	return !holiday
}

// SchoolDayCount는 시작일부터 종료일까지 주말·공휴일·휴업일을 뺀 수업일 수입니다.
func SchoolDayCount(start, end time.Time, holidays map[string]string) int {
	count := 0
	for day := start; !day.After(end); day = day.AddDate(0, 0, 1) {
		if isSchoolDay(day, holidays) {
			count++
		}
	}
	return count
}

// PreviousSchoolDay는 주말·공휴일·휴업일을 건너뛴 이전 수업일입니다.
func PreviousSchoolDay(value time.Time, holidays map[string]string) time.Time {
	value = value.AddDate(0, 0, -1)
	for i := 0; i < 400 && !isSchoolDay(value, holidays); i++ {
		value = value.AddDate(0, 0, -1)
	}
	return value
}

// NextSchoolDay는 주말·공휴일·휴업일을 건너뛴 다음 수업일입니다.
func NextSchoolDay(value time.Time, holidays map[string]string) time.Time {
	value = value.AddDate(0, 0, 1)
	for i := 0; i < 400 && !isSchoolDay(value, holidays); i++ {
		value = value.AddDate(0, 0, 1)
	}
	return value
}
