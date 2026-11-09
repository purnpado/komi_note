package vault

import (
	"TeacherNote/internal/records"
	"errors"
	"fmt"
	"strings"
)

// 학교생활기록 문장 보관함(학생 정보 없는 문장) 저장입니다.

func copyRecordPhrase(phrase records.Phrase) records.Phrase {
	phrase.Tags = append([]string{}, phrase.Tags...)
	return phrase
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
