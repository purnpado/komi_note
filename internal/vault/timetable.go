package vault

import (
	"errors"
	"time"

	"TeacherNote/internal/timetable"
)

// TimetableBook은 교시 시각·학기별 시간표·날짜별 교체 기록 전체입니다.
type TimetableBook = timetable.Book

// defaultSemester는 날짜로 지금 학기를 짐작합니다(8월부터 2학기, 1·2월은 앞 학년도 2학기).
func defaultSemester(now time.Time, configYear string) (string, string) {
	year := now.Format("2006")
	semester := "1"
	switch {
	case now.Month() >= time.August:
		semester = "2"
	case now.Month() <= time.February:
		year = now.AddDate(-1, 0, 0).Format("2006")
		semester = "2"
	}
	if len(configYear) == 4 {
		year = configYear
	}
	return year, semester
}

func copyTimetableBook(book timetable.Book) timetable.Book {
	book.Periods = append([]timetable.Period{}, book.Periods...)
	tables := make([]timetable.Timetable, len(book.Timetables))
	for index, table := range book.Timetables {
		tables[index] = table
		tables[index].Cells = append([]timetable.Cell{}, table.Cells...)
	}
	book.Timetables = tables
	book.Changes = append([]timetable.Change{}, book.Changes...)
	return book
}

// GetTimetableBook은 저장된 시간표를 돌려줍니다. 아직 없으면 지금 학년도·학기의 빈 시간표를 돌려줍니다.
func (s *VaultStore) GetTimetableBook() (TimetableBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return TimetableBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Timetable == nil {
		year, semester := defaultSemester(time.Now(), s.session.Config.SchoolYear)
		return TimetableBook{
			ActiveSchoolYear: year,
			ActiveSemester:   semester,
			Periods:          []timetable.Period{},
			Timetables:       []timetable.Timetable{},
			Changes:          []timetable.Change{},
		}, nil
	}
	return copyTimetableBook(*s.session.Timetable), nil
}

// SaveTimetableBook은 시간표 전체를 정리·검사한 뒤 암호화 저장합니다.
// 화면이 읽은 뒤 다른 곳에서 먼저 바뀌었으면(updatedAt 불일치) 덮어쓰지 않습니다.
func (s *VaultStore) SaveTimetableBook(book TimetableBook) (TimetableBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return TimetableBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	stored := ""
	if s.session.Timetable != nil {
		stored = s.session.Timetable.UpdatedAt
	}
	if book.UpdatedAt != stored {
		return TimetableBook{}, errors.New("다른 화면에서 시간표가 먼저 바뀌었습니다. 시간표를 다시 열고 고쳐 주세요")
	}
	normalised, err := timetable.Normalise(book, newStudentID)
	if err != nil {
		return TimetableBook{}, err
	}
	normalised.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	previous := s.session.Timetable
	s.session.Timetable = &normalised
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Timetable = previous
		return TimetableBook{}, err
	}
	return copyTimetableBook(normalised), nil
}
