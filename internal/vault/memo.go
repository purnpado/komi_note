package vault

import (
	"errors"
	"sort"
	"time"

	"TeacherNote/internal/memo"
)

// MemoItem은 메모 또는 할 일 하나입니다.
type MemoItem = memo.Item

// MemoBook은 메모·할 일 전체입니다.
type MemoBook = memo.Book

func copyMemoItems(items []memo.Item) []memo.Item {
	result := make([]memo.Item, len(items))
	for i, item := range items {
		result[i] = item
		result[i].Tags = append([]string{}, item.Tags...)
	}
	return result
}

func nowLocal() string { return time.Now().In(time.Local).Format(time.RFC3339) }

// GetMemoBook은 메모·할 일을 최근 고친 순으로 돌려줍니다.
func (s *VaultStore) GetMemoBook() (MemoBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return MemoBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Memo == nil {
		return MemoBook{Items: []memo.Item{}}, nil
	}
	items := copyMemoItems(s.session.Memo.Items)
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return MemoBook{Items: items}, nil
}

// changeMemoLocked는 메모 목록을 바꾸고 저장합니다. 저장에 실패하면 원래대로 되돌립니다.
func (s *VaultStore) changeMemoLocked(change func(items []memo.Item) ([]memo.Item, error)) error {
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	previous := s.session.Memo
	current := []memo.Item{}
	if previous != nil {
		current = copyMemoItems(previous.Items)
	}
	next, err := change(current)
	if err != nil {
		return err
	}
	previousUpdated := s.session.UpdatedAt
	s.session.Memo = &memo.Book{Items: next}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Memo = previous
		s.session.UpdatedAt = previousUpdated
		return err
	}
	return nil
}

func memoIndex(items []memo.Item, id string) int {
	for i := range items {
		if items[i].ID == id {
			return i
		}
	}
	return -1
}

// SaveMemoItem은 메모·할 일을 새로 만들거나 고칩니다. 만든 시각·완료 시각은 화면 값 대신 보관함이 정합니다.
func (s *VaultStore) SaveMemoItem(item MemoItem) (MemoItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	normalized, err := memo.Normalize(item)
	if err != nil {
		return MemoItem{}, err
	}
	var saved memo.Item
	err = s.changeMemoLocked(func(items []memo.Item) ([]memo.Item, error) {
		now := nowLocal()
		normalized.UpdatedAt = now
		index := memoIndex(items, normalized.ID)
		if normalized.ID == "" || index < 0 {
			if normalized.ID != "" {
				return nil, errors.New("고칠 메모를 찾지 못했습니다. 화면을 다시 열어 주세요")
			}
			if len(items) >= memo.MaxItems {
				return nil, errors.New("메모·할 일은 3000개까지 둘 수 있습니다. 보관하거나 지운 뒤 다시 시도해 주세요")
			}
			id, err := newStudentID()
			if err != nil {
				return nil, err
			}
			normalized.ID, normalized.CreatedAt = id, now
			if normalized.Done {
				normalized.DoneAt = now
			}
			saved = normalized
			return append(items, normalized), nil
		}
		previous := items[index]
		normalized.CreatedAt = previous.CreatedAt
		normalized.DoneAt = previous.DoneAt
		if normalized.Done && !previous.Done {
			normalized.DoneAt = now
		}
		if !normalized.Done {
			normalized.DoneAt = ""
		}
		items[index] = normalized
		saved = normalized
		return items, nil
	})
	return saved, err
}

// SetMemoDone은 할 일 완료를 켜고 끕니다(대시보드 체크용).
func (s *VaultStore) SetMemoDone(id string, done bool) (MemoItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var saved memo.Item
	err := s.changeMemoLocked(func(items []memo.Item) ([]memo.Item, error) {
		index := memoIndex(items, id)
		if index < 0 {
			return nil, errors.New("할 일을 찾지 못했습니다")
		}
		if items[index].Kind != memo.KindTodo {
			return nil, errors.New("메모는 완료로 표시하지 않습니다")
		}
		now := nowLocal()
		items[index].Done = done
		items[index].DoneAt = ""
		if done {
			items[index].DoneAt = now
		}
		items[index].UpdatedAt = now
		saved = items[index]
		return items, nil
	})
	return saved, err
}

// SetMemoArchived는 항목을 보관함으로 옮기거나 꺼냅니다.
func (s *VaultStore) SetMemoArchived(id string, archived bool) (MemoItem, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var saved memo.Item
	err := s.changeMemoLocked(func(items []memo.Item) ([]memo.Item, error) {
		index := memoIndex(items, id)
		if index < 0 {
			return nil, errors.New("항목을 찾지 못했습니다")
		}
		items[index].Archived = archived
		if archived {
			items[index].Pinned = false
		}
		items[index].UpdatedAt = nowLocal()
		saved = items[index]
		return items, nil
	})
	return saved, err
}

// ArchiveDoneTodos는 완료한 할 일을 한꺼번에 보관하고 옮긴 개수를 돌려줍니다.
func (s *VaultStore) ArchiveDoneTodos() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	count := 0
	err := s.changeMemoLocked(func(items []memo.Item) ([]memo.Item, error) {
		now := nowLocal()
		for i := range items {
			if items[i].Kind == memo.KindTodo && items[i].Done && !items[i].Archived {
				items[i].Archived, items[i].Pinned, items[i].UpdatedAt = true, false, now
				count++
			}
		}
		if count == 0 {
			return nil, errors.New("보관할 완료 할 일이 없습니다")
		}
		return items, nil
	})
	return count, err
}

// DeleteMemoItem은 항목을 지웁니다.
func (s *VaultStore) DeleteMemoItem(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.changeMemoLocked(func(items []memo.Item) ([]memo.Item, error) {
		index := memoIndex(items, id)
		if index < 0 {
			return nil, errors.New("항목을 찾지 못했습니다")
		}
		return append(items[:index], items[index+1:]...), nil
	})
}
