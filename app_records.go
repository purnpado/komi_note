package main

// 학교생활기록 바인딩

// RecordPhraseBulkResult는 문장을 한꺼번에 보관한 결과입니다.
type RecordPhraseBulkResult struct {
	Added   int `json:"added"`
	Skipped int `json:"skipped"`
}

// GetRecordBook은 학교생활기록(관찰 메모·기재 문장·활동 명단·글자 수 한도)을 반환합니다.
func (a *App) GetRecordBook() (RecordBook, error) {
	return a.vault.GetRecordBook()
}

// SaveRecordEntry는 한 학생의 한 영역 기록을 암호화해 저장합니다.
func (a *App) SaveRecordEntry(entry RecordEntry) (RecordEntry, error) {
	saved, err := a.vault.SaveRecordEntry(entry)
	return notifyAfter(eventRecordsChanged, savedKind(entry.ID), func(e RecordEntry) string { return e.ID }, saved, err)
}

// DeleteRecordEntry는 기록 하나를 지웁니다.
func (a *App) DeleteRecordEntry(id string) error {
	return notifyErr(eventRecordsChanged, changeDeleted, id, a.vault.DeleteRecordEntry(id))
}

// SaveRecordList는 동아리 등 활동 명단을 암호화해 저장합니다.
func (a *App) SaveRecordList(list RecordActivityList) (RecordActivityList, error) {
	saved, err := a.vault.SaveRecordList(list)
	return notifyAfter(eventRecordsChanged, savedKind(list.ID), func(l RecordActivityList) string { return l.ID }, saved, err)
}

// DeleteRecordList는 활동 명단과 그 명단으로 쓴 기록을 지웁니다.
func (a *App) DeleteRecordList(id, confirmation string) error {
	return notifyErr(eventRecordsChanged, changeDeleted, id, a.vault.DeleteRecordList(id, confirmation))
}

// SaveRecordLimits는 영역별 글자 수 한도를 저장합니다.
func (a *App) SaveRecordLimits(limits map[string]int) (map[string]int, error) {
	saved, err := a.vault.SaveRecordLimits(limits)
	return notifyAfter(eventRecordsChanged, changeUpdated, nil, saved, err)
}

// DeleteRecordYear는 한 학년도의 학교생활기록과 활동 명단을 한꺼번에 지웁니다.
func (a *App) DeleteRecordYear(schoolYear, confirmation string) (int, error) {
	removed, err := a.vault.DeleteRecordYear(schoolYear, confirmation)
	return notifyAfter(eventRecordsChanged, changeDeleted, func(int) string { return schoolYear }, removed, err)
}

// SaveRecordPhrase는 학생 정보 없이 특기사항 문장을 문장 보관함에 저장합니다.
func (a *App) SaveRecordPhrase(phrase RecordPhrase) (RecordPhrase, error) {
	saved, err := a.vault.SaveRecordPhrase(phrase)
	return notifyAfter(eventRecordsChanged, savedKind(phrase.ID), func(p RecordPhrase) string { return p.ID }, saved, err)
}

// SaveRecordPhrases는 학년말에 고른 문장들을 문장 보관함에 한꺼번에 저장합니다.
func (a *App) SaveRecordPhrases(phrases []RecordPhrase) (RecordPhraseBulkResult, error) {
	added, skipped, err := a.vault.SaveRecordPhrases(phrases)
	return notifyAfter(eventRecordsChanged, changeArchived, nil, RecordPhraseBulkResult{Added: added, Skipped: skipped}, err)
}

// DeleteRecordPhrase는 문장 보관함의 문장 하나를 지웁니다.
func (a *App) DeleteRecordPhrase(id string) error {
	return notifyErr(eventRecordsChanged, changeDeleted, id, a.vault.DeleteRecordPhrase(id))
}
