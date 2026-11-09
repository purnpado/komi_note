package main

import "TeacherNote/internal/vault"

// 일정 바인딩. 저장에 성공하면 schedule:변경 알림(종류·번호만)을 보냅니다. 구글 캘린더 연동은 아직 없습니다.

type ScheduleEvent = vault.ScheduleEvent
type ScheduleBook = vault.ScheduleBook

// GetScheduleBook은 일정 전체를 돌려줍니다.
func (a *App) GetScheduleBook() (ScheduleBook, error) { return a.vault.GetScheduleBook() }

// SaveScheduleEvent는 일정을 만들거나 고칩니다.
func (a *App) SaveScheduleEvent(event ScheduleEvent) (ScheduleEvent, error) {
	kind := changeUpdated
	if event.ID == "" {
		kind = changeAdded
	}
	saved, err := a.vault.SaveScheduleEvent(event)
	return notifyAfter(eventScheduleChanged, kind, func(v ScheduleEvent) string { return v.ID }, saved, err)
}

// DeleteScheduleEvent는 일정을 지웁니다.
func (a *App) DeleteScheduleEvent(id string) error {
	if err := a.vault.DeleteScheduleEvent(id); err != nil {
		return err
	}
	notifyChange(eventScheduleChanged, changeDeleted, id)
	return nil
}
