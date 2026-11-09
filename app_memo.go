package main

// 메모·할 일 바인딩. 저장에 성공하면 memo:변경 알림(종류·번호만)을 보냅니다.

import "TeacherNote/internal/vault"

type MemoItem = vault.MemoItem
type MemoBook = vault.MemoBook

func memoID(item MemoItem) string { return item.ID }

// GetMemoBook은 메모·할 일 전체를 돌려줍니다.
func (a *App) GetMemoBook() (MemoBook, error) { return a.vault.GetMemoBook() }

// SaveMemoItem은 메모·할 일을 만들거나 고칩니다.
func (a *App) SaveMemoItem(item MemoItem) (MemoItem, error) {
	kind := changeUpdated
	if item.ID == "" {
		kind = changeAdded
	}
	saved, err := a.vault.SaveMemoItem(item)
	return notifyAfter(eventMemoChanged, kind, memoID, saved, err)
}

// SetMemoDone은 할 일 완료를 켜고 끕니다.
func (a *App) SetMemoDone(id string, done bool) (MemoItem, error) {
	saved, err := a.vault.SetMemoDone(id, done)
	return notifyAfter(eventMemoChanged, changeDone, memoID, saved, err)
}

// SetMemoArchived는 항목을 보관하거나 꺼냅니다.
func (a *App) SetMemoArchived(id string, archived bool) (MemoItem, error) {
	saved, err := a.vault.SetMemoArchived(id, archived)
	return notifyAfter(eventMemoChanged, changeArchived, memoID, saved, err)
}

// ArchiveDoneTodos는 완료한 할 일을 한꺼번에 보관합니다.
func (a *App) ArchiveDoneTodos() (int, error) {
	count, err := a.vault.ArchiveDoneTodos()
	return notifyAfter(eventMemoChanged, changeArchived, nil, count, err)
}

// DeleteMemoItem은 항목을 지웁니다.
func (a *App) DeleteMemoItem(id string) error {
	if err := a.vault.DeleteMemoItem(id); err != nil {
		return err
	}
	notifyChange(eventMemoChanged, changeDeleted, id)
	return nil
}
