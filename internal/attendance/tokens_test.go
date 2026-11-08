package attendance

import (
	"testing"

	"TeacherNote/internal/students"
)

func TestAttendanceDateTokensSeparatesDate(t *testing.T) {
	values := AttendanceDateTokens("시작", "2026-10-19")
	if values["시작년"] != "2026" || values["시작월"] != "10" || values["시작일자"] != "19" {
		t.Fatalf("날짜 분리 치환자 값이 올바르지 않습니다: %#v", values)
	}
}

func TestAttendanceOutputStudentsReturnsEveryTarget(t *testing.T) {
	list := []students.Student{{ID: "a", Number: 1}, {ID: "b", Number: 2}, {ID: "c", Number: 3}}
	day := AttendanceDay{Entries: []AttendanceEntry{{StudentID: "a", Status: "결석"}, {StudentID: "b", Status: "출석"}, {StudentID: "c", Status: "지각"}}}
	targets := AttendanceOutputStudents(day, list)
	if len(targets) != 2 || targets[0].ID != "a" || targets[1].ID != "c" {
		t.Fatalf("출력 대상 전체를 반환하지 못했습니다: %#v", targets)
	}
}

