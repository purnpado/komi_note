package vault

import (
	"errors"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// 미리 알림 중복 방지: 이미 보낸 알림 번호(대상 번호·시점·시각만, 내용 없음)를 암호화 보관함에 둔다.

// DataDir은 보관함이 있는 data 폴더 경로입니다(평문 배경 설정 파일 위치).
func (s *VaultStore) DataDir() string { return filepath.Dir(s.filePath) }

// IsUnlocked는 보관함이 열려 있는지 알려 줍니다.
func (s *VaultStore) IsUnlocked() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.session != nil
}

// SentReminderKeys는 이미 보낸 알림 번호를 돌려줍니다.
func (s *VaultStore) SentReminderKeys() (map[string]bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	result := map[string]bool{}
	for _, key := range s.session.ReminderSent {
		result[key] = true
	}
	return result, nil
}

func reminderKeyTime(key string) time.Time {
	parts := strings.Split(key, ":")
	unix, err := strconv.ParseInt(parts[len(parts)-1], 10, 64)
	if err != nil {
		return time.Time{}
	}
	return time.Unix(unix, 0)
}

// MarkRemindersSent는 보낸 알림 번호를 더하고, 3일보다 오래된 번호는 지웁니다.
func (s *VaultStore) MarkRemindersSent(keys []string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if len(keys) == 0 {
		return nil
	}
	seen := map[string]bool{}
	next := []string{}
	for _, key := range append(append([]string{}, s.session.ReminderSent...), keys...) {
		if seen[key] || reminderKeyTime(key).Before(now.Add(-72*time.Hour)) {
			continue
		}
		seen[key] = true
		next = append(next, key)
	}
	previous, previousUpdated := s.session.ReminderSent, s.session.UpdatedAt
	s.session.ReminderSent = next
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.ReminderSent, s.session.UpdatedAt = previous, previousUpdated
		return err
	}
	return nil
}
