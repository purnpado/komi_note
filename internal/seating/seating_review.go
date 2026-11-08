package seating

import (
	"errors"
	"fmt"
	"time"
)

// 배정이 끝난 뒤 교사가 결과를 검토·조정하고 실명 공개 시점을 정하는 기능을 모은다.

func isTerminalSeatingPhase(phase string) bool {
	return phase == "배정 완료" || phase == "자리 확인"
}

// RevealNames는 배정이 끝난 회차에서 전자칠판 최종 화면의 실명 공개 여부를 바꾼다.
// 학생 휴대폰 상태 응답에는 공개 여부와 관계없이 실명을 보내지 않는다.
func (s *SeatingServer) RevealNames(planID string, reveal bool) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
	}
	if !isTerminalSeatingPhase(x.phase) {
		return SeatingSessionInfo{}, errors.New("모든 학생의 배정이 끝난 뒤에 실명 배치도를 공개할 수 있습니다")
	}
	x.namesRevealed = reveal
	return s.infoLocked(x)
}

// SwapSeats는 저장된 배치안에서 두 좌석의 학생을 맞바꾼다. 한쪽이 빈자리면 그 자리로 옮긴다.
// 회차가 열려 있으면 배정이 끝난 뒤에만 허용하고, 전자칠판 배치도에도 바로 반영한다.
// 바꾼 기록은 학생 이름 없이 좌석 번호로만 배치안에 남긴다.
func (s *SeatingServer) SwapSeats(planID, firstSeatID, secondSeatID string) (SeatingPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if firstSeatID == "" || secondSeatID == "" || firstSeatID == secondSeatID {
		return SeatingPlan{}, errors.New("서로 다른 두 자리를 골라 주세요")
	}
	x := s.sessions[planID]
	if x != nil && !x.closed && !isTerminalSeatingPhase(x.phase) {
		return SeatingPlan{}, errors.New("자리배정이 진행 중입니다. 배정이 끝난 뒤에 자리를 바꿀 수 있습니다")
	}
	plan, err := s.store.GetSeatingPlan(planID)
	if err != nil {
		return SeatingPlan{}, err
	}
	firstIndex, secondIndex := -1, -1
	for index, seat := range plan.Seats {
		switch seat.ID {
		case firstSeatID:
			firstIndex = index
		case secondSeatID:
			secondIndex = index
		}
	}
	if firstIndex < 0 || secondIndex < 0 {
		return SeatingPlan{}, errors.New("선택한 자리를 배치도에서 찾지 못했습니다")
	}
	firstStudent, secondStudent := plan.Seats[firstIndex].StudentID, plan.Seats[secondIndex].StudentID
	if firstStudent == "" && secondStudent == "" {
		return SeatingPlan{}, errors.New("두 자리가 모두 비어 있어 바꿀 학생이 없습니다")
	}
	if x != nil && !x.closed {
		_, firstActive := x.seatLayout[firstSeatID]
		_, secondActive := x.seatLayout[secondSeatID]
		if !firstActive || !secondActive {
			return SeatingPlan{}, errors.New("이번 회차에서 쓰지 않은 여분 자리로는 옮길 수 없습니다")
		}
	}
	plan.Seats[firstIndex].StudentID, plan.Seats[secondIndex].StudentID = secondStudent, firstStudent
	numbers := map[string]int{}
	for index, seat := range orderedPlanSeats(plan) {
		numbers[seat.ID] = index + 1
	}
	summary := fmt.Sprintf("%d번 ↔ %d번 자리 맞바꿈", numbers[firstSeatID], numbers[secondSeatID])
	if firstStudent == "" || secondStudent == "" {
		from, to := firstSeatID, secondSeatID
		if firstStudent == "" {
			from, to = secondSeatID, firstSeatID
		}
		summary = fmt.Sprintf("%d번 → %d번 빈자리로 옮김", numbers[from], numbers[to])
	}
	plan.Changes = append(plan.Changes, SeatingChange{At: time.Now().Format(time.RFC3339), Summary: summary})
	if len(plan.Changes) > maxSeatingChanges {
		plan.Changes = plan.Changes[len(plan.Changes)-maxSeatingChanges:]
	}
	saved, err := s.store.SaveSeatingPlan(plan)
	if err != nil {
		return SeatingPlan{}, err
	}
	if x != nil && !x.closed {
		applySeatSwapToSession(x, firstSeatID, secondSeatID, firstStudent, secondStudent)
	}
	return saved, nil
}

// applySeatSwapToSession은 열린 회차의 배정 지도(학생→좌석)를 저장된 결과와 맞춘다.
func applySeatSwapToSession(x *seatingSession, firstSeatID, secondSeatID, firstStudent, secondStudent string) {
	if firstStudent != "" {
		delete(x.assigned, firstStudent)
	}
	if secondStudent != "" {
		delete(x.assigned, secondStudent)
	}
	if firstStudent != "" {
		x.assigned[firstStudent] = secondSeatID
	}
	if secondStudent != "" {
		x.assigned[secondStudent] = firstSeatID
	}
	for _, seatID := range []string{firstSeatID, secondSeatID} {
		occupied := false
		for _, assignedSeat := range x.assigned {
			if assignedSeat == seatID {
				occupied = true
				break
			}
		}
		if occupied {
			delete(x.available, seatID)
		} else {
			x.available[seatID] = true
		}
	}
}

// addHistoryLocked는 학생 본인에게만 보여 줄 희망 경쟁 기록 한 줄을 더한다.
func (s *SeatingServer) addHistoryLocked(x *seatingSession, studentID, text string) {
	if studentID == "" {
		return
	}
	if x.history == nil {
		x.history = map[string][]string{}
	}
	x.history[studentID] = append(x.history[studentID], text)
}

// historyPrefix는 "1차 · 2지망 7번"처럼 기록 앞부분을 만든다.
func historyPrefix(x *seatingSession, priority int, seatID string) string {
	cycle := x.preferenceCycle
	if cycle < 1 {
		cycle = 1
	}
	return fmt.Sprintf("%d차 · %d지망 %s", cycle, priority, x.seatLabels[seatID])
}

// recordContestHistoryLocked는 좌석 경쟁이 끝났을 때 후보 모두에게 결과를 남긴다.
func (s *SeatingServer) recordContestHistoryLocked(x *seatingSession, contest SeatingContest, winnerID, game string) {
	prefix := historyPrefix(x, contest.Priority, contest.SeatID)
	for _, studentID := range contest.StudentIDs {
		if studentID == winnerID {
			s.addHistoryLocked(x, studentID, fmt.Sprintf("%s · %s %d명 경쟁 → 확정", prefix, game, len(contest.StudentIDs)))
		} else {
			s.addHistoryLocked(x, studentID, fmt.Sprintf("%s · %s %d명 경쟁 → 탈락", prefix, game, len(contest.StudentIDs)))
		}
	}
}
