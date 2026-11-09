package main

import (
	"testing"

	"TeacherNote/internal/cleaning"
	"TeacherNote/internal/seating"
)

// 학급 운영(자리배정·청소)·모둠·학교생활기록 저장도 성공했을 때만 변경 알림을 보낸다.
func Test학급운영과기록저장은변경알림을보낸다(t *testing.T) {
	app := newUnlockedTestApp(t)
	student, err := app.AddStudent(Student{Number: 1, Name: "가온", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	sent := captureChanges(t)

	plan, err := app.SaveSeatingPlan(SeatingPlan{Title: "자리", Rows: 1, Columns: 1, Seats: []seating.SeatingSeat{{ID: "s1", Row: 1, Column: 1, Label: "1", StudentID: student.ID}}})
	if err != nil {
		t.Fatal(err)
	}
	// QR 회차가 쓰는 저장 통로도 알림을 보낸다(룰렛 결과·자리 바꾸기).
	if _, err := (notifyingSeatingStore{app.vault}).SaveSeatingPlan(plan); err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteSeatingPlan(plan.ID); err != nil {
		t.Fatal(err)
	}
	cleanPlan, err := app.SaveCleaningPlan(CleaningPlan{Title: "청소", PeriodType: "주간", Zones: []cleaning.CleaningZone{{ID: "z1", Name: "칠판"}}, Assignments: []cleaning.CleaningAssignment{{StudentID: student.ID, ZoneID: "z1"}}})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteCleaningPlan(cleanPlan.ID); err != nil {
		t.Fatal(err)
	}
	phrase, err := app.SaveRecordPhrase(RecordPhrase{Area: "subject", Text: "탐구 과정을 꼼꼼하게 기록함."})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteRecordPhrase(phrase.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveRecordLimits(map[string]int{"behavior": 1500}); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveGroupRules(GroupRules{SourceKind: "homeroom", SourceID: "homeroom", AvoidRepeat: true}); err != nil {
		t.Fatal(err)
	}
	// 실패한 저장·삭제는 알림이 없다.
	if err := app.DeleteSeatingPlan("없는-배치"); err == nil {
		t.Fatal("없는 배치 삭제는 오류")
	}
	if err := app.DeleteCleaningPlan("없는-청소"); err == nil {
		t.Fatal("없는 청소 삭제는 오류")
	}
	if err := app.DeleteGroupPlan("없는-모둠"); err == nil {
		t.Fatal("없는 모둠 삭제는 오류")
	}
	if err := app.DeleteRecordList("없는-명단", "명단 삭제"); err == nil {
		t.Fatal("없는 명단 삭제는 오류")
	}

	want := []sentChange{
		{eventSeatingChanged, ChangeNotice{Kind: changeAdded, ID: plan.ID}},
		{eventSeatingChanged, ChangeNotice{Kind: changeUpdated, ID: plan.ID}},
		{eventSeatingChanged, ChangeNotice{Kind: changeDeleted, ID: plan.ID}},
		{eventCleaningChanged, ChangeNotice{Kind: changeAdded, ID: cleanPlan.ID}},
		{eventCleaningChanged, ChangeNotice{Kind: changeDeleted, ID: cleanPlan.ID}},
		{eventRecordsChanged, ChangeNotice{Kind: changeAdded, ID: phrase.ID}},
		{eventRecordsChanged, ChangeNotice{Kind: changeDeleted, ID: phrase.ID}},
		{eventRecordsChanged, ChangeNotice{Kind: changeUpdated}},
		{eventGroupingChanged, ChangeNotice{Kind: changeUpdated, ID: "homeroom"}},
	}
	got := sent()
	if len(got) != len(want) {
		t.Fatalf("알림 수 %d, 원함 %d: %v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%d번째 알림 %v, 원함 %v", i, got[i], want[i])
		}
	}
}
