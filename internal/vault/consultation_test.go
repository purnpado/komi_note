package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func consultationStore(t *testing.T) (*VaultStore, Student) {
	t.Helper()
	store := newTestVault(t, t.TempDir())
	student, err := store.AddStudent(Student{Number: 1, Name: "가상학생", BirthDate: "2013-01-01", TransferInDate: "2026-03-02"})
	if err != nil {
		t.Fatal(err)
	}
	return store, student
}

func TestConsultationFollowUpFlowAndManualDone(t *testing.T) {
	store, student := consultationStore(t)
	root, err := store.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-11-02", Type: "학생 상담", Content: "교우 관계", FollowUpDate: "2026-11-12"})
	if err != nil {
		t.Fatal(err)
	}
	if root.FollowUpDone {
		t.Fatal("새 기록은 미완료여야 합니다")
	}
	// 후속 기록: 날짜·유형·새 예정일을 넣을 수 있고, 앞 기록은 완료가 된다
	child, err := store.SaveConsultation(Consultation{StudentID: student.ID, ParentID: root.ID, Date: "2026-11-05", Type: "보호자 통화", Content: "통화함", FollowUpDate: "2026-11-20"})
	if err != nil {
		t.Fatal(err)
	}
	if child.RootID != root.ID || child.Type != "보호자 통화" || child.FollowUpDate != "2026-11-20" {
		t.Fatalf("후속 기록 %+v", child)
	}
	items, _ := store.ListConsultations(student.ID)
	byID := map[string]Consultation{}
	for _, item := range items {
		byID[item.ID] = item
	}
	if !byID[root.ID].FollowUpDone || byID[child.ID].FollowUpDone {
		t.Fatalf("완료 상태 %+v", items)
	}
	// 후속 기록을 고쳐 보내도 화면이 보낸 완료 값은 무시한다
	edited := byID[root.ID]
	edited.FollowUpDone = false
	edited.Content = "교우 관계(수정)"
	saved, err := store.SaveConsultation(edited)
	if err != nil || !saved.FollowUpDone {
		t.Fatalf("수정 뒤 완료 유지 %+v %v", saved, err)
	}
	// 직접 확인 완료 → 후속 기록을 지워도 유지
	if _, err := store.SetConsultationFollowUpDone(child.ID, true); err != nil {
		t.Fatal(err)
	}
	grand, err := store.SaveConsultation(Consultation{StudentID: student.ID, ParentID: child.ID, Date: "2026-11-21", Type: "조치 결과", Content: "해결"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.DeleteConsultation(grand.ID); err != nil {
		t.Fatal(err)
	}
	items, _ = store.ListConsultations(student.ID)
	for _, item := range items {
		if item.ID == child.ID && (!item.FollowUpDone || !item.ManualDone) {
			t.Fatalf("직접 완료가 풀렸습니다 %+v", item)
		}
	}
	// 완료 취소
	undone, err := store.SetConsultationFollowUpDone(child.ID, false)
	if err != nil || undone.FollowUpDone {
		t.Fatalf("완료 취소 %+v %v", undone, err)
	}
	// 예정일 없는 기록은 직접 완료 불가
	if _, err := store.SetConsultationFollowUpDone(grand.ID, true); err == nil {
		t.Fatal("지운 기록은 찾지 못해야 합니다")
	}
}

func TestConsultationValidationAndOrdering(t *testing.T) {
	store, student := consultationStore(t)
	bad := []Consultation{
		{StudentID: student.ID, Date: "2026-11-05", Type: "학생 상담", Content: "내용", FollowUpDate: "2026-11-01"},
		{StudentID: student.ID, Date: "2026-11-05", Type: "학생 상담", Content: strings.Repeat("가", 5001)},
		{StudentID: student.ID, Date: "2026-11-05", Type: strings.Repeat("유", 21), Content: "내용"},
		{StudentID: student.ID, Date: "2026-11-05", Type: "학생 상담", Content: "내용", ParentID: "없음"},
	}
	for index, item := range bad {
		if _, err := store.SaveConsultation(item); err == nil {
			t.Fatalf("%d번째: 거부해야 합니다", index)
		}
	}
	first, _ := store.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-11-05", Type: "학생 상담", Content: "먼저"})
	second, _ := store.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-11-05", Type: "학생 상담", Content: "나중"})
	// 같은 날짜는 작성 시각 순(나중에 쓴 것이 먼저). 작성 시각이 초 단위라 같을 수 있어 직접 다르게 둔다.
	store.mu.Lock()
	for i := range store.session.Consultations {
		if store.session.Consultations[i].ID == first.ID {
			store.session.Consultations[i].RecordedAt = "2026-11-05T09:00:00+09:00"
		}
		if store.session.Consultations[i].ID == second.ID {
			store.session.Consultations[i].RecordedAt = "2026-11-05T10:00:00+09:00"
		}
	}
	store.mu.Unlock()
	for round := 0; round < 5; round++ {
		items, _ := store.ListAllConsultations()
		if len(items) != 2 || items[0].ID != second.ID {
			t.Fatalf("같은 날짜 정렬 %+v", items)
		}
	}
}

func TestConsultationRollsBackWhenWriteFails(t *testing.T) {
	store, student := consultationStore(t)
	root, err := store.SaveConsultation(Consultation{StudentID: student.ID, Date: "2026-11-02", Type: "학생 상담", Content: "처음", FollowUpDate: "2026-11-09"})
	if err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Dir(store.filePath)
	if err := os.Chmod(dataDir, 0o500); err != nil {
		t.Skip("폴더 권한을 바꿀 수 없어 건너뜁니다")
	}
	defer os.Chmod(dataDir, 0o700)
	if _, err := store.SaveConsultation(Consultation{StudentID: student.ID, ParentID: root.ID, Date: "2026-11-03", Type: "교사 확인", Content: "실패할 후속"}); err == nil {
		t.Skip("이 환경에서는 쓰기 실패를 만들 수 없어 건너뜁니다")
	}
	items, _ := store.ListConsultations(student.ID)
	if len(items) != 1 || items[0].FollowUpDone {
		t.Fatalf("저장 실패 뒤 되돌리지 않았습니다 %+v", items)
	}
	if _, err := store.DeleteConsultation(root.ID); err == nil {
		t.Fatal("쓰기 실패면 삭제도 실패해야 합니다")
	}
	items, _ = store.ListConsultations(student.ID)
	if len(items) != 1 {
		t.Fatalf("삭제 실패 뒤 되돌리지 않았습니다 %+v", items)
	}
}
