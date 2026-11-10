package vault

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// 출결 서식(HWPX) 등록 → 출결 저장 → 서류 만들기 → 백업 되살리기를 끝까지 확인한다.
// (2026-11-10 점검: 이 흐름을 검사하는 테스트가 없어 서류 만들기가 늘 실패하던 것이 드러나지 않았다.)

func writeTestHWPX(t *testing.T, path, section string) {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create("Contents/section0.xml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte(section)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
}

func hwpxSection(t *testing.T, data []byte) string {
	t.Helper()
	r, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("만든 서류가 HWPX(zip)가 아닙니다: %v", err)
	}
	for _, f := range r.File {
		if f.Name == "Contents/section0.xml" {
			s, err := f.Open()
			if err != nil {
				t.Fatal(err)
			}
			b, _ := io.ReadAll(s)
			s.Close()
			return string(b)
		}
	}
	t.Fatal("section0.xml이 없습니다")
	return ""
}

func TestAttendanceHWPXDocumentEndToEnd(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	student, err := store.AddStudent(Student{Number: 7, Name: "가온", BirthDate: "2013-01-01", TransferInDate: "2026-03-02",
		FatherName: "아빠", FatherPhone: "010-1111-1111", MotherName: "엄마", MotherPhone: "010-2222-2222"})
	if err != nil {
		t.Fatal(err)
	}
	for _, date := range []string{"2026-11-09", "2026-11-10"} {
		day, err := store.GetAttendance(date)
		if err != nil {
			t.Fatal(err)
		}
		day.Entries[0].Status, day.Entries[0].ReasonCategory, day.Entries[0].Reason = "결석", "질병", "독감 & 고열"
		if _, err := store.SaveAttendance(day); err != nil {
			t.Fatal(err)
		}
	}

	// 다른 형식은 등록하지 않는다
	pdf := filepath.Join(dir, "서식.pdf")
	if err := os.WriteFile(pdf, []byte("%PDF-1.4"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveAttendanceTemplate("PDF 서식", pdf, []string{"결석"}); err == nil {
		t.Fatal("PDF 서식은 등록되면 안 됩니다")
	}

	section := `<hp:t>{{이</hp:t><hp:t>름}}|{{번호}}|{{출결상태}}|{{사유구분}}|{{상세사유}}|` +
		`{{기준일}}|{{시작일}}|{{종료일}}|{{시작년}}.{{시작월}}.{{시작일자}}|({{결석일수}})일간|` +
		`{{보호자성명}}|{{보호자관계}}|{{보호자연락처}}|{{ 이름 }}|{{없는칸}}</hp:t>`
	path := filepath.Join(dir, "결석계.hwpx")
	writeTestHWPX(t, path, section)
	template, err := store.SaveAttendanceTemplate("결석계", path, []string{"결석"})
	if err != nil {
		t.Fatal(err)
	}

	result, err := store.BuildAttendanceHWPX(template.ID, student.ID, "2026-11-10")
	if err != nil {
		t.Fatalf("서류를 만들지 못했습니다: %v", err)
	}
	got := hwpxSection(t, result.Data)
	want := `<hp:t>가온|7|결석|질병|독감 &amp; 고열|` +
		`2026년 11월 10일|2026년 11월 9일|2026년 11월 10일|2026.11.9|(2)일간|` +
		`엄마|모|010-2222-2222|가온|{{없는칸}}</hp:t>`
	if got != want {
		t.Fatalf("치환 결과가 다릅니다\n 받은 값: %s\n 기대 값: %s", got, want)
	}
	if strings.Join(result.Unresolved, ",") != "없는칸" {
		t.Fatalf("채우지 못한 치환자 목록: %v", result.Unresolved)
	}

	// 지정 보호자가 '부'면 이름·관계·연락처 모두 부
	store.session.Students[0].DocumentGuardian = "부"
	result, err = store.BuildAttendanceHWPX(template.ID, student.ID, "2026-11-10")
	if err != nil {
		t.Fatal(err)
	}
	if got := hwpxSection(t, result.Data); !strings.Contains(got, "|아빠|부|010-1111-1111|") {
		t.Fatalf("지정 보호자(부)의 이름·관계·연락처가 함께 들어가야 합니다: %s", got)
	}

	// 백업에 서식 파일이 들어가 새 PC에서도 서류를 만들 수 있다
	backup := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(backup); err != nil {
		t.Fatal(err)
	}
	if err := os.RemoveAll(filepath.Join(dir, "data", "attendance-templates")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.RestoreBackup(backup, testMaster); err != nil {
		t.Fatal(err)
	}
	if _, err := store.BuildAttendanceHWPX(template.ID, student.ID, "2026-11-10"); err != nil {
		t.Fatalf("백업을 되살린 뒤에도 서식으로 서류를 만들 수 있어야 합니다: %v", err)
	}
}

// 학사 일정의 공휴일·휴업일은 출결 입력을 막고, 결석이 공휴일을 끼어도 한 기간으로 묶되 결석일수에서 뺀다.
func TestAttendanceHolidaysBlockInputAndSkipInPeriod(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	config := store.session.Config
	config.Holidays = []SchoolHoliday{{Date: "2026-10-09", Name: "한글날"}, {Date: "2026-10-09", Name: "중복"}, {Date: "2026-10-13", Name: ""}}
	if _, err := store.UpdateConfig(config); err != nil {
		t.Fatal(err)
	}
	if got := store.session.Config.Holidays; len(got) != 2 || got[1].Name != "휴업일" {
		t.Fatalf("공휴일 목록 정리(중복 제거·이름 기본값): %+v", got)
	}
	bad := store.session.Config
	bad.Holidays = append(bad.Holidays, SchoolHoliday{Date: "2026/10/20", Name: "잘못"})
	if _, err := store.UpdateConfig(bad); err == nil {
		t.Fatal("날짜 형식이 틀린 휴업일은 저장되면 안 됩니다")
	}
	student, err := store.AddStudent(Student{Number: 1, Name: "가온", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.GetAttendance("2026-10-09"); err == nil || !strings.Contains(err.Error(), "한글날") {
		t.Fatalf("공휴일 출결은 막고 이름을 알려야 합니다: %v", err)
	}
	// 10/8(목) 결석, 10/9(금 한글날), 10/12(월) 결석, 10/13(화 휴업일), 10/14(수) 결석
	for _, date := range []string{"2026-10-08", "2026-10-12", "2026-10-14"} {
		day, err := store.GetAttendance(date)
		if err != nil {
			t.Fatal(err)
		}
		day.Entries[0].Status, day.Entries[0].ReasonCategory = "결석", "질병"
		if _, err := store.SaveAttendance(day); err != nil {
			t.Fatal(err)
		}
	}
	period, err := store.GetAttendanceDocumentPeriod(student.ID, "2026-10-12")
	if err != nil {
		t.Fatal(err)
	}
	if period.StartDate != "2026-10-08" || period.EndDate != "2026-10-14" || period.SchoolDays != 3 {
		t.Fatalf("공휴일·휴업일을 건너뛴 한 기간(10/8~10/14, 3일)이어야 합니다: %+v", period)
	}
}

// 학적변동(전출)을 처리해도 처리일 전 출결 기록은 남고, 그날 출결 화면에 "(전출)" 줄로 보이며 다시 저장해도 유지된다.
func TestAttendanceKeepsDepartedStudentRecords(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	stay, err := store.AddStudent(Student{Number: 1, Name: "남는학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	leave, err := store.AddStudent(Student{Number: 2, Name: "전출학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	day, err := store.GetAttendance("2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	day.Entries[1].Status, day.Entries[1].ReasonCategory = "결석", "질병"
	if _, err := store.SaveAttendance(day); err != nil {
		t.Fatal(err)
	}
	if _, err := store.ProcessAcademicChange(leave.ID, "전출", "2026-11-10", "학적변동 처리"); err != nil {
		t.Fatal(err)
	}
	before, err := store.GetAttendance("2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	if len(before.Entries) != 2 || before.Entries[1].DepartedName != "전출학생" || before.Entries[1].DepartedNumber != 2 || before.Entries[1].Status != "결석" {
		t.Fatalf("전출 전 날짜에 전출 학생 기록이 남아 보여야 합니다: %+v", before.Entries)
	}
	if _, err := store.SaveAttendance(before); err != nil {
		t.Fatalf("전출 학생 줄이 있는 날을 다시 저장할 수 있어야 합니다: %v", err)
	}
	again, _ := store.GetAttendance("2026-11-09")
	if again.Entries[1].Status != "결석" {
		t.Fatalf("다시 저장해도 전출 학생 기록이 유지되어야 합니다: %+v", again.Entries)
	}
	after, err := store.GetAttendance("2026-11-10")
	if err != nil {
		t.Fatal(err)
	}
	if len(after.Entries) != 1 || after.Entries[0].StudentID != stay.ID {
		t.Fatalf("학적 처리일부터는 명단에서 빠져야 합니다: %+v", after.Entries)
	}
	if list, _ := store.ListStudentAttendance(leave.ID); len(list) != 1 {
		t.Fatalf("전출 학생 출결 기록이 보관되어 있어야 합니다: %d", len(list))
	}
}
