package vault

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"TeacherNote/internal/records"
)

// RecordBook은 학교생활기록(관찰 메모·기재 문장·활동 명단·글자 수 한도) 전체입니다.
type RecordBook = records.Book

// RecordEntry는 한 학생의 한 영역 기록입니다.
type RecordEntry = records.Entry

// RecordActivityList는 동아리 등 교사가 직접 만든 활동 명단입니다.
type RecordActivityList = records.ActivityList

// RecordPhrase는 학생 정보 없이 보관하는 특기사항 문장입니다.
type RecordPhrase = records.Phrase

func copyRecordPhrase(phrase records.Phrase) records.Phrase {
	phrase.Tags = append([]string{}, phrase.Tags...)
	return phrase
}

func copyRecordEntry(entry records.Entry) records.Entry {
	entry.Memos = append([]records.Memo{}, entry.Memos...)
	return entry
}

func copyRecordList(list records.ActivityList) records.ActivityList {
	list.Members = append([]records.Member{}, list.Members...)
	return list
}

func snapshotRecords(book *records.Book) *records.Book {
	if book == nil {
		return nil
	}
	copied := &records.Book{
		Entries: make([]records.Entry, len(book.Entries)),
		Lists:   make([]records.ActivityList, len(book.Lists)),
		Limits:  map[string]int{},
		Phrases: make([]records.Phrase, len(book.Phrases)),
	}
	for index, phrase := range book.Phrases {
		copied.Phrases[index] = copyRecordPhrase(phrase)
	}
	for index, entry := range book.Entries {
		copied.Entries[index] = copyRecordEntry(entry)
	}
	for index, list := range book.Lists {
		copied.Lists[index] = copyRecordList(list)
	}
	for area, value := range book.Limits {
		copied.Limits[area] = value
	}
	return copied
}

func (s *VaultStore) recordsLocked() *records.Book {
	if s.session.Records == nil {
		s.session.Records = &records.Book{Entries: []records.Entry{}, Lists: []records.ActivityList{}, Limits: map[string]int{}}
	}
	if s.session.Records.Limits == nil {
		s.session.Records.Limits = map[string]int{}
	}
	return s.session.Records
}

// commitRecordsLocked는 바뀐 학교생활기록을 저장하고, 실패하면 이전 상태로 되돌립니다.
func (s *VaultStore) commitRecordsLocked(previous *records.Book) error {
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Records = previous
		return err
	}
	return nil
}

func recordNow() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// GetRecordBook은 학교생활기록 전체를 돌려줍니다. 글자 수 한도는 기본값으로 채워 돌려줍니다.
func (s *VaultStore) GetRecordBook() (RecordBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RecordBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	result := RecordBook{Entries: []records.Entry{}, Lists: []records.ActivityList{}, Phrases: []records.Phrase{}}
	stored := map[string]int{}
	if s.session.Records != nil {
		copied := snapshotRecords(s.session.Records)
		result.Entries = copied.Entries
		result.Lists = copied.Lists
		result.Phrases = copied.Phrases
		stored = copied.Limits
	}
	limits, err := records.NormaliseLimits(stored)
	if err != nil {
		limits, _ = records.NormaliseLimits(nil)
	}
	result.Limits = limits
	return result, nil
}

// SaveRecordEntry는 기록을 새로 만들거나(ID 없음) 고칩니다.
// 고칠 때 화면이 읽은 updatedAt과 다르면 덮어쓰지 않습니다. 같은 학생·같은 영역 칸에는 기록이 하나만 있습니다.
func (s *VaultStore) SaveRecordEntry(entry RecordEntry) (RecordEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RecordEntry{}, errors.New("먼저 보관함을 열어 주세요")
	}
	now := recordNow()
	normalised, err := records.NormaliseEntry(entry, newStudentID, now)
	if err != nil {
		return RecordEntry{}, err
	}
	if normalised.TargetKind == records.TargetHomeroom {
		if _, index := findStudent(s.session.Students, normalised.StudentKey); index < 0 {
			return RecordEntry{}, errors.New("학생 명렬에서 이 학생을 찾지 못했습니다. 명렬을 다시 열어 주세요")
		}
	}
	if normalised.TargetKind == records.TargetList && s.findRecordListLocked(normalised.TargetID) < 0 {
		return RecordEntry{}, errors.New("활동 명단을 찾지 못했습니다. 목록을 다시 열어 주세요")
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	index := -1
	if normalised.ID != "" {
		for i := range book.Entries {
			if book.Entries[i].ID == normalised.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return RecordEntry{}, errors.New("고칠 기록을 찾지 못했습니다. 화면을 다시 열어 주세요")
		}
		if book.Entries[index].UpdatedAt != entry.UpdatedAt {
			return RecordEntry{}, errors.New("다른 화면에서 이 기록이 먼저 바뀌었습니다. 학교생활기록을 다시 열고 고쳐 주세요")
		}
	}
	for i := range book.Entries {
		if i != index && records.SameSlot(book.Entries[i], normalised) {
			return RecordEntry{}, errors.New("이 학생의 같은 영역 기록이 이미 있습니다. 학교생활기록을 다시 열어 주세요")
		}
	}
	normalised.UpdatedAt = now
	if index >= 0 {
		normalised.CreatedAt = book.Entries[index].CreatedAt
		book.Entries[index] = normalised
	} else {
		id, err := newStudentID()
		if err != nil {
			return RecordEntry{}, err
		}
		normalised.ID = id
		normalised.CreatedAt = now
		if err := records.CheckEntryCount(len(book.Entries) + 1); err != nil {
			return RecordEntry{}, err
		}
		book.Entries = append(book.Entries, normalised)
	}
	if err := s.commitRecordsLocked(previous); err != nil {
		return RecordEntry{}, err
	}
	return copyRecordEntry(normalised), nil
}

// DeleteRecordEntry는 기록 하나(관찰 메모·기재 문장)를 지웁니다.
func (s *VaultStore) DeleteRecordEntry(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Records == nil {
		return errors.New("지울 기록을 찾지 못했습니다")
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	kept := make([]records.Entry, 0, len(book.Entries))
	found := false
	for _, entry := range book.Entries {
		if entry.ID == id {
			found = true
			continue
		}
		kept = append(kept, entry)
	}
	if !found {
		return errors.New("지울 기록을 찾지 못했습니다")
	}
	book.Entries = kept
	return s.commitRecordsLocked(previous)
}

func (s *VaultStore) findRecordListLocked(id string) int {
	if s.session.Records == nil {
		return -1
	}
	for index, list := range s.session.Records.Lists {
		if list.ID == id {
			return index
		}
	}
	return -1
}

// SaveRecordList는 활동 명단을 새로 만들거나(ID 없음) 고칩니다.
// 명단에서 빠진 학생의 기록은 지우지 않고 "명단에 없는 학생"으로 남깁니다.
func (s *VaultStore) SaveRecordList(list RecordActivityList) (RecordActivityList, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RecordActivityList{}, errors.New("먼저 보관함을 열어 주세요")
	}
	normalised, err := records.NormaliseList(list)
	if err != nil {
		return RecordActivityList{}, err
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	now := recordNow()
	index := -1
	if normalised.ID != "" {
		index = s.findRecordListLocked(normalised.ID)
		if index < 0 {
			return RecordActivityList{}, errors.New("고칠 활동 명단을 찾지 못했습니다. 목록을 다시 열어 주세요")
		}
		if book.Lists[index].UpdatedAt != list.UpdatedAt {
			return RecordActivityList{}, errors.New("다른 화면에서 이 활동 명단이 먼저 바뀌었습니다. 다시 열고 고쳐 주세요")
		}
	}
	for i, other := range book.Lists {
		if i != index && other.SchoolYear == normalised.SchoolYear && other.Name == normalised.Name {
			return RecordActivityList{}, errors.New("같은 학년도에 같은 이름의 활동 명단이 이미 있습니다")
		}
	}
	normalised.UpdatedAt = now
	if index >= 0 {
		normalised.CreatedAt = book.Lists[index].CreatedAt
		book.Lists[index] = normalised
	} else {
		id, err := newStudentID()
		if err != nil {
			return RecordActivityList{}, err
		}
		normalised.ID = id
		normalised.CreatedAt = now
		if err := records.CheckListCount(len(book.Lists) + 1); err != nil {
			return RecordActivityList{}, err
		}
		book.Lists = append(book.Lists, normalised)
	}
	if err := s.commitRecordsLocked(previous); err != nil {
		return RecordActivityList{}, err
	}
	return copyRecordList(normalised), nil
}

// DeleteRecordList는 활동 명단과 그 명단으로 쓴 기록을 함께 지웁니다.
func (s *VaultStore) DeleteRecordList(id, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "활동 명단 삭제" {
		return errors.New("확인 문구가 일치하지 않습니다")
	}
	index := s.findRecordListLocked(id)
	if index < 0 {
		return errors.New("지울 활동 명단을 찾지 못했습니다")
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	book.Lists = append(book.Lists[:index], book.Lists[index+1:]...)
	kept := make([]records.Entry, 0, len(book.Entries))
	for _, entry := range book.Entries {
		if entry.TargetKind == records.TargetList && entry.TargetID == id {
			continue
		}
		kept = append(kept, entry)
	}
	book.Entries = kept
	return s.commitRecordsLocked(previous)
}

// SaveRecordLimits는 영역별 글자 수 한도를 저장합니다.
func (s *VaultStore) SaveRecordLimits(limits map[string]int) (map[string]int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	normalised, err := records.NormaliseLimits(limits)
	if err != nil {
		return nil, err
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	book.Limits = normalised
	if err := s.commitRecordsLocked(previous); err != nil {
		return nil, err
	}
	copied := map[string]int{}
	for area, value := range normalised {
		copied[area] = value
	}
	return copied, nil
}

// DeleteRecordYear는 한 학년도의 기록과 활동 명단을 한꺼번에 지우고, 지운 기록 수를 돌려줍니다.
func (s *VaultStore) DeleteRecordYear(schoolYear, confirmation string) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return 0, errors.New("먼저 보관함을 열어 주세요")
	}
	if strings.TrimSpace(confirmation) != "학년도 기록 삭제" {
		return 0, errors.New("확인 문구가 일치하지 않습니다")
	}
	schoolYear = strings.TrimSpace(schoolYear)
	if s.session.Records == nil {
		return 0, nil
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	kept := make([]records.Entry, 0, len(book.Entries))
	removed := 0
	for _, entry := range book.Entries {
		if entry.SchoolYear == schoolYear {
			removed++
			continue
		}
		kept = append(kept, entry)
	}
	lists := make([]records.ActivityList, 0, len(book.Lists))
	for _, list := range book.Lists {
		if list.SchoolYear != schoolYear {
			lists = append(lists, list)
		}
	}
	book.Entries = kept
	book.Lists = lists
	if err := s.commitRecordsLocked(previous); err != nil {
		return 0, err
	}
	return removed, nil
}

// removeStudentRecords는 담임 학급 학생이 삭제·학적변동될 때 그 학생의 학교생활기록을 지웁니다.
// 호출자는 반드시 VaultStore 잠금을 잡은 상태여야 합니다.
func removeStudentRecords(data *vaultData, studentID string) {
	if data.Records == nil {
		return
	}
	kept := make([]records.Entry, 0, len(data.Records.Entries))
	for _, entry := range data.Records.Entries {
		if entry.TargetKind == records.TargetHomeroom && entry.StudentKey == studentID {
			continue
		}
		kept = append(kept, entry)
	}
	data.Records.Entries = kept
}

// knownStudentNamesLocked는 보관함에 있는 학생 이름(담임 학급·수업 명렬·활동 명단)을 모읍니다.
// 문장 보관함에 이름이 섞여 들어가지 않게 검사할 때 씁니다. 호출자는 잠금을 잡고 있어야 합니다.
func (s *VaultStore) knownStudentNamesLocked() []string {
	seen := map[string]bool{}
	names := []string{}
	add := func(name string) {
		name = strings.TrimSpace(name)
		if name != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	for _, student := range s.session.Students {
		add(student.Name)
	}
	for _, roster := range s.session.CourseRosters {
		for _, student := range roster.Students {
			add(student.Name)
		}
	}
	if s.session.Records != nil {
		for _, list := range s.session.Records.Lists {
			for _, member := range list.Members {
				add(member.Name)
			}
		}
	}
	return names
}

// SaveRecordPhrase는 문장 보관함에 문장을 새로 넣거나(ID 없음) 고칩니다.
// 학생 정보는 저장하지 않으며, 3글자 이상 학생 이름이 든 문장과 이미 있는 같은 문장은 거부합니다.
func (s *VaultStore) SaveRecordPhrase(phrase RecordPhrase) (RecordPhrase, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RecordPhrase{}, errors.New("먼저 보관함을 열어 주세요")
	}
	normalised, err := records.NormalisePhrase(phrase, s.knownStudentNamesLocked())
	if err != nil {
		return RecordPhrase{}, err
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	now := recordNow()
	index := -1
	if normalised.ID != "" {
		for i := range book.Phrases {
			if book.Phrases[i].ID == normalised.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return RecordPhrase{}, errors.New("고칠 보관 문장을 찾지 못했습니다. 보관함을 다시 열어 주세요")
		}
		if book.Phrases[index].UpdatedAt != phrase.UpdatedAt {
			return RecordPhrase{}, errors.New("다른 화면에서 이 문장이 먼저 바뀌었습니다. 보관함을 다시 열고 고쳐 주세요")
		}
	}
	for i := range book.Phrases {
		if i != index && book.Phrases[i].Text == normalised.Text {
			return RecordPhrase{}, errors.New("같은 문장이 이미 보관함에 있습니다")
		}
	}
	normalised.UpdatedAt = now
	if index >= 0 {
		normalised.CreatedAt = book.Phrases[index].CreatedAt
		book.Phrases[index] = normalised
	} else {
		id, err := newStudentID()
		if err != nil {
			return RecordPhrase{}, err
		}
		normalised.ID = id
		normalised.CreatedAt = now
		if err := records.CheckPhraseCount(len(book.Phrases) + 1); err != nil {
			return RecordPhrase{}, err
		}
		book.Phrases = append(book.Phrases, normalised)
	}
	if err := s.commitRecordsLocked(previous); err != nil {
		return RecordPhrase{}, err
	}
	return copyRecordPhrase(normalised), nil
}

// SaveRecordPhrases는 학년말에 고른 문장을 한꺼번에 보관합니다.
// 하나라도 규칙에 맞지 않으면 아무것도 저장하지 않고, 이미 있는 같은 문장은 건너뜁니다.
// 돌려주는 값은 새로 넣은 문장 수와 건너뛴 문장 수입니다.
func (s *VaultStore) SaveRecordPhrases(phrases []RecordPhrase) (int, int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return 0, 0, errors.New("먼저 보관함을 열어 주세요")
	}
	names := s.knownStudentNamesLocked()
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	existing := map[string]bool{}
	for _, phrase := range book.Phrases {
		existing[phrase.Text] = true
	}
	now := recordNow()
	added, skipped := 0, 0
	next := append([]records.Phrase{}, book.Phrases...)
	for index, phrase := range phrases {
		phrase.ID = ""
		normalised, err := records.NormalisePhrase(phrase, names)
		if err != nil {
			return 0, 0, fmt.Errorf("%d번째 문장: %w", index+1, err)
		}
		if existing[normalised.Text] {
			skipped++
			continue
		}
		id, err := newStudentID()
		if err != nil {
			return 0, 0, err
		}
		normalised.ID, normalised.CreatedAt, normalised.UpdatedAt = id, now, now
		existing[normalised.Text] = true
		next = append(next, normalised)
		added++
	}
	if err := records.CheckPhraseCount(len(next)); err != nil {
		return 0, 0, err
	}
	book.Phrases = next
	if err := s.commitRecordsLocked(previous); err != nil {
		return 0, 0, err
	}
	return added, skipped, nil
}

// DeleteRecordPhrase는 문장 보관함의 문장 하나를 지웁니다.
func (s *VaultStore) DeleteRecordPhrase(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Records == nil {
		return errors.New("지울 문장을 찾지 못했습니다")
	}
	previous := snapshotRecords(s.session.Records)
	book := s.recordsLocked()
	kept := make([]records.Phrase, 0, len(book.Phrases))
	for _, phrase := range book.Phrases {
		if phrase.ID != id {
			kept = append(kept, phrase)
		}
	}
	if len(kept) == len(book.Phrases) {
		return errors.New("지울 문장을 찾지 못했습니다")
	}
	book.Phrases = kept
	return s.commitRecordsLocked(previous)
}
