package seating

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// 희망 자리 방식: 1~3지망 접수·마감·라운드 진행과 학생 지망 제출입니다.

// OpenPreferenceSubmission은 희망 경쟁배정의 학생 지망 입력을 엽니다.
func (s *SeatingServer) OpenPreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "희망 자리 제출 준비" && x.phase != "다음 차 지망 제출 준비" {
		return SeatingSessionInfo{}, errors.New("입장 마감 뒤에 희망 자리 제출을 열 수 있습니다")
	}
	x.preferenceLimit = RemainingPreferenceCount(len(x.available))
	if x.preferenceLimit < 1 {
		return SeatingSessionInfo{}, errors.New("선택할 빈 자리가 없습니다")
	}
	x.preferenceCycle++
	x.phase = "희망 자리 제출"
	return s.infoLocked(x)
}

// ClosePreferenceSubmission은 학생 지망 접수를 마감하고 좌석별 경쟁률을 계산합니다.
func (s *SeatingServer) ClosePreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "희망 자리 제출" {
		return SeatingSessionInfo{}, errors.New("먼저 희망 자리 제출을 열어 주세요")
	}
	if err := s.preparePreferenceRoundLocked(x, 1); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

// AdvancePreferenceRound은 교사 확인 뒤 다음 지망 차수를 연다.
func (s *SeatingServer) AdvancePreferenceRound(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != preferenceCompletionPhase(x.preferencePriority) {
		return SeatingSessionInfo{}, errors.New("현재 라운드 결과를 확인한 뒤 진행할 수 있습니다")
	}
	if x.preferencePriority >= x.preferenceLimit {
		if s.allJoinedStudentsAssignedLocked(x) || len(x.available) == 0 {
			x.phase = "배정 완료"
			return s.infoLocked(x)
		}
		x.preferences = map[string][]string{}
		x.preferencePriority = 0
		x.preferenceLimit = RemainingPreferenceCount(len(x.available))
		x.phase = "다음 차 지망 제출 준비"
		return s.infoLocked(x)
	}
	if err := s.preparePreferenceRoundLocked(x, x.preferencePriority+1); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

// preparePreferenceRoundLocked는 한 지망 차수의 단독 확정과 복수 후보 경쟁 대기열을 만든다.
// 이전 차수에서 탈락한 학생만 남은 빈자리의 다음 지망으로 자연스럽게 넘어간다.
func (s *SeatingServer) preparePreferenceRoundLocked(x *seatingSession, priority int) error {
	if priority <= x.preferenceLimit {
		preferences := make([]SeatingPreference, 0, len(x.preferences))
		for studentID, seatIDs := range x.preferences {
			preferences = append(preferences, SeatingPreference{StudentID: studentID, SeatIDs: seatIDs})
		}
		assigned, occupied := map[string]bool{}, map[string]bool{}
		for studentID := range x.assigned {
			assigned[studentID] = true
		}
		for seatID := range x.seatLayout {
			if !x.available[seatID] {
				occupied[seatID] = true
			}
		}
		// 이번 지망 자리가 이미 다른 학생에게 확정된 경우 본인 기록에 남겨 다음 지망으로 넘어감을 알린다.
		for studentID, seatIDs := range x.preferences {
			if assigned[studentID] || len(seatIDs) < priority {
				continue
			}
			if seatID := seatIDs[priority-1]; occupied[seatID] {
				s.addHistoryLocked(x, studentID, historyPrefix(x, priority, seatID)+" · 이미 확정된 자리 → 다음 지망으로")
			}
		}
		items := BuildSeatingContests(preferences, assigned, occupied, priority)
		singles, contests := SplitSeatingContests(items)
		for _, single := range singles {
			studentID, seatID := single.StudentIDs[0], single.SeatID
			if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
				return err
			}
			x.assigned[studentID] = seatID
			delete(x.available, seatID)
			s.recordPreferenceConfirmationLocked(x, studentID, seatID, priority)
			s.addHistoryLocked(x, studentID, historyPrefix(x, priority, seatID)+" · 단독 희망 → 확정")
		}
		x.preferencePriority = priority
		x.contests = contests
		x.contestIndex = 0
		if len(contests) > 0 {
			x.phase = "경쟁률 공개"
		} else if s.allJoinedStudentsAssignedLocked(x) {
			x.phase = "배정 완료"
		} else {
			x.phase = preferenceCompletionPhase(priority)
		}
		return nil
	}
	x.contests = nil
	x.contestIndex = 0
	x.phase = "배정 완료"
	return nil
}

func (s *SeatingServer) allJoinedStudentsAssignedLocked(x *seatingSession) bool {
	if len(x.joined) == 0 {
		return false
	}
	for studentID := range x.joined {
		if x.assigned[studentID] == "" {
			return false
		}
	}
	return true
}

func preferenceCompletionPhase(priority int) string {
	return fmt.Sprintf("%d지망 처리 완료", priority)
}

func (s *SeatingServer) recordPreferenceConfirmationLocked(x *seatingSession, studentID, seatID string, priority int) {
	for _, item := range x.confirmed {
		if item.StudentID == studentID || item.SeatID == seatID {
			return
		}
	}
	x.confirmed = append(x.confirmed, seatingConfirmation{StudentID: studentID, SeatID: seatID, Priority: priority})
}

func (s *SeatingServer) preferenceAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("kkomi-seat")
		if err != nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		var body struct {
			SeatIDs []string `json:"seatIds"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		// 쿠키에는 기기 토큰이 들어 있다. 아래 코드가 쓰는 cookie.Value를 학생 ID로 바꾼다.
		cookie = &http.Cookie{Name: cookie.Name, Value: x.deviceStudents[cookie.Value]}
		if cookie.Value == "" {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		if x.paused {
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "희망 자리 제출" || x.joined[cookie.Value] == "" {
			http.Error(w, "현재 희망 자리 제출 시간이 아닙니다", http.StatusForbidden)
			return
		}
		if err := validatePreferenceSubmissionLocked(x, cookie.Value, body.SeatIDs); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		x.preferences[cookie.Value] = append([]string(nil), body.SeatIDs...)
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

// validatePreferenceSubmissionLocked는 화면 우회 요청도 같은 기준으로 막는다.
func validatePreferenceSubmissionLocked(x *seatingSession, studentID string, seatIDs []string) error {
	if x.assigned[studentID] != "" {
		return errors.New("이미 자리가 확정되어 다음 희망을 제출할 수 없습니다")
	}
	if len(seatIDs) < 1 || len(seatIDs) > x.preferenceLimit {
		return fmt.Errorf("1~%d지망까지 선택할 수 있습니다", x.preferenceLimit)
	}
	seen := map[string]bool{}
	for _, id := range seatIDs {
		if seen[id] {
			return errors.New("희망 좌석 번호를 중복해 입력할 수 없습니다")
		}
		if !x.available[id] {
			return errors.New("존재하지 않거나 선택할 수 없는 좌석 번호입니다")
		}
		seen[id] = true
	}
	return nil
}
