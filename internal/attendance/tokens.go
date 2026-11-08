package attendance

import (
	"strings"
	"time"

	"TeacherNote/internal/students"
)

// AttendanceDateTokens는 학교별 HWPX 서식이 날짜 전체 또는 연·월·일 칸을
// 각각 사용할 수 있도록 같은 날짜의 치환자 값을 만듭니다.
func AttendanceDateTokens(prefix, value string) map[string]string {
	result := map[string]string{prefix: "", prefix + "년": "", prefix + "월": "", prefix + "일자": ""}
	date, err := time.Parse("2006-01-02", strings.TrimSpace(value))
	if err != nil {
		return result
	}
	result[prefix] = date.Format("2006년 01월 02일")
	result[prefix+"년"] = date.Format("2006")
	result[prefix+"월"] = date.Format("01")
	result[prefix+"일자"] = date.Format("02")
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

