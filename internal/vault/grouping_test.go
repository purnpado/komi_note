package vault

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"TeacherNote/internal/grouping"
)

func sampleGroupPlan() GroupPlan {
	return GroupPlan{
		Title: "실험 모둠", SourceKind: grouping.SourceCourse, SourceID: "roster1", SourceLabel: "2-3",
		Groups: []grouping.Group{
			{Name: "1모둠", Members: []grouping.Member{{Key: "1|가상", Number: "1", Name: "가상"}, {Key: "2|나상", Number: "2", Name: "나상"}}},
			{Name: "2모둠", Members: []grouping.Member{{Key: "3|다상", Number: "3", Name: "다상"}}},
		},
	}
}

func TestGroupingSaveUpdateDeleteAndReopen(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	empty, err := store.GetGroupingBook()
	if err != nil || len(empty.Plans) != 0 || empty.Rules == nil {
		t.Fatalf("예전 보관함 빈 모둠 %+v %v", empty, err)
	}
	saved, err := store.SaveGroupPlan(sampleGroupPlan())
	if err != nil {
		t.Fatal(err)
	}
	if saved.ID == "" || saved.CreatedAt == "" || saved.UpdatedAt == "" {
		t.Fatalf("저장 결과 %+v", saved)
	}
	if _, err := store.SaveGroupRules(GroupRules{SourceKind: grouping.SourceCourse, SourceID: "roster1", Separate: []grouping.Pair{{A: "1|가상", B: "3|다상"}}, AvoidRepeat: true}); err != nil {
		t.Fatal(err)
	}

	// 고치기: 받은 updatedAt으로는 성공, 예전 값으로는 거부
	stale := saved
	saved.Groups[1].Members[0].Role = "모둠장"
	updated, err := store.SaveGroupPlan(saved)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.SaveGroupPlan(stale); err == nil || !strings.Contains(err.Error(), "먼저 바뀌었습니다") {
		t.Fatalf("동시 수정 거부를 기대했지만 %v", err)
	}
	if updated.CreatedAt != saved.CreatedAt {
		t.Fatal("고쳐도 만든 시각은 그대로여야 합니다")
	}

	raw, err := os.ReadFile(store.filePath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "가상") || strings.Contains(string(raw), "grouping") {
		t.Fatal("모둠 자료가 암호화되지 않았습니다")
	}

	reopened := &VaultStore{filePath: store.filePath}
	if _, err := reopened.Unlock(testMaster); err != nil {
		t.Fatal(err)
	}
	book, err := reopened.GetGroupingBook()
	if err != nil {
		t.Fatal(err)
	}
	if len(book.Plans) != 1 || book.Plans[0].Groups[1].Members[0].Role != "모둠장" || len(book.Rules) != 1 || !book.Rules[0].AvoidRepeat {
		t.Fatalf("다시 연 모둠 %+v", book)
	}
	book.Plans[0].Groups[0].Name = "바뀜"
	again, _ := reopened.GetGroupingBook()
	if again.Plans[0].Groups[0].Name != "1모둠" {
		t.Fatal("돌려준 값을 고쳐도 보관함 값은 그대로여야 합니다")
	}

	if err := reopened.DeleteGroupPlan(book.Plans[0].ID); err != nil {
		t.Fatal(err)
	}
	after, _ := reopened.GetGroupingBook()
	if len(after.Plans) != 0 || len(after.Rules) != 1 {
		t.Fatalf("삭제 뒤 %+v", after)
	}
}

func TestGroupingRejectsInvalidWithoutChange(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	bad := sampleGroupPlan()
	bad.Groups[1].Members = append(bad.Groups[1].Members, grouping.Member{Key: "1|가상", Number: "1", Name: "가상"})
	if _, err := store.SaveGroupPlan(bad); err == nil {
		t.Fatal("한 학생이 두 모둠에 있으면 거부해야 합니다")
	}
	missing := sampleGroupPlan()
	missing.ID = "없는값"
	if _, err := store.SaveGroupPlan(missing); err == nil {
		t.Fatal("없는 이력 고치기는 거부해야 합니다")
	}
	book, _ := store.GetGroupingBook()
	if len(book.Plans) != 0 {
		t.Fatalf("거부 뒤 이력이 생겼습니다 %+v", book.Plans)
	}
}

func TestGroupingIncludedInBackup(t *testing.T) {
	dir := t.TempDir()
	store := newTestVault(t, dir)
	if _, err := store.SaveGroupPlan(sampleGroupPlan()); err != nil {
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
	if data.Grouping == nil || len(data.Grouping.Plans) != 1 {
		t.Fatalf("백업에 모둠이 없습니다 %+v", data.Grouping)
	}
}
