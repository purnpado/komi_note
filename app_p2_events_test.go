package main

import "testing"

func Test기존기능저장은변경알림을보낸다(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	student, err := app.AddStudent(Student{Number: 1, Name: "가온", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-11-09", Type: "학생 상담", Content: "내용"}); err != nil {
		t.Fatal(err)
	}
	day, _ := app.GetAttendance("2026-11-09")
	if _, err := app.SaveAttendance(day); err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteStudent("없는-학생", "학생 삭제"); err == nil {
		t.Fatal("없는 학생 삭제는 오류")
	}
	if _, err := app.SaveConsultation(Consultation{}); err == nil {
		t.Fatal("빈 상담은 오류")
	}
	names := []string{}
	for _, c := range sent() {
		names = append(names, c.Name)
	}
	want := []string{"students:변경", "consultation:변경", "attendance:변경"}
	if len(names) != len(want) {
		t.Fatalf("성공한 저장만 알림: %v", names)
	}
	for i := range want {
		if names[i] != want[i] {
			t.Fatalf("알림 %v", names)
		}
	}
	if sent()[0].Notice.ID != student.ID {
		t.Fatal("학생 번호만 담김")
	}
}
