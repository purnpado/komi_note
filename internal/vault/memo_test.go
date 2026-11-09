package vault

import (
	"os"
	"path/filepath"
	"testing"
)

func TestMemo저장고치기완료보관삭제(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	memoItem, err := store.SaveMemoItem(MemoItem{Title: "회의 메모", Color: "노랑", Pinned: true, CreatedAt: "화면 값"})
	if err != nil {
		t.Fatal(err)
	}
	if memoItem.ID == "" || memoItem.CreatedAt == "화면 값" || memoItem.CreatedAt == "" {
		t.Fatalf("번호·만든 시각은 보관함이 정합니다: %+v", memoItem)
	}
	todo, err := store.SaveMemoItem(MemoItem{Kind: "할 일", Title: "가정통신문 회수", DueDate: "2026-11-10"})
	if err != nil {
		t.Fatal(err)
	}
	edited, err := store.SaveMemoItem(MemoItem{ID: todo.ID, Kind: "할 일", Title: "가정통신문 회수(2차)", Done: true, CreatedAt: "바꾸기"})
	if err != nil {
		t.Fatal(err)
	}
	if edited.CreatedAt != todo.CreatedAt || edited.DoneAt == "" {
		t.Fatalf("고쳐도 만든 시각 유지·완료 시각 채움: %+v", edited)
	}
	if _, err := store.SaveMemoItem(MemoItem{ID: "없음", Title: "x"}); err == nil {
		t.Fatal("없는 번호는 거부")
	}
	undone, _ := store.SetMemoDone(todo.ID, false)
	if undone.Done || undone.DoneAt != "" {
		t.Fatalf("완료 취소: %+v", undone)
	}
	if _, err := store.SetMemoDone(memoItem.ID, true); err == nil {
		t.Fatal("메모는 완료 표시 불가")
	}
	store.SetMemoDone(todo.ID, true)
	count, err := store.ArchiveDoneTodos()
	if err != nil || count != 1 {
		t.Fatalf("완료 할 일 보관 %d %v", count, err)
	}
	if _, err := store.ArchiveDoneTodos(); err == nil {
		t.Fatal("보관할 것이 없으면 안내")
	}
	archived, _ := store.SetMemoArchived(memoItem.ID, true)
	if !archived.Archived || archived.Pinned {
		t.Fatalf("보관하면 고정이 풀림: %+v", archived)
	}
	if err := store.DeleteMemoItem(todo.ID); err != nil {
		t.Fatal(err)
	}
	book, _ := store.GetMemoBook()
	if len(book.Items) != 1 || book.Items[0].ID != memoItem.ID {
		t.Fatalf("삭제 뒤 하나만: %+v", book.Items)
	}
}

func TestMemo쓰기실패면되돌린다(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	saved, err := store.SaveMemoItem(MemoItem{Title: "처음"})
	if err != nil {
		t.Fatal(err)
	}
	dataDir := filepath.Dir(store.filePath)
	if err := os.Chmod(dataDir, 0o500); err != nil {
		t.Skip("폴더 권한을 바꿀 수 없어 건너뜁니다")
	}
	defer os.Chmod(dataDir, 0o700)
	if _, err := store.SaveMemoItem(MemoItem{ID: saved.ID, Title: "실패할 수정"}); err == nil {
		t.Skip("이 환경에서는 쓰기 실패를 만들 수 없어 건너뜁니다")
	}
	book, _ := store.GetMemoBook()
	if len(book.Items) != 1 || book.Items[0].Title != "처음" {
		t.Fatalf("되돌리지 않았습니다: %+v", book.Items)
	}
}

func TestMemo잠긴보관함은거부(t *testing.T) {
	store := newTestVault(t, t.TempDir())
	store.Lock()
	if _, err := store.GetMemoBook(); err == nil {
		t.Fatal("잠긴 보관함은 읽을 수 없어야 합니다")
	}
}
