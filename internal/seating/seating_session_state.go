package seating

import (
	"TeacherNote/internal/system"
	"net/http"
	"sort"
	"time"
)

// 학생 휴대폰·전자칠판이 주기적으로 읽는 회차 상태 응답입니다.

// stateAPI는 학생·전자칠판 상태를 같은 읽기 모델로 만들되, 최종 실명은
// 전자칠판 전용 토큰으로 접근한 경우에만 포함한다.
func (s *SeatingServer) stateAPI(x *seatingSession, finalNameAccess ...bool) http.HandlerFunc {
	includeFinalNames := len(finalNameAccess) > 0 && finalNameAccess[0]
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !x.paused && !x.ended {
			s.finishOrderShuffleLocked(x)
			s.finishRandomLadderAnimationLocked(x)
			s.advanceResultLocked(x)
			s.advanceRPSLocked(x)
			s.advanceRPSResultLocked(x)
			s.openStudentTurnIfNeededLocked(x)
			s.startAutomaticRouletteIfNeededLocked(x)
			s.finishPendingShotLocked(x)
			s.advanceResultLocked(x)
			s.openStudentTurnIfNeededLocked(x)
		}
		studentID := ""
		// 전자칠판 응답은 학생 로그인 쿠키를 무시한다. 같은 브라우저로 학생 화면을 시험해 본 뒤
		// 전자칠판을 열어도 배치도가 "자리 받은 학생" 화면처럼 비지 않게 한다.
		if cookie, err := r.Cookie("kkomi-seat"); err == nil && !includeFinalNames {
			studentID = x.deviceStudents[cookie.Value]
		}
		seats := make([]map[string]any, 0, len(x.available))
		for id := range x.available {
			seat := x.seatLayout[id]
			seats = append(seats, map[string]any{"id": id, "label": x.seatLabels[id], "row": seat.Row, "column": seat.Column})
		}
		sort.Slice(seats, func(i, j int) bool {
			return seats[i]["row"].(int) < seats[j]["row"].(int) || (seats[i]["row"].(int) == seats[j]["row"].(int) && seats[i]["column"].(int) < seats[j]["column"].(int))
		})
		currentIndex := x.current
		if x.drawMethod == "랜덤 사다리 배정" {
			currentIndex = x.ladderCurrent
		}
		current := ""
		if currentIndex < len(x.order) {
			current = x.joined[x.order[currentIndex]]
		}
		endsAt := ""
		if x.pendingShot != nil {
			endsAt = x.pendingShot.endsAt.UTC().Format(time.RFC3339Nano)
		} else if !x.resultEndsAt.IsZero() {
			endsAt = x.resultEndsAt.UTC().Format(time.RFC3339Nano)
		}
		displayOrder := x.order
		if x.phase == "순서 섞기" && len(x.shufflePreview) > 0 {
			if shuffled, err := ShuffleStudentIDs(x.shufflePreview); err == nil {
				x.shufflePreview = shuffled
			}
			displayOrder = x.shufflePreview
		}
		remaining := make([]string, 0, len(displayOrder))
		for index := x.current; index < len(displayOrder); index++ {
			remaining = append(remaining, x.joined[displayOrder[index]])
		}
		joined := make([]string, 0, len(x.joinedOrder))
		for _, id := range x.joinedOrder {
			joined = append(joined, x.joined[id])
		}
		orderNicknames := make([]string, 0, len(displayOrder))
		for _, id := range displayOrder {
			orderNicknames = append(orderNicknames, x.joined[id])
		}
		layout := s.layoutSnapshotLocked(x)
		if (x.phase == "배정 완료" || x.phase == "자리 확인") && includeFinalNames && x.namesRevealed {
			finalNames := s.finalNamesBySeatLocked(x)
			for _, seat := range layout {
				seat["finalName"] = finalNames[seat["id"].(string)]
			}
		}
		mySeatID := x.assigned[studentID]
		mySeatLabel := x.seatLabels[mySeatID]
		turnEndsAt := ""
		if !x.turnEndsAt.IsZero() {
			turnEndsAt = x.turnEndsAt.UTC().Format(time.RFC3339Nano)
		}
		turnStartsAt := ""
		if !x.turnStartsAt.IsZero() {
			turnStartsAt = x.turnStartsAt.UTC().Format(time.RFC3339Nano)
		}
		spinSeatID := ""
		spinStartedAt := ""
		if x.pendingShot != nil {
			spinSeatID = x.pendingShot.targetID
			spinStartedAt = x.pendingShot.startedAt.UTC().Format(time.RFC3339Nano)
		}
		demand := map[string]int{}
		for _, picks := range x.preferences {
			for _, seatID := range picks {
				// 이미 확정된 좌석은 새 접수의 희망·경쟁률로 다시 표시하지 않는다.
				if x.available[seatID] {
					demand[seatID]++
				}
			}
		}
		contests := make([]map[string]any, 0, len(x.contests))
		for index, contest := range x.contests {
			contests = append(contests, map[string]any{"seatId": contest.SeatID, "seatLabel": x.seatLabels[contest.SeatID], "priority": contest.Priority, "candidateCount": len(contest.StudentIDs), "current": index == x.contestIndex})
		}
		confirmed := make([]map[string]any, 0, len(x.confirmed))
		for _, item := range x.confirmed {
			confirmed = append(confirmed, map[string]any{"seatId": item.SeatID, "seatLabel": x.seatLabels[item.SeatID], "nickname": x.joined[item.StudentID], "priority": item.Priority})
		}
		if x.drawMethod == "랜덤 사다리 배정" {
			for _, studentID := range x.order {
				if seatID := x.assigned[studentID]; seatID != "" {
					confirmed = append(confirmed, map[string]any{"seatId": seatID, "seatLabel": x.seatLabels[seatID], "nickname": x.joined[studentID]})
				}
			}
		}
		if x.drawMethod == "랜덤 룰렛 배정" {
			for _, studentID := range x.order {
				if seatID := x.assigned[studentID]; seatID != "" {
					confirmed = append(confirmed, map[string]any{"seatId": seatID, "seatLabel": x.seatLabels[seatID], "nickname": x.joined[studentID]})
				}
			}
		}
		rpsMatches := make([]map[string]any, 0, len(x.rpsRound))
		for _, match := range x.rpsRound {
			rpsMatches = append(rpsMatches, map[string]any{"left": x.joined[match.LeftID], "right": x.joined[match.RightID], "leftChoice": match.LeftChoice, "rightChoice": match.RightChoice, "winner": x.joined[match.WinnerID], "bye": match.Bye})
		}
		rpsRounds := make([][]map[string]any, 0, len(x.rpsHistory)+1)
		for _, round := range x.rpsHistory {
			items := make([]map[string]any, 0, len(round))
			for _, match := range round {
				items = append(items, map[string]any{"left": x.joined[match.LeftID], "right": x.joined[match.RightID], "leftChoice": match.LeftChoice, "rightChoice": match.RightChoice, "winner": x.joined[match.WinnerID], "bye": match.Bye})
			}
			rpsRounds = append(rpsRounds, items)
		}
		if len(rpsMatches) > 0 && x.phase != "가위바위보 결과" {
			rpsRounds = append(rpsRounds, rpsMatches)
		}
		ladderPaths := make([]map[string]any, 0)
		ladderLaneCount, ladderWinningEnd := 0, 0
		ladderSeatLabels := []string{}
		if x.drawMethod == "랜덤 사다리 배정" {
			ladderLaneCount = len(x.order)
			for _, seatID := range x.ladderSeatIDs {
				ladderSeatLabels = append(ladderSeatLabels, x.seatLabels[seatID])
			}
			for _, studentID := range x.order {
				start := x.ladderStarts[studentID]
				path := map[string]any{"start": start, "nickname": "", "end": 0, "revealed": x.ladderRevealed}
				if x.ladderRevealed {
					path["nickname"] = x.joined[studentID]
				}
				if x.ladderRevealed {
					for i, seatID := range x.ladderSeatIDs {
						if seatID == x.ladderSeatByStudent[studentID] {
							path["end"] = i + 1
							break
						}
					}
				}
				path["active"] = x.ladderAnimating && x.ladderCurrent < len(x.order) && x.order[x.ladderCurrent] == studentID
				path["complete"] = x.assigned[studentID] != ""
				ladderPaths = append(ladderPaths, path)
			}
		}
		if current := s.currentContestLocked(x); current != nil {
			ladderLaneCount = len(current.StudentIDs)
		}
		if x.ladderResult != nil {
			ladderLaneCount, ladderWinningEnd = x.ladderResult.LaneCount, x.ladderResult.WinningEnd
			for studentID, start := range x.ladderResult.StartByStudent {
				ladderPaths = append(ladderPaths, map[string]any{
					"nickname": x.joined[studentID],
					"start":    start,
					"end":      x.ladderResult.EndByStudent[studentID],
					"winner":   studentID == x.ladderResult.WinnerID,
				})
			}
			sort.Slice(ladderPaths, func(i, j int) bool { return ladderPaths[i]["start"].(int) < ladderPaths[j]["start"].(int) })
		}
		currentContest := s.currentContestLocked(x)
		currentSeat, candidates := "", []string{}
		if currentContest != nil {
			currentSeat = x.seatLabels[currentContest.SeatID]
			for _, id := range currentContest.StudentIDs {
				candidates = append(candidates, x.joined[id])
			}
		}
		if (x.phase == "사다리 출발점 선택" || x.phase == "사다리 결과") && x.ladderSeatID != "" {
			currentSeat = x.seatLabels[x.ladderSeatID]
		}
		// 이미 확정된 학생 기기는 자신의 확정 좌석 안내만 받는다.
		// 다음 라운드의 빈 좌석 목록·배치도는 전자칠판과 미배정 학생에게만 제공한다.
		// seatMap은 학생 휴대폰의 "내 자리" 미니 배치도용 좌석 위치만 담는다(이름·빈자리 정보 없음).
		seatMap := make([]map[string]any, 0, len(layout))
		for _, seat := range layout {
			seatMap = append(seatMap, map[string]any{"id": seat["id"], "label": seat["label"], "seatNumber": seat["seatNumber"], "row": seat["row"], "column": seat["column"], "x": seat["x"], "y": seat["y"]})
		}
		if studentID != "" && mySeatID != "" {
			seats = []map[string]any{}
			layout = []map[string]any{}
			demand = map[string]int{}
		}
		canSubmitPreferences := studentID != "" && mySeatID == "" && x.phase == "희망 자리 제출"
		myLadderStart := x.ladderStarts[studentID]
		finalOrderNicknames := make([]string, 0, len(x.order))
		for _, id := range x.order {
			finalOrderNicknames = append(finalOrderNicknames, x.joined[id])
		}
		system.WriteJSON(w, map[string]any{"running": !x.closed, "seatMap": seatMap, "participants": len(x.joined), "rosterCount": x.rosterCount, "phase": x.phase, "drawMethod": x.drawMethod, "competitionMethod": x.competitionMethod, "deskPosition": x.deskPosition, "nickname": x.joined[studentID], "currentNickname": current, "yourTurn": x.phase == "룰렛 대기" && x.current < len(x.order) && x.order[x.current] == studentID, "availableSeats": seats, "rouletteSeats": s.rouletteSnapshotLocked(x), "layout": layout, "placementMode": x.placementMode, "layoutMode": x.layoutMode, "remainingNicknames": remaining, "joinedNicknames": joined, "orderNicknames": orderNicknames, "finalOrderNicknames": finalOrderNicknames, "currentOrderIndex": currentIndex, "orderShuffling": x.phase == "순서 섞기", "orderEndsAt": x.orderShuffleEndsAt.UTC().Format(time.RFC3339Nano), "turnStartsAt": turnStartsAt, "turnEndsAt": turnEndsAt, "mySeatId": mySeatID, "mySeatLabel": mySeatLabel, "canSubmitPreferences": canSubmitPreferences, "lastShot": x.lastShot, "lastShotSeatId": x.lastShotSeatID, "spinning": x.pendingShot != nil, "spinSeatId": spinSeatID, "spinStartedAt": spinStartedAt, "endsAt": endsAt, "resultHolding": x.phase == "결과 확인" || x.phase == "최종 결과 확인", "completed": x.phase == "배정 완료" || x.phase == "자리 확인", "finalScreen": x.phase == "자리 확인", "preferenceLimit": x.preferenceLimit, "preferenceCycle": x.preferenceCycle, "preferencePriority": x.preferencePriority, "preferenceSubmitted": len(x.preferences), "myPreferences": x.preferences[studentID], "seatDemand": demand, "contests": contests, "confirmedAssignments": confirmed, "rpsEndsAt": x.rpsEndsAt.UTC().Format(time.RFC3339Nano), "rpsMatches": rpsMatches, "rpsRounds": rpsRounds, "rpsSeatLabel": currentSeat, "rpsCandidates": candidates, "myRPSChoice": x.rpsChoices[studentID], "ladderEndsAt": x.ladderEndsAt.UTC().Format(time.RFC3339Nano), "ladderLaneCount": ladderLaneCount, "ladderSeatLabels": ladderSeatLabels, "ladderPaths": ladderPaths, "ladderRungs": x.ladderRungs, "ladderWinningEnd": ladderWinningEnd, "myLadderChoices": x.ladderChoices[studentID], "myLadderStart": myLadderStart, "ladderRevealed": x.ladderRevealed, "ladderAnimating": x.ladderAnimating, "namesRevealed": x.namesRevealed, "partialClosed": x.partialClose, "myHistory": x.history[studentID]})
	}
}
