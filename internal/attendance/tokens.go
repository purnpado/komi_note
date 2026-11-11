package attendance

import (
	"regexp"
	"strings"
	"time"

	"TeacherNote/internal/students"
)

// AttendanceDateTokens는 학교별 HWPX 서식이 날짜 전체 또는 연·월·일 칸을
// 각각 사용할 수 있도록 같은 날짜의 치환자 값을 만듭니다.
// 예: prefix "기준" → {{기준}}·{{기준일}} "2026년 1월 5일", {{기준년}} "2026", {{기준월}} "1", {{기준일자}} "5".
// (2026-11-10: 화면 안내에 있던 {{기준일}} 형태도 채우고, 날짜 앞자리 0을 뺐다.)
func AttendanceDateTokens(prefix, value string) map[string]string {
	result := map[string]string{prefix: "", prefix + "일": "", prefix + "년": "", prefix + "월": "", prefix + "일자": ""}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return result
	}
	full := date.Format("2006년 1월 2일")
	result[prefix] = full
	result[prefix+"일"] = full
	result[prefix+"년"] = date.Format("2006")
	result[prefix+"월"] = date.Format("1")
	result[prefix+"일자"] = date.Format("2")
	return result
}

// AttendanceOutputStudents는 한 날짜에 서류 출력이 필요한 학생 전체를
// 번호순으로 반환합니다. 교외체험학습은 누계 관리만 하므로 서류 대상에서 제외합니다.
func AttendanceOutputStudents(day AttendanceDay, list []students.Student) []students.Student {
	byID := make(map[string]students.Student, len(list))
	for _, student := range list {
		byID[student.ID] = student
	}
	result := make([]students.Student, 0)
	for _, entry := range day.Entries {
		if entry.Status == "출석" || entry.Status == "교외체험학습" {
			continue
		}
		if student, found := byID[entry.StudentID]; found {
			result = append(result, student)
		}
	}
	return result
}

// AttendanceMarkTokens는 학교 서식의 체크 칸과 교시 칸용 치환자를 만듭니다(2026-11-10).
// {{질병표시}}·{{미인정표시}}·{{기타표시}}·{{출석인정표시}}: 사유 구분에 해당하면 "○", 아니면 빈칸.
// {{결석표시}}·{{지각표시}}·{{조퇴표시}}·{{결과표시}}: 출결 상태에 해당하면 "○".
// {{시작교시}}·{{종료교시}}: "1~2교시"·"3교시" 같은 교시 입력에서 나눈 숫자.
func AttendanceMarkTokens(entry AttendanceEntry) map[string]string {
	mark := func(ok bool) string {
		if ok {
			return "○"
		}
		return ""
	}
	reason := NormaliseReasonCategory(entry.ReasonCategory)
	status := strings.TrimSpace(entry.Status)
	start, end := splitPeriod(entry.Period)
	return map[string]string{
		"질병표시":   mark(reason == "질병"),
		"미인정표시":  mark(reason == "미인정"),
		"기타표시":   mark(reason == "기타"),
		"출석인정표시": mark(reason == "출석인정"),
		"결석표시":   mark(status == "결석"),
		"지각표시":   mark(status == "지각"),
		"조퇴표시":   mark(status == "조퇴"),
		"결과표시":   mark(status == "결과"),
		"시작교시":   start,
		"종료교시":   end,
	}
}

var periodNumbers = regexp.MustCompile(`\d+`)

// splitPeriod는 "1~2교시"·"1-2"·"3교시"에서 시작·끝 교시 숫자를 꺼냅니다(숫자가 하나면 시작=끝).
func splitPeriod(value string) (string, string) {
	numbers := periodNumbers.FindAllString(value, -1)
	switch len(numbers) {
	case 0:
		return "", ""
	case 1:
		return numbers[0], numbers[0]
	default:
		return numbers[0], numbers[len(numbers)-1]
	}
}
