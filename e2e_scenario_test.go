package main

import (
	"path/filepath"
	"testing"

	"TeacherNote/internal/assessment"
	"TeacherNote/internal/seating"
	"TeacherNote/internal/survey"
	"TeacherNote/internal/vault"
)

// TestE2E종합시나리오테스트는 최초 보관함 설정부터 학생, 출결, 자리, 설문, 서류, 청소 등록 및 잠금/해제까지 전체 라이프사이클을 실측 검증합니다.
func TestE2E종합시나리오테스트(t *testing.T) {
	tempDir := t.TempDir()
	vaultPath := filepath.Join(tempDir, "data", "vault.dat")
	recoveryPath := filepath.Join(tempDir, "backup_key", "복구키.teacher-recovery")

	vaultStore := vault.NewVaultStoreWithPaths(vaultPath, filepath.Join(tempDir, "backup_key"))
	events := assessment.NewAssessmentEventBus()
	app := &App{
		vault:            vaultStore,
		survey:           survey.NewSurveyServer(vaultStore),
		seating:          seating.NewSeatingServer(vaultStore),
		assessmentEvents: events,
		assessment:       assessment.NewAssessmentServer(vaultStore, events),
	}

	// 1. 초기 상태 검사: 보관함 설정 필요(NeedsSetup=true)
	state, err := app.GetAppState()
	if err != nil {
		t.Fatalf("초기 상태 확인 실패: %v", err)
	}
	if !state.NeedsSetup {
		t.Fatal("신규 보관함인데 설정 필요 상태가 아닙니다")
	}

	// 2. 마스터 비밀번호 및 초기 학급 설정
	masterPassword := "안전한테스트암호1234!"
	recoveryPassword := "안전한복구암호1234!"
	setupReq := SetupRequest{
		Config: ClassConfig{
			SchoolYear:             "2026",
			Grade:                  "2",
			ClassNumber:            "3",
			SchoolName:             "꼬미초등학교",
			TeacherRole:            "담임 교사",
			AutoLockMinutes:        10,
			ExperienceLearningUnit: "학년",
			Semester1StartDate:     "2026-03-02",
			Semester1EndDate:       "2026-07-20",
		},
		MasterPassword:   masterPassword,
		RecoveryPassword: recoveryPassword,
		RecoveryFilePath: recoveryPath,
	}

	sessionRes, err := app.InitializeVault(setupReq)
	if err != nil {
		t.Fatalf("보관함 초기화 실패: %v", err)
	}
	if sessionRes.Config.Grade != "2" || sessionRes.Config.ClassNumber != "3" {
		t.Fatalf("설정된 학급 정보 불일치: %+v", sessionRes.Config)
	}

	// 3. 학생 5명 등록
	studentsData := []Student{
		{Number: 1, Name: "김철수", Gender: "남", BirthDate: "2013-05-15", TransferInDate: "2026-03-02"},
		{Number: 2, Name: "이영희", Gender: "여", BirthDate: "2013-07-20", TransferInDate: "2026-03-02"},
		{Number: 3, Name: "박민수", Gender: "남", BirthDate: "2013-01-10", TransferInDate: "2026-03-02"},
		{Number: 4, Name: "정수진", Gender: "여", BirthDate: "2013-11-25", TransferInDate: "2026-03-02"},
		{Number: 5, Name: "최동훈", Gender: "남", BirthDate: "2013-09-08", TransferInDate: "2026-03-02"},
	}

	createdStudents := make([]Student, 0, len(studentsData))
	for _, std := range studentsData {
		saved, addErr := app.AddStudent(std)
		if addErr != nil {
			t.Fatalf("학생 등록 실패 (%s): %v", std.Name, addErr)
		}
		createdStudents = append(createdStudents, saved)
	}

	list, err := app.ListStudents()
	if err != nil || len(list) != 5 {
		t.Fatalf("등록된 학생 수 불일치: %d명 (기대값: 5명)", len(list))
	}

	// 4. 출결 입력 및 저장
	attendanceDay := AttendanceDay{
		Date: "2026-04-13",
		Entries: []AttendanceEntry{
			{StudentID: createdStudents[0].ID, Status: "출석"},
			{StudentID: createdStudents[1].ID, Status: "결석", ReasonCategory: "질병", Reason: "감기 몸살"},
			{StudentID: createdStudents[2].ID, Status: "출석"},
			{StudentID: createdStudents[3].ID, Status: "지각", ReasonCategory: "기타", Reason: "병원 진료"},
			{StudentID: createdStudents[4].ID, Status: "출석"},
		},
	}
	savedAtt, err := app.SaveAttendance(attendanceDay)
	if err != nil {
		t.Fatalf("출결 저장 실패: %v", err)
	}
	if savedAtt.Date != "2026-04-13" || len(savedAtt.Entries) != 5 {
		t.Fatalf("저장된 출결 데이터 불일치: %+v", savedAtt)
	}

	// 5. 자리배정 생성
	seatingPlan := SeatingPlan{
		Title:   "1분기 자리배정",
		Rows:    4,
		Columns: 6,
		Seats: []SeatingSeat{
			{ID: "s1", Row: 1, Column: 1, Label: "1분단 1열", StudentID: createdStudents[0].ID},
			{ID: "s2", Row: 1, Column: 2, Label: "1분단 2열", StudentID: createdStudents[1].ID},
		},
	}
	savedPlan, err := app.SaveSeatingPlan(seatingPlan)
	if err != nil {
		t.Fatalf("자리배정 저장 실패: %v", err)
	}
	if savedPlan.Title != "1분기 자리배정" {
		t.Fatalf("자리배정 제목 불일치: %s", savedPlan.Title)
	}

	// 6. 설문조사 생성
	surveyItem := Survey{
		Title:    "학급 임원 선거 설문",
		Audience: "학생",
		Scope:    "담임용",
		Questions: []SurveyQuestion{
			{Text: "가장 성실하게 봉사할 반장은 누구인가요?", Type: "단일 선택", Options: []string{"후보 1", "후보 2"}},
		},
	}
	savedSurvey, err := app.SaveSurvey(surveyItem)
	if err != nil {
		t.Fatalf("설문 저장 실패: %v", err)
	}
	if savedSurvey.Title != "학급 임원 선거 설문" {
		t.Fatalf("설문 제목 불일치: %s", savedSurvey.Title)
	}

	// 7. 제출서류 생성 및 제출 상태 업데이트
	subDoc := SubmissionDocument{
		Title:   "현장체험학습 참가 신청서",
		DueDate: "2026-04-20",
		Note:    "학부모 동의서 필수 지참",
	}
	savedDoc, err := app.SaveSubmissionDocument(subDoc)
	if err != nil {
		t.Fatalf("제출서류 항목 저장 실패: %v", err)
	}
	// 1번 학생 제출 완료 처리
	updatedDoc, err := app.SaveSubmissionStatus(savedDoc.ID, createdStudents[0].ID, "제출", "서명 확인 완료")
	if err != nil {
		t.Fatalf("제출 상태 저장 실패: %v", err)
	}
	if len(updatedDoc.Statuses) == 0 || updatedDoc.Statuses[0].Status != "제출" {
		t.Fatalf("제출 상태 갱신 불일치: %+v", updatedDoc.Statuses)
	}

	// 8. 청소 구역 배정
	cleaningPlan := CleaningPlan{
		Title:      "4월 3주차 청소 배정",
		PeriodType: "주간",
		Zones: []CleaningZone{
			{ID: "z1", Name: "칠판 및 교탁"},
			{ID: "z2", Name: "창문 및 복도"},
		},
		Assignments: []CleaningAssignment{
			{StudentID: createdStudents[0].ID, ZoneID: "z1"},
			{StudentID: createdStudents[1].ID, ZoneID: "z2"},
		},
	}
	savedClean, err := app.SaveCleaningPlan(cleaningPlan)
	if err != nil {
		t.Fatalf("청소 배정 저장 실패: %v", err)
	}
	if len(savedClean.Zones) != 2 {
		t.Fatalf("청소 구역 수 불일치: %d", len(savedClean.Zones))
	}

	// 9. 잠금(Lock) 테스트
	app.LockVault()
	lockedState, err := app.GetAppState()
	if err != nil || !lockedState.Locked {
		t.Fatal("보관함이 잠금 상태로 전환되지 않았습니다")
	}

	// 10. 잘못된 암호로 잠금 해제 시도 -> 반드시 실패해야 함
	_, err = app.UnlockVault("틀린비밀번호9999")
	if err == nil {
		t.Fatal("틀린 비밀번호인데 잠금 해제가 성공했습니다")
	}

	// 11. 올바른 마스터 암호로 잠금 해제 -> 완벽 복원 확인
	_, err = app.UnlockVault(masterPassword)
	if err != nil {
		t.Fatalf("올바른 마스터 암호로 잠금 해제 실패: %v", err)
	}
	recoveredStudents, err := app.ListStudents()
	if err != nil || len(recoveredStudents) != 5 {
		t.Fatalf("잠금 해제 후 복원된 학생 수 불일치: %d명", len(recoveredStudents))
	}

	// 12. 복원된 각 도메인 무결성 확인
	attRecord, err := app.GetAttendance("2026-04-13")
	if err != nil || len(attRecord.Entries) != 5 {
		t.Fatalf("복원된 출결 기록 오류: %v", err)
	}
	plans, err := app.ListSeatingPlans()
	if err != nil || len(plans) != 1 {
		t.Fatalf("복원된 자리배정 이력 오류: %v", err)
	}
	surveys, err := app.ListSurveys()
	if err != nil || len(surveys) != 1 {
		t.Fatalf("복원된 설문 이력 오류: %v", err)
	}
	docs, err := app.ListSubmissionDocuments()
	if err != nil || len(docs) != 1 {
		t.Fatalf("복원된 제출서류 이력 오류: %v", err)
	}
	cleaningList, err := app.ListCleaningPlans()
	if err != nil || len(cleaningList) != 1 {
		t.Fatalf("복원된 청소 배정 이력 오류: %v", err)
	}

	t.Logf("✅ 전체 E2E 종합 시나리오 테스트가 100%% 완벽하게 통과했습니다!")
}
