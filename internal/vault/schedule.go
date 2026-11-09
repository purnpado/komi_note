package vault

import (
	"errors"
	"sort"
	"time"

	"TeacherNote/internal/schedule"
)

// ScheduleEvent는 일정 하나입니다.
type ScheduleEvent = schedule.Event

// ScheduleBook은 일정 전체입니다.
type ScheduleBook = schedule.Book

func copyEvents(events []schedule.Event) []schedule.Event {
	result := make([]schedule.Event, len(events))
	for i, event := range events {
		result[i] = event
		result[i].Reminders = append([]int{}, event.Reminders...)
	}
	return result
}

// GetScheduleBook은 일정을 날짜 순으로 돌려줍니다.
func (s *VaultStore) GetScheduleBook() (ScheduleBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return ScheduleBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Schedule == nil {
		return ScheduleBook{Events: []schedule.Event{}}, nil
	}
	events := copyEvents(s.session.Schedule.Events)
	sort.SliceStable(events, func(i, j int) bool {
		return events[i].StartDate+events[i].StartTime < events[j].StartDate+events[j].StartTime
	})
	return ScheduleBook{Events: events}, nil
}

// changeScheduleLocked는 일정 목록을 바꾸고 저장합니다. 저장에 실패하면 되돌립니다.
func (s *VaultStore) changeScheduleLocked(change func(events []schedule.Event) ([]schedule.Event, error)) error {
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	previous, previousUpdated := s.session.Schedule, s.session.UpdatedAt
	current := []schedule.Event{}
	if previous != nil {
		current = copyEvents(previous.Events)
	}
	next, err := change(current)
	if err != nil {
		return err
	}
	s.session.Schedule = &schedule.Book{Events: next}
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Schedule, s.session.UpdatedAt = previous, previousUpdated
		return err
	}
	return nil
}

// SaveScheduleEvent는 일정을 만들거나 고칩니다.
func (s *VaultStore) SaveScheduleEvent(event ScheduleEvent) (ScheduleEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	normalized, err := schedule.Normalize(event)
	if err != nil {
		return ScheduleEvent{}, err
	}
	err = s.changeScheduleLocked(func(events []schedule.Event) ([]schedule.Event, error) {
		now := nowLocal()
		normalized.UpdatedAt = now
		for i := range events {
			if events[i].ID == normalized.ID && normalized.ID != "" {
				normalized.CreatedAt = events[i].CreatedAt
				events[i] = normalized
				return events, nil
			}
		}
		if normalized.ID != "" {
			return nil, errors.New("고칠 일정을 찾지 못했습니다. 화면을 다시 열어 주세요")
		}
		if len(events) >= schedule.MaxEvents {
			return nil, errors.New("일정은 3000개까지 둘 수 있습니다. 지난 일정을 지운 뒤 다시 시도해 주세요")
		}
		id, err := newStudentID()
		if err != nil {
			return nil, err
		}
		normalized.ID, normalized.CreatedAt = id, now
		return append(events, normalized), nil
	})
	if err != nil {
		return ScheduleEvent{}, err
	}
	return normalized, nil
}

// DeleteScheduleEvent는 일정을 지웁니다.
func (s *VaultStore) DeleteScheduleEvent(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.changeScheduleLocked(func(events []schedule.Event) ([]schedule.Event, error) {
		for i := range events {
			if events[i].ID == id {
				return append(events[:i], events[i+1:]...), nil
			}
		}
		return nil, errors.New("일정을 찾지 못했습니다")
	})
}
