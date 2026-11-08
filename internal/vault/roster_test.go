package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xuri/excelize/v2"
)

func Test만나이계산은생일전후를구분한다(t *testing.T) {
	birth := time.Date(2012, 10, 8, 0, 0, 0, 0, time.Local)
	if age := fullAge(birth, time.Date(2026, 10, 7, 0, 0, 0, 0, time.Local)); age != 13 {
		t.Fatalf("생일 전 만 나이는 13세여야 합니다: %d", age)
	}
	if age := fullAge(birth, time.Date(2026, 10, 8, 0, 0, 0, 0, time.Local)); age != 14 {
		t.Fatalf("생일 당일 만 나이는 14세여야 합니다: %d", age)
	}
}

func Test나이스생년월일마지막점을인식한다(t *testing.T) {
	date, err := parseBirthDate("2012.10.08.")
	if err != nil || date != "2012-10-08" {
		t.Fatalf("나이스 생년월일 변환 실패: %q, %v", date, err)
	}
}

func Test나이스성별남성과여성을인식한다(t *testing.T) {
	if value := normaliseGender("남성"); value != "남성" {
		t.Fatalf("남성 표기 변환 실패: %q", value)
	}
	if value := normaliseGender("여성"); value != "여성" {
		t.Fatalf("여성 표기 변환 실패: %q", value)
	}
	if value := normaliseGender("여"); value != "여성" {
		t.Fatalf("기존 여성 축약 표기 호환 실패: %q", value)
	}
}

func Test명렬표가져오기는연락처를유지한다(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "가상명렬표.xlsx")
	workbook := excelize.NewFile()
	sheet := workbook.GetSheetName(0)
	if err := workbook.SetSheetRow(sheet, "A1", &[]any{"학년", "반", "번호", "성명", "성별", "생년월일", "주소"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SetSheetRow(sheet, "A2", &[]any{"2", "3", 1, "가온", "여성", "2012-10-08", "가상시 가온로 1"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SaveAs(path); err != nil {
		t.Fatal(err)
	}
	store := &VaultStore{filePath: filepath.Join(directory, "vault.dat")}
	_, err := store.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	result, err := store.ImportRoster(path)
	if err != nil || result.Added != 1 {
		t.Fatalf("첫 가져오기 실패: %+v, %v", result, err)
	}
	students, err := store.ListStudents()
	if err != nil {
		t.Fatal(err)
	}
	students[0].StudentPhone = "010-1234-5678"
	if _, err := store.SaveStudent(students[0]); err != nil {
		t.Fatal(err)
	}
	result, err = store.ImportRoster(path)
	if err != nil || result.Updated != 1 {
		t.Fatalf("다시 가져오기 실패: %+v, %v", result, err)
	}
	students, err = store.ListStudents()
	if err != nil {
		t.Fatal(err)
	}
	if students[0].StudentPhone != "010-1234-5678" {
		t.Fatal("명렬표를 다시 가져올 때 직접 입력한 연락처가 사라졌습니다")
	}
}

func Test빈학급도빈목록과통계를반환한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "vault.dat")}
	_, err := store.Initialize(SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")})
	if err != nil {
		t.Fatal(err)
	}
	students, err := store.ListStudents()
	if err != nil || students == nil || len(students) != 0 {
		t.Fatalf("빈 학생 목록 처리 실패: %#v, %v", students, err)
	}
	stats, err := store.GetStudentStats("2026-10-07")
	if err != nil || stats.GenderCounts == nil || stats.AgeGroups == nil {
		t.Fatalf("빈 통계 처리 실패: %#v, %v", stats, err)
	}
}

func Test경고없는명렬표미리보기도빈경고목록을반환한다(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "명렬표.xlsx")
	workbook := excelize.NewFile()
	sheet := workbook.GetSheetName(0)
	if err := workbook.SetSheetRow(sheet, "A1", &[]any{"학년", "반", "번호", "성명", "성별", "생년월일", "주소"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SetSheetRow(sheet, "A2", &[]any{"2", "3", 1, "가온", "여성", "2012-10-08", "가상시 가온로 1"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SaveAs(path); err != nil {
		t.Fatal(err)
	}
	preview, err := readRoster(path, ClassConfig{Grade: "2", ClassNumber: "3"})
	if err != nil || preview.Headers == nil || preview.Students == nil || preview.Warnings == nil || len(preview.Warnings) != 0 {
		t.Fatalf("경고 없는 미리보기 처리 실패: %#v, %v", preview, err)
	}
}

func Test한글경로에서보관함과명렬표를처리한다(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "한글 폴더", "담임노트 자료")
	vaultPath := filepath.Join(directory, "data", "vault.dat")
	rosterPath := filepath.Join(directory, "나이스 명렬표.xlsx")
	recoveryPath := filepath.Join(directory, "복구 자료", "복구키.teacher-recovery")
	store := &VaultStore{filePath: vaultPath}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: recoveryPath}
	if _, err := store.Initialize(request); err != nil {
		t.Fatalf("한글 경로 보관함 초기화 실패: %v", err)
	}
	workbook := excelize.NewFile()
	sheet := workbook.GetSheetName(0)
	if err := workbook.SetSheetRow(sheet, "A1", &[]any{"학년", "반", "번호", "성명", "성별", "생년월일", "주소"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SetSheetRow(sheet, "A2", &[]any{"2", "3", 1, "가온", "여성", "2012-10-08", "가상시 가온로 1"}); err != nil {
		t.Fatal(err)
	}
	if err := workbook.SaveAs(rosterPath); err != nil {
		t.Fatalf("한글 경로 명렬표 저장 실패: %v", err)
	}
	if _, err := store.ImportRoster(rosterPath); err != nil {
		t.Fatalf("한글 경로 명렬표 가져오기 실패: %v", err)
	}
	store.Lock()
	if _, err := store.Unlock(request.MasterPassword); err != nil {
		t.Fatalf("한글 경로 보관함 잠금 해제 실패: %v", err)
	}
	students, err := store.ListStudents()
	if err != nil || len(students) != 1 || students[0].Name != "가온" {
		t.Fatalf("한글 경로 학생 확인 실패: %#v, %v", students, err)
	}
}

func Test학생사진과상담기록을암호화저장한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가온"}}
	if err := store.writeCurrentVaultLocked(); err != nil {
		t.Fatal(err)
	}
	photoPath := filepath.Join(directory, "사진.png")
	if err := os.WriteFile(photoPath, []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveStudentPhoto("student-one", photoPath); err != nil {
		t.Fatalf("사진 저장 실패: %v", err)
	}
	photo, err := store.GetStudentPhoto("student-one")
	if err != nil || !strings.HasPrefix(photo, "data:image/png;base64,") {
		t.Fatalf("사진 읽기 실패: %q, %v", photo, err)
	}
	if _, err := store.SaveConsultation(Consultation{StudentID: "student-one", Date: "2026-10-07", Type: "학생 상담", Content: "상담 내용"}); err != nil {
		t.Fatalf("상담 저장 실패: %v", err)
	}
	items, err := store.ListConsultations("student-one")
	if err != nil || len(items) != 1 || items[0].Content != "상담 내용" {
		t.Fatalf("상담 목록 실패: %#v, %v", items, err)
	}
}

func Test상담후속기록은부모상담에연결된다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가온"}}
	root, err := store.SaveConsultation(Consultation{StudentID: "student-one", Date: "2026-10-07", Type: "학생 상담", Content: "첫 상담", FollowUpDate: "2026-10-10"})
	if err != nil {
		t.Fatalf("첫 상담 저장 실패: %v", err)
	}
	followUp, err := store.SaveConsultation(Consultation{StudentID: "student-one", ParentID: root.ID, Date: "2026-10-10", Type: "보호자 통화", Content: "후속 연락"})
	if err != nil {
		t.Fatalf("후속 기록 저장 실패: %v", err)
	}
	if followUp.RootID != root.ID || followUp.ParentID != root.ID {
		t.Fatalf("후속 기록 연결 실패: %#v", followUp)
	}
	items, err := store.ListConsultations("student-one")
	if err != nil || len(items) != 2 {
		t.Fatalf("상담 흐름 목록 실패: %#v, %v", items, err)
	}
	var savedRoot Consultation
	for _, item := range items {
		if item.ID == root.ID {
			savedRoot = item
		}
	}
	if !savedRoot.FollowUpDone {
		t.Fatal("후속 기록 저장 뒤 부모 상담이 완료 처리되지 않았습니다")
	}
}

func Test학생명렬초기화는연결기록을삭제한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가온"}}
	store.session.Consultations = []Consultation{{ID: "consult-one", StudentID: "student-one", Date: "2026-10-07", Type: "학생 상담", Content: "내용"}}
	store.session.Surveys = []Survey{{ID: "survey-one", Responses: []SurveyResponse{{StudentID: "student-one", RespondentName: "가온"}}}}
	store.session.SeatingPlans = []SeatingPlan{{ID: "plan-one", FixedStudentIDs: []string{"student-one"}, Seats: []SeatingSeat{{ID: "seat-1", StudentID: "student-one"}}}}
	store.session.SubmissionDocuments = []SubmissionDocument{{ID: "doc-one", Statuses: []SubmissionStatus{{StudentID: "student-one", Status: "제출"}}}}
	if err := store.writeCurrentVaultLocked(); err != nil {
		t.Fatal(err)
	}
	count, err := store.ResetStudents("학생 명렬 초기화")
	if err != nil || count != 1 {
		t.Fatalf("학생 명렬 초기화 실패: %d, %v", count, err)
	}
	if len(store.session.Students) != 0 || len(store.session.Consultations) != 0 {
		t.Fatal("학생 또는 상담 기록이 남아 있습니다")
	}
	if response := store.session.Surveys[0].Responses[0]; response.StudentID != "" || response.RespondentName != "" {
		t.Fatalf("초기화 뒤 설문 식별자가 남아 있습니다: %#v", response)
	}
	if store.session.SeatingPlans[0].Seats[0].StudentID != "" || len(store.session.SeatingPlans[0].FixedStudentIDs) != 0 || len(store.session.SubmissionDocuments[0].Statuses) != 0 {
		t.Fatal("초기화 뒤 자리배정 또는 제출서류 참조가 남아 있습니다")
	}
	if _, err := store.ResetStudents("잘못된 확인"); err == nil {
		t.Fatal("잘못된 확인 문구로 초기화했습니다")
	}
}

func Test학생직접추가와개별삭제는연결기록을처리한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	student, err := store.AddStudent(Student{Number: 1, Name: "전입생", Gender: "남성", BirthDate: "2012-03-01", TransferInDate: "2026-10-08"})
	if err != nil || student.ID == "" {
		t.Fatalf("학생 직접 추가 실패: %#v, %v", student, err)
	}
	if _, err := store.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-10-07", Type: "학생 상담", Content: "전입 상담"}); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteStudent(student.ID, "학생 삭제"); err != nil {
		t.Fatalf("학생 개별 삭제 실패: %v", err)
	}
	if len(store.session.Students) != 0 || len(store.session.Consultations) != 0 {
		t.Fatal("삭제한 학생의 정보 또는 상담 기록이 남아 있습니다")
	}
	if err := store.DeleteStudent(student.ID, "잘못된 확인"); err == nil {
		t.Fatal("잘못된 확인 문구로 개별 삭제했습니다")
	}
}

func Test학생삭제는간접식별자를정리한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가온"}, {ID: "student-two", Number: 2, Name: "나온"}}
	store.session.Surveys = []Survey{{ID: "survey-one", Responses: []SurveyResponse{{StudentID: "student-one", RespondentName: "가온", Answers: map[string]string{"q1": "좋음"}}, {StudentID: "student-two", RespondentName: "나온"}}}}
	store.session.SeatingPlans = []SeatingPlan{{ID: "plan-one", FixedStudentIDs: []string{"student-one", "student-two"}, Seats: []SeatingSeat{{ID: "seat-1", StudentID: "student-one"}, {ID: "seat-2", StudentID: "student-two"}}}}
	store.session.SubmissionDocuments = []SubmissionDocument{{ID: "doc-one", Statuses: []SubmissionStatus{{StudentID: "student-one", Status: "제출"}, {StudentID: "student-two", Status: "미제출"}}}}
	if err := store.writeCurrentVaultLocked(); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteStudent("student-one", "학생 삭제"); err != nil {
		t.Fatalf("학생 삭제 실패: %v", err)
	}
	response := store.session.Surveys[0].Responses[0]
	if response.StudentID != "" || response.RespondentName != "" || response.Answers["q1"] != "좋음" {
		t.Fatalf("설문 응답은 답변을 보존하고 식별자만 익명화해야 합니다: %#v", response)
	}
	plan := store.session.SeatingPlans[0]
	if plan.Seats[0].StudentID != "" || len(plan.FixedStudentIDs) != 1 || plan.FixedStudentIDs[0] != "student-two" {
		t.Fatalf("자리배정 참조 정리가 올바르지 않습니다: %#v", plan)
	}
	if statuses := store.session.SubmissionDocuments[0].Statuses; len(statuses) != 1 || statuses[0].StudentID != "student-two" {
		t.Fatalf("제출서류 참조 정리가 올바르지 않습니다: %#v", statuses)
	}
}

func Test학적변동은개인정보를삭제하고최소이력만남긴다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	store.session.Students = []Student{{ID: "student-one", Number: 1, Name: "가온", Gender: "여성", BirthDate: "2012-10-08", Address: "가상시", StudentPhone: "010-1234-5678"}}
	store.session.Consultations = []Consultation{{ID: "consult-one", StudentID: "student-one", Date: "2026-10-07", Type: "학생 상담", Content: "내용"}}
	store.session.Surveys = []Survey{{ID: "survey-one", Responses: []SurveyResponse{{StudentID: "student-one", RespondentName: "가온"}}}}
	store.session.SeatingPlans = []SeatingPlan{{ID: "plan-one", FixedStudentIDs: []string{"student-one"}, Seats: []SeatingSeat{{ID: "seat-1", StudentID: "student-one"}}}}
	store.session.SubmissionDocuments = []SubmissionDocument{{ID: "doc-one", Statuses: []SubmissionStatus{{StudentID: "student-one", Status: "제출"}}}}
	if err := store.writeCurrentVaultLocked(); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ProcessAcademicChange("student-one", "전출", "2026-10-08", "잘못된 확인"); err == nil {
		t.Fatal("잘못된 확인 문구로 학적변동을 처리했습니다")
	}
	change, err := store.ProcessAcademicChange("student-one", "전출", "2026-10-08", "학적변동 처리")
	if err != nil {
		t.Fatalf("학적변동 처리 실패: %v", err)
	}
	if change.Name != "가온" || change.Status != "전출" || change.ProcessedDate != "2026-10-08" {
		t.Fatalf("최소 학적변동 이력 오류: %#v", change)
	}
	students, err := store.ListStudents()
	if err != nil || len(students) != 0 {
		t.Fatalf("처리 후 재학생 목록에 학생이 남아 있습니다: %#v, %v", students, err)
	}
	changes, err := store.ListAcademicChanges()
	if err != nil || len(changes) != 1 || changes[0].Name != "가온" {
		t.Fatalf("학적변동 최소 이력 확인 실패: %#v, %v", changes, err)
	}
	if len(store.session.Consultations) != 0 {
		t.Fatal("학적변동 학생의 상담 기록이 남아 있습니다")
	}
	if response := store.session.Surveys[0].Responses[0]; response.StudentID != "" || response.RespondentName != "" {
		t.Fatalf("학적변동 뒤 설문 식별자가 남아 있습니다: %#v", response)
	}
	if store.session.SeatingPlans[0].Seats[0].StudentID != "" || len(store.session.SeatingPlans[0].FixedStudentIDs) != 0 || len(store.session.SubmissionDocuments[0].Statuses) != 0 {
		t.Fatal("학적변동 뒤 자리배정 또는 제출서류 참조가 남아 있습니다")
	}
}

func Test학생전입일형식을검사한다(t *testing.T) {
	directory := t.TempDir()
	store := &VaultStore{filePath: filepath.Join(directory, "data", "vault.dat")}
	request := SetupRequest{Config: ClassConfig{SchoolYear: "2026", Grade: "2", ClassNumber: "3", AutoLockMinutes: 5}, MasterPassword: "안전한마스터암호1234", RecoveryPassword: "안전한복구암호1234", RecoveryFilePath: filepath.Join(directory, "복구.teacher-recovery")}
	if _, err := store.Initialize(request); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AddStudent(Student{Number: 1, Name: "전입생", TransferInDate: "2026.10.08"}); err == nil {
		t.Fatal("잘못된 전입일 형식을 허용했습니다")
	}
	student, err := store.AddStudent(Student{Number: 1, Name: "전입생", TransferInDate: "2026-10-08"})
	if err != nil || student.TransferInDate != "2026-10-08" {
		t.Fatalf("전입일 저장 실패: %#v, %v", student, err)
	}
}
