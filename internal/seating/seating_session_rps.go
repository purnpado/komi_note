package seating

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// 희망 자리 경쟁의 가위바위보 토너먼트 진행입니다.

// StartSeatingRPSCompetition은 기존 Wails 바인딩 호환을 유지하면서
// 현재 배치 설정의 가위바위보 또는 사다리타기 경쟁을 시작한다.
func (s *SeatingServer) StartSeatingRPSCompetition(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "경쟁률 공개" {
		return SeatingSessionInfo{}, errors.New("경쟁률 공개 뒤에 자리별 경쟁을 시작할 수 있습니다")
	}
	if len(x.contests) == 0 {
		return SeatingSessionInfo{}, errors.New("진행할 복수 후보 경쟁이 없습니다")
	}
	x.contestIndex = 0
	if err := s.openRPSTournamentLocked(x); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

func (s *SeatingServer) openRPSTournamentLocked(x *seatingSession) error {
	contest := s.currentContestLocked(x)
	if contest == nil {
		return errors.New("진행할 경쟁 좌석을 찾지 못했습니다")
	}
	round, err := BuildRPSTournamentRound(contest.StudentIDs)
	if err != nil {
		return err
	}
	x.rpsHistory = nil
	x.rpsRound = round
	s.openRPSRoundLocked(x)
	return nil
}

func (s *SeatingServer) openRPSRoundLocked(x *seatingSession) {
	x.rpsChoices = map[string]string{}
	x.rpsResult = nil
	x.rpsEndsAt = time.Now().Add(10 * time.Second)
	x.phase = "가위바위보 선택"
}

func (s *SeatingServer) currentContestLocked(x *seatingSession) *SeatingContest {
	if x.contestIndex < 0 || x.contestIndex >= len(x.contests) {
		return nil
	}
	return &x.contests[x.contestIndex]
}

func (s *SeatingServer) advanceRPSLocked(x *seatingSession) {
	if x.phase != "가위바위보 선택" || time.Now().Before(x.rpsEndsAt) {
		return
	}
	contest := s.currentContestLocked(x)
	if contest == nil {
		return
	}
	drawIDs := map[string]bool{}
	for index := range x.rpsRound {
		match := &x.rpsRound[index]
		if match.WinnerID != "" {
			continue
		}
		match.LeftChoice, match.RightChoice = x.rpsChoices[match.LeftID], x.rpsChoices[match.RightID]
		result := ResolveRPSRound([]string{match.LeftID, match.RightID}, map[string]string{match.LeftID: match.LeftChoice, match.RightID: match.RightChoice})
		// 양쪽 모두 미입력인 경우 재대결을 반복하면 수업이 멈춘다.
		// 해당 대결 안에서만 암호학적 난수로 한 명을 정해 다음 단계로 보낸다.
		if len(result.Missing) == 2 {
			winner, err := NextArrowTarget([]string{match.LeftID, match.RightID}, "", nil)
			if err != nil {
				x.phase = "오류"
				return
			}
			match.WinnerID = winner
			match.LeftChoice, match.RightChoice = "미입력", "미입력"
			continue
		}
		if result.Draw {
			drawIDs[match.LeftID], drawIDs[match.RightID] = true, true
			continue
		}
		if len(result.Winners) == 1 {
			match.WinnerID = result.Winners[0]
		}
	}
	if len(drawIDs) > 0 {
		next := map[string]string{}
		for id := range drawIDs {
			next[id] = ""
		}
		x.rpsChoices = next
		x.rpsEndsAt = time.Now().Add(10 * time.Second)
		return
	}
	finished := append([]RPSMatch(nil), x.rpsRound...)
	x.rpsHistory = append(x.rpsHistory, finished)
	winners := make([]string, 0, len(finished))
	for _, match := range finished {
		if match.WinnerID != "" {
			winners = append(winners, match.WinnerID)
		}
	}
	if len(winners) == 1 {
		winner := winners[0]
		x.rpsResult = []string{winner}
		if err := s.persistArrowAssignmentLocked(x, winner, contest.SeatID); err != nil {
			s.beginAssignmentRecoveryLocked(x, "가위바위보", winner, contest.SeatID)
			return
		}
		x.assigned[winner] = contest.SeatID
		delete(x.available, contest.SeatID)
		s.recordPreferenceConfirmationLocked(x, winner, contest.SeatID, x.preferencePriority)
		s.recordContestHistoryLocked(x, *contest, winner, "가위바위보")
		x.contestIndex++
	} else if len(winners) > 1 {
		x.rpsResult = winners
	}
	x.phase = "가위바위보 결과"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) advanceRPSResultLocked(x *seatingSession) {
	if x.phase != "가위바위보 결과" || time.Now().Before(x.resultEndsAt) {
		return
	}
	if len(x.rpsResult) > 1 {
		x.rpsRound = BuildRPSNextRound(x.rpsResult)
		s.openRPSRoundLocked(x)
		return
	}
	if x.contestIndex >= len(x.contests) {
		if s.allJoinedStudentsAssignedLocked(x) {
			x.phase = "배정 완료"
		} else {
			x.phase = preferenceCompletionPhase(x.preferencePriority)
		}
		x.resultEndsAt = time.Time{}
		return
	}
	_ = s.openRPSTournamentLocked(x)
}

func (s *SeatingServer) rpsAPI(x *seatingSession) http.HandlerFunc {
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
			Choice string `json:"choice"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		if body.Choice != "가위" && body.Choice != "바위" && body.Choice != "보" {
			http.Error(w, "가위·바위·보 중 하나를 선택해 주세요", http.StatusBadRequest)
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
		if x.closed || x.phase != "가위바위보 선택" || time.Now().After(x.rpsEndsAt) {
			http.Error(w, "현재 가위바위보 선택 시간이 아닙니다", http.StatusForbidden)
			return
		}
		eligible := false
		for _, match := range x.rpsRound {
			if match.WinnerID == "" && (match.LeftID == cookie.Value || match.RightID == cookie.Value) {
				eligible = true
				break
			}
		}
		if !eligible {
			http.Error(w, "현재 대결 후보가 아닙니다", http.StatusForbidden)
			return
		}
		x.rpsChoices[cookie.Value] = body.Choice
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}
