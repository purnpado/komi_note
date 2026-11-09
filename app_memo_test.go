package main

import "testing"

func Test메모바인딩은성공때만알림(t *testing.T) {
	app := newUnlockedTestApp(t)
	sent := captureChanges(t)
	if _, err := app.SaveMemoItem(MemoItem{}); err == nil {
		t.Fatal("빈 메모는 오류")
	}
	todo, err := app.SaveMemoItem(MemoItem{Kind: "할 일", Title: "학부모 회신"})
	if err != nil {
		t.Fatal(err)
	}
	app.SetMemoDone(todo.ID, true)
	app.ArchiveDoneTodos()
	app.DeleteMemoItem(todo.ID)
	app.DeleteMemoItem("없는-번호")
	kinds := []string{}
	for _, change := range sent() {
		if change.Name != "memo:변경" {
			t.Fatalf("이름: %s", change.Name)
		}
		kinds = append(kinds, change.Notice.Kind)
	}
	want := []string{"추가", "완료", "보관", "삭제"}
	if len(kinds) != len(want) {
		t.Fatalf("알림 %v", kinds)
	}
	for i := range want {
		if kinds[i] != want[i] {
			t.Fatalf("알림 순서 %v", kinds)
		}
	}
	if sent()[0].Notice.ID != todo.ID {
		t.Fatal("알림에 번호")
	}
}
