package seating

import (
	"TeacherNote/internal/system"
	"errors"
	"net/http"
	"time"
)

// 룰렛·화살 무작위 배정: 순서 섞기, 학생 차례, 화살 쏘기, 결과 확정입니다.

// StartRandomArrowAssignment은 입장한 학생의 익명 순서를 섞어 화살 배정을 시작합니다.
// 실제 학생 이름은 브라우저와 전자칠판으로 전송하지 않습니다.
func (s *SeatingServer) StartRandomArrowAssignment(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("먼저 QR 참여 회차를 열어 주세요")
	}
	if x.phase != "입장 마감" {
		return SeatingSessionInfo{}, errors.New("먼저 학생 입장을 마감해 주세요")
	}
	plan, err := s.store.GetSeatingPlan(planID)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	activeSeats := orderedPlanSeats(plan)
	if x.rosterCount > 0 && len(activeSeats) > x.rosterCount {
		activeSeats = activeSeats[:x.rosterCount]
	}
	available, seatLabels, seatLayout := seatingLayout(activeSeats)
	if len(available) < len(x.joined) {
		return SeatingSessionInfo{}, errors.New("빈 좌석 수가 입장 학생 수보다 적습니다")
	}
	ids := make([]string, 0, len(x.joined))
	for id := range x.joined {
		ids = append(ids, id)
	}
	order, err := ShuffleStudentIDs(ids)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	x.order, x.current, x.available, x.seatLabels, x.seatLayout, x.placementMode, x.layoutMode, x.assigned, x.fixed, x.lastShot, x.lastShotSeatID = order, 0, available, seatLabels, seatLayout, plan.PlacementMode, plan.LayoutMode, map[string]string{}, s.fixedSeatsLocked(plan), "", ""
	x.shufflePreview = append([]string(nil), order...)
	x.orderShuffleEndsAt = time.Now().Add(5 * time.Second)
	x.phase = "순서 섞기"
	return s.infoLocked(x)
}

// StartRoulette은 교사가 확정된 학생 순서의 다음 룰렛을 시작합니다.
func (s *SeatingServer) StartRoulette(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("먼저 QR 참여 회차를 열어 주세요")
	}
	s.finishOrderShuffleLocked(x)
	if x.phase != "룰렛 시작 준비" {
		return SeatingSessionInfo{}, errors.New("먼저 순서 섞기를 완료해 주세요")
	}
	x.phase = "룰렛 시작 대기"
	x.turnStartsAt = time.Now().Add(5 * time.Second)
	x.turnEndsAt = time.Time{}
	return s.infoLocked(x)
}

func (s *SeatingServer) finishOrderShuffleLocked(x *seatingSession) {
	if x.phase == "순서 섞기" && !x.orderShuffleEndsAt.IsZero() && !time.Now().Before(x.orderShuffleEndsAt) {
		if x.drawMethod == "랜덤 사다리 배정" {
			x.ladderStarts = map[string]int{}
			x.ladderSeatByStudent = map[string]string{}
			x.ladderSeatIDs = s.ladderSeatIDsLocked(x)
			x.ladderRungs = []ladderRung{}
			x.ladderOrder = append([]string(nil), x.order...)
			x.ladderCurrent, x.ladderRevealed, x.ladderAnimating = 0, false, false
			x.phase = "사다리 출발점 선택"
		} else {
			x.phase = "룰렛 시작 준비"
		}
		x.shufflePreview = nil
		x.turnEndsAt = time.Time{}
	}
}

func (s *SeatingServer) openStudentTurnIfNeededLocked(x *seatingSession) {
	if x.phase != "룰렛 시작 대기" || x.turnStartsAt.IsZero() || time.Now().Before(x.turnStartsAt) {
		return
	}
	x.phase = "룰렛 대기"
	x.turnStartsAt = time.Time{}
	x.turnEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) startAutomaticRouletteIfNeededLocked(x *seatingSession) {
	if x.phase != "룰렛 대기" || x.turnEndsAt.IsZero() || time.Now().Before(x.turnEndsAt) {
		return
	}
	_ = s.queueArrowShotLocked(x)
}

func (s *SeatingServer) queueArrowShotLocked(x *seatingSession) error {
	if x.current >= len(x.order) {
		return errors.New("배정할 학생이 없습니다")
	}
	studentID := x.order[x.current]
	target := ""
	if fixed := x.fixed[studentID]; fixed != "" && x.available[fixed] {
		target = fixed
	}
	if target == "" {
		candidates := make([]string, 0, len(x.available))
		for id := range x.available {
			reserved := false
			for owner, fixed := range x.fixed {
				if owner != studentID && x.joined[owner] != "" && id == fixed {
					reserved = true
					break
				}
			}
			if !reserved {
				candidates = append(candidates, id)
			}
		}
		shuffled, err := ShuffleStudentIDs(candidates)
		if err != nil || len(shuffled) == 0 {
			return errors.New("배정할 좌석을 준비하지 못했습니다")
		}
		target = shuffled[0]
	}
	b, err := system.RandomBytes(1)
	if err != nil {
		return errors.New("룰렛 시간을 준비하지 못했습니다")
	}
	startedAt := time.Now()
	x.pendingShot = &pendingArrowShot{studentID: studentID, targetID: target, startedAt: startedAt, endsAt: startedAt.Add(time.Duration(3+int(b[0])%3) * time.Second)}
	x.phase = "룰렛 연출"
	return nil
}

func (s *SeatingServer) arrowAPI(x *seatingSession) http.HandlerFunc {
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
		if x.closed || x.phase != "룰렛 대기" || x.current >= len(x.order) || x.order[x.current] != cookie.Value {
			http.Error(w, "현재 학생의 룰렛 차례가 아닙니다", http.StatusForbidden)
			return
		}
		if err := s.queueArrowShotLocked(x); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		system.WriteJSON(w, map[string]any{"ok": true, "spinning": true})
	}
}

func (s *SeatingServer) finishPendingShotLocked(x *seatingSession) {
	if x.pendingShot == nil || time.Now().Before(x.pendingShot.endsAt) {
		return
	}
	pending := x.pendingShot
	if s.persistArrowAssignmentLocked(x, pending.studentID, pending.targetID) != nil {
		s.beginAssignmentRecoveryLocked(x, "룰렛", pending.studentID, pending.targetID)
		return
	}
	label := x.seatLabels[pending.targetID]
	if label == "" {
		label = pending.targetID
	}
	x.assigned[pending.studentID], x.lastShot, x.lastShotSeatID = pending.targetID, x.joined[pending.studentID]+" → "+label, pending.targetID
	x.pendingShot = nil
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	if x.current+1 >= len(x.order) {
		x.phase = "최종 결과 확인"
	} else {
		x.phase = "결과 확인"
	}
	x.turnEndsAt = time.Time{}
}

// advanceResultLocked는 정지한 룰렛 결과를 최소 5초 보여 준 뒤에만
// 당첨 칸을 원판에서 빼고 다음 학생 차례로 넘긴다.
func (s *SeatingServer) advanceResultLocked(x *seatingSession) {
	if (x.phase != "결과 확인" && x.phase != "최종 결과 확인") || x.resultEndsAt.IsZero() || time.Now().Before(x.resultEndsAt) {
		return
	}
	delete(x.available, x.lastShotSeatID)
	x.current++
	x.resultEndsAt = time.Time{}
	if x.current >= len(x.order) {
		x.phase = "자리 확인"
		x.turnStartsAt = time.Time{}
		return
	}
	if s.confirmLastRouletteAssignmentLocked(x) {
		return
	}
	x.phase = "룰렛 시작 대기"
	x.turnStartsAt = time.Now().Add(5 * time.Second)
}

// confirmLastRouletteAssignmentLocked는 마지막 학생에게 남은 유일한 좌석을 바로 확정합니다.
// 마지막 학생에게는 룰렛 버튼·대기 시간을 열지 않으며, 저장 실패 시 기존 복구 흐름을 사용합니다.
func (s *SeatingServer) confirmLastRouletteAssignmentLocked(x *seatingSession) bool {
	if x.drawMethod != "랜덤 룰렛 배정" || x.current+1 != len(x.order) || len(x.available) != 1 {
		return false
	}
	studentID := x.order[x.current]
	seatID := ""
	for id := range x.available {
		seatID = id
	}
	if seatID == "" {
		return false
	}
	if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "룰렛", studentID, seatID)
		return true
	}
	label := x.seatLabels[seatID]
	if label == "" {
		label = seatID
	}
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	x.lastShot = x.joined[studentID] + " → " + label + " · 마지막 자리 자동 확정"
	x.lastShotSeatID = seatID
	x.phase = "최종 결과 확인"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	x.turnStartsAt, x.turnEndsAt = time.Time{}, time.Time{}
	return true
}

func (s *SeatingServer) persistArrowAssignmentLocked(x *seatingSession, studentID, seatID string) error {
	plan, err := s.store.GetSeatingPlan(x.planID)
	if err != nil {
		return err
	}
	for index := range plan.Seats {
		if plan.Seats[index].ID == seatID {
			plan.Seats[index].StudentID = studentID
			_, saveErr := s.store.SaveSeatingPlan(plan)
			return saveErr
		}
	}
	return errors.New("선택한 좌석을 찾지 못했습니다")
}
