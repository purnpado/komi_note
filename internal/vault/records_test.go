package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"TeacherNote/internal/records"
)

func sampleCourseEntry() RecordEntry {
	return RecordEntry{
		SchoolYear: "2026", Area: records.AreaSubject, TargetKind: records.TargetCourse, TargetID: "roster1",
		Subject: "과학", StudentKey: "1|가상", Text: "실험 보고서를 꼼꼼히 작성함.",
		Memos: []records.Memo{{Text: "3월 실험에서 측정값을 다시 확인함"}},
	}
}

func TestRecordEntrySaveUpdateReopenAndEncrypt(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	empty, err := store.GetRecordBook()
	if err != nil || len(empty.Entries) != 0 || empty.Lists == nil {
		t.Fatalf("예전 보관함 빈 기록 %+v %v", empty, err)
	}
	if empty.Limits[records.AreaBehavior] != 300 || empty.Limits[records.AreaCareer] != 700 {
		t.Fatalf("기본 한도 %+v", empty.Limits)
	}
	saved, err := store.SaveRecordEntry(sampleCourseEntry())
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == "" || saved.UpdatedAt == "" || len(saved.Memos) != 1 || saved.Memos[0].ID == "" || saved.Memos[0].CreatedAt == "" {
		t.Fatalf("저장 결과 %+v", saved)
	}
	// 같은 칸에 새 기록을 또 만들면 거부
	if _, err := store.SaveRecordEntry(sampleCourseEntry()); err == nil || !strings.Contains(err.Error(), "이미 있습니다") {
		t.Fatalf("같은 칸 중복 거부를 기대했지만 %v", err)
	}
	stale := saved
	saved.Text = "고친 문장."
	saved.Reviewed = true
	updated, err := store.SaveRecordEntry(saved)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveRecordEntry(stale); err == nil || !strings.Contains(err.Error(), "먼저 바뀌었습니다") {
		t.Fatalf("동시 수정 거부를 기대했지만 %v", err)
	}
	if updated.CreatedAt != saved.CreatedAt || !updated.Reviewed {
		t.Fatalf("고친 결과 %+v", updated)
	}
	// 문장을 비우면 검토 완료도 풀린다
	updated.Text = "   "
	cleared, err := store.SaveRecordEntry(updated)
	if err != nil || cleared.Reviewed {
		t.Fatalf("빈 문장 검토 상태 %+v %v", cleared, err)
	}
	cleared.Text = "다시 쓴 문장."
	if _, err := store.SaveRecordEntry(cleared); err != nil {
		t.Fatal(err)
	}

	raw, err := os.ReadFile(store.filePath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "가상") || strings.Contains(string(raw), "records") || strings.Contains(string(raw), "측정값") {
		t.Fatal("학교생활기록이 암호화되지 않았습니다")
	}
	reopened := &VaultStore{filePath: store.filePath}
	if _, err := reopened.Unlock(testMaster); err != nil {
		t.Fatal(err)
	}
	book, err := reopened.GetRecordBook()
	if err != nil || len(book.Entries) != 1 || book.Entries[0].Text != "다시 쓴 문장." || len(book.Entries[0].Memos) != 1 {
		t.Fatalf("다시 연 기록 %+v %v", book, err)
	}
	book.Entries[0].Memos[0].Text = "바뀜"
	again, _ := reopened.GetRecordBook()
	if again.Entries[0].Memos[0].Text == "바뀜" {
		t.Fatal("돌려준 값을 고쳐도 보관함 값은 그대로여야 합니다")
	}
	if err := reopened.DeleteRecordEntry(book.Entries[0].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := reopened.GetRecordBook()
	if len(after.Entries) != 0 {
		t.Fatalf("삭제 뒤 %+v", after.Entries)
	}
}

func TestRecordEntryRulesRejectWithoutChange(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	cases := map[string]RecordEntry{}
	behaviorOnCourse := sampleCourseEntry()
	behaviorOnCourse.Area = records.AreaBehavior
	cases["행동특성은 담임 학급만"] = behaviorOnCourse
	subjectOnHomeroom := sampleCourseEntry()
	subjectOnHomeroom.TargetKind = records.TargetHomeroom
	cases["교과세특은 수업 명렬만"] = subjectOnHomeroom
	noSubject := sampleCourseEntry()
	noSubject.Subject = " "
	cases["과목 없음"] = noSubject
	badYear := sampleCourseEntry()
	badYear.SchoolYear = "26"
	cases["학년도"] = badYear
	tooLong := sampleCourseEntry()
	tooLong.Text = strings.Repeat("가", 4001)
	cases["너무 긴 문장"] = tooLong
	homeroomUnknown := sampleCourseEntry()
	homeroomUnknown.Area = records.AreaBehavior
	homeroomUnknown.TargetKind = records.TargetHomeroom
	homeroomUnknown.StudentKey = "없는학생"
	cases["명렬에 없는 담임 학생"] = homeroomUnknown
	listUnknown := sampleCourseEntry()
	listUnknown.Area = records.AreaClub
	listUnknown.TargetKind = records.TargetList
	listUnknown.TargetID = "없는명단"
	cases["없는 활동 명단"] = listUnknown
	for name, entry := range cases {
		if _, err := store.SaveRecordEntry(entry); err == nil {
			t.Fatalf("%s: 거부해야 합니다", name)
		}
	}
	book, _ := store.GetRecordBook()
	if len(book.Entries) != 0 {
		t.Fatalf("거부 뒤 기록이 생겼습니다 %+v", book.Entries)
	}
}

func TestRecordListsAndHomeroomRemoval(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	student, err := store.AddStudent(Student{Number: 1, Name: "가상학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := store.AddStudent(Student{Number: 2, Name: "나상학생", BirthDate: "2013-02-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{student.ID, other.ID} {
		if _, err := store.SaveRecordEntry(RecordEntry{SchoolYear: "2026", Area: records.AreaBehavior, TargetKind: records.TargetHomeroom, StudentKey: id, Text: "성실함."}); err != nil {
			t.Fatal(err)
		}
	}
	// 학적변동 처리하면 그 학생 기록만 지워진다
	if _, err := store.ProcessAcademicChange(student.ID, "전출", "2026-10-08", "학적변동 처리"); err != nil {
		t.Fatal(err)
	}
	book, _ := store.GetRecordBook()
	if len(book.Entries) != 1 || book.Entries[0].StudentKey != other.ID {
		t.Fatalf("학적변동 뒤 기록 %+v", book.Entries)
	}

	// 활동 명단: 중복 학생 거부, 저장, 기록, 삭제 시 기록도 함께
	dup := RecordActivityList{SchoolYear: "2026", Name: "과학 동아리", Members: []records.Member{{Grade: "2", ClassName: "3", Number: "01", Name: "가상"}, {Grade: "2", ClassName: "3", Number: "1", Name: "가상"}}}
	if _, err := store.SaveRecordList(dup); err == nil {
		t.Fatal("같은 학생 두 번은 거부해야 합니다")
	}
	list, err := store.SaveRecordList(RecordActivityList{SchoolYear: "2026", Name: "과학 동아리", Members: []records.Member{{Grade: "2", ClassName: "3", Number: "01", Name: "가상"}, {Grade: "1", ClassName: "2", Number: "5", Name: "다상"}}})
	if err != nil {
		t.Fatal(err)
	}
	if list.Members[0].Key() != "2-3-1|가상" {
		t.Fatalf("명단 학생 값 %s", list.Members[0].Key())
	}
	if _, err := store.SaveRecordList(RecordActivityList{SchoolYear: "2026", Name: "과학 동아리"}); err == nil {
		t.Fatal("같은 이름 명단은 거부해야 합니다")
	}
	if _, err := store.SaveRecordEntry(RecordEntry{SchoolYear: "2026", Area: records.AreaClub, TargetKind: records.TargetList, TargetID: list.ID, StudentKey: list.Members[0].Key(), Text: "탐구함."}); err != nil {
		t.Fatal(err)
	}
	if err := store.DeleteRecordList(list.ID, "틀림"); err == nil {
		t.Fatal("확인 문구가 틀리면 거부해야 합니다")
	}
	if err := store.DeleteRecordList(list.ID, "활동 명단 삭제"); err != nil {
		t.Fatal(err)
	}
	book, _ = store.GetRecordBook()
	if len(book.Lists) != 0 || len(book.Entries) != 1 {
		t.Fatalf("명단 삭제 뒤 %+v", book)
	}

	// 학생 명렬 초기화는 담임 학급 기록을 모두 지운다
	if _, err := store.ResetStudents("학생 명렬 초기화"); err != nil {
		t.Fatal(err)
	}
	book, _ = store.GetRecordBook()
	if len(book.Entries) != 0 {
		t.Fatalf("명렬 초기화 뒤 %+v", book.Entries)
	}
}

func TestRecordLimitsYearDeleteAndBackup(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	if _, err := store.SaveRecordLimits(map[string]int{records.AreaBehavior: 20}); err == nil {
		t.Fatal("너무 작은 한도는 거부해야 합니다")
	}
	if _, err := store.SaveRecordLimits(map[string]int{"모름": 300}); err == nil {
		t.Fatal("모르는 영역은 거부해야 합니다")
	}
	limits, err := store.SaveRecordLimits(map[string]int{records.AreaBehavior: 500})
	if err != nil || limits[records.AreaBehavior] != 500 || limits[records.AreaSubject] != 500 {
		t.Fatalf("한도 저장 %+v %v", limits, err)
	}
	if _, err := store.SaveRecordEntry(sampleCourseEntry()); err != nil {
		t.Fatal(err)
	}
	old := sampleCourseEntry()
	old.SchoolYear = "2025"
	if _, err := store.SaveRecordEntry(old); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "백업.kkomi-backup")
	if err := store.ExportBackup(path); err != nil {
		t.Fatal(err)
	}
	_, _, data, err := readBackupWithPassword(path, testMaster)
	if err != nil {
		t.Fatal(err)
	}
	if data.Records == nil || len(data.Records.Entries) != 2 || data.Records.Limits[records.AreaBehavior] != 500 {
		t.Fatalf("백업에 학교생활기록이 없습니다 %+v", data.Records)
	}
	if _, err := store.DeleteRecordYear("2025", "아니오"); err == nil {
		t.Fatal("확인 문구가 틀리면 거부해야 합니다")
	}
	removed, err := store.DeleteRecordYear("2025", "학년도 기록 삭제")
	if err != nil || removed != 1 {
		t.Fatalf("학년도 삭제 %d %v", removed, err)
	}
	book, _ := store.GetRecordBook()
	if len(book.Entries) != 1 || book.Entries[0].SchoolYear != "2026" {
		t.Fatalf("학년도 삭제 뒤 %+v", book.Entries)
	}
}

func TestRecordPhrasesStoreWithoutStudentInfo(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	student, err := store.AddStudent(Student{Number: 1, Name: "홍길동", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveRecordEntry(RecordEntry{SchoolYear: "2026", Area: records.AreaBehavior, TargetKind: records.TargetHomeroom, StudentKey: student.ID, Text: "성실함."}); err != nil {
		t.Fatal(err)
	}
	// 3글자 학생 이름이 든 문장은 거부
	if _, err := store.SaveRecordPhrase(RecordPhrase{Text: "홍길동은 배려심이 깊음.", Area: records.AreaBehavior}); err == nil || !strings.Contains(err.Error(), "학생 이름") {
		t.Fatalf("이름 거부를 기대했지만 %v", err)
	}
	saved, err := store.SaveRecordPhrase(RecordPhrase{Text: "○○은 배려심이 깊음.", Area: records.AreaBehavior, Tags: []string{"#배려", "배려", " 협 업 "}})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Tags) != 2 || saved.Tags[0] != "배려" || saved.Tags[1] != "협업" {
		t.Fatalf("태그 정리 %+v", saved.Tags)
	}
	if _, err := store.SaveRecordPhrase(RecordPhrase{Text: "○○은 배려심이 깊음."}); err == nil {
		t.Fatal("같은 문장은 거부해야 합니다")
	}
	stale := saved
	saved.Tags = []string{"배려", "공감"}
	if _, err := store.SaveRecordPhrase(saved); err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveRecordPhrase(stale); err == nil {
		t.Fatal("동시 수정은 거부해야 합니다")
	}
	// 한꺼번에: 같은 문장은 건너뛰고, 하나라도 이름이 있으면 모두 거부
	if _, _, err := store.SaveRecordPhrases([]RecordPhrase{{Text: "탐구함."}, {Text: "홍길동이 발표함."}}); err == nil {
		t.Fatal("이름이 든 문장이 섞이면 모두 거부해야 합니다")
	}
	added, skipped, err := store.SaveRecordPhrases([]RecordPhrase{{Text: "탐구함.", Tags: []string{"탐구"}}, {Text: "○○은 배려심이 깊음."}, {Text: "탐구함."}})
	if err != nil || added != 1 || skipped != 2 {
		t.Fatalf("한꺼번에 %d %d %v", added, skipped, err)
	}
	// 학적변동·학년도 정리에도 보관 문장은 남는다
	if _, err := store.ProcessAcademicChange(student.ID, "전출", "2026-10-08", "학적변동 처리"); err != nil {
		t.Fatal(err)
	}
	if _, err := store.DeleteRecordYear("2026", "학년도 기록 삭제"); err != nil {
		t.Fatal(err)
	}
	reopened := &VaultStore{filePath: store.filePath}
	if _, err := reopened.Unlock(testMaster); err != nil {
		t.Fatal(err)
	}
	book, _ := reopened.GetRecordBook()
	if len(book.Phrases) != 2 || len(book.Entries) != 0 {
		t.Fatalf("다시 연 보관함 %+v", book)
	}
	raw, _ := os.ReadFile(store.filePath)
	if strings.Contains(string(raw), "배려심") {
		t.Fatal("보관 문장이 암호화되지 않았습니다")
	}
	if err := reopened.DeleteRecordPhrase(book.Phrases[0].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := reopened.GetRecordBook()
	if len(after.Phrases) != 1 {
		t.Fatalf("삭제 뒤 %+v", after.Phrases)
	}
}
