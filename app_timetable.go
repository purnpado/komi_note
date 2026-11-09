package main

// 시간표 바인딩

// GetTimetableBook은 교시 시각·학기별 시간표·날짜별 교체 기록을 반환합니다.
func (a *App) GetTimetableBook() (TimetableBook, error) {
	return a.vault.GetTimetableBook()
}

// SaveTimetableBook은 시간표 전체를 암호화해 저장합니다.
func (a *App) SaveTimetableBook(book TimetableBook) (TimetableBook, error) {
	saved, err := a.vault.SaveTimetableBook(book)
	return notifyAfter(eventTimetableChanged, changeUpdated, nil, saved, err)
}
