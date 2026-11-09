package seating

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"errors"
	"net/http"
	"time"
)

// 사다리 방식(경쟁 사다리·무작위 사다리) 회차 진행입니다.

func (s *SeatingServer) openLadderContestLocked(x *seatingSession) error {
	if s.currentContestLocked(x) == nil {
		return errors.New("진행할 경쟁 좌석을 찾지 못했습니다")
	}
	x.ladderChoices = map[string][]int{}
	x.ladderResult = nil
	x.ladderSeatID = s.currentContestLocked(x).SeatID
	x.ladderEndsAt = time.Now().Add(10 * time.Second)
	x.phase = "사다리 출발점 선택"
	return nil
}

func (s *SeatingServer) advanceLadderLocked(x *seatingSession) {
	if x.phase != "사다리 출발점 선택" || time.Now().Before(x.ladderEndsAt) {
		return
	}
	contest := s.currentContestLocked(x)
	if contest == nil {
		return
	}
	result, err := ResolveLadderContest(contest.StudentIDs, x.ladderChoices)
	if err != nil {
		x.phase, x.errorMessage = "오류", "사다리 경쟁 결과를 만들지 못했습니다."
		return
	}
	x.ladderResult = &result
	if err := s.persistArrowAssignmentLocked(x, result.WinnerID, contest.SeatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "사다리타기", result.WinnerID, contest.SeatID)
		return
	}
	x.assigned[result.WinnerID] = contest.SeatID
	delete(x.available, contest.SeatID)
	s.recordPreferenceConfirmationLocked(x, result.WinnerID, contest.SeatID, x.preferencePriority)
	s.recordContestHistoryLocked(x, *contest, result.WinnerID, "사다리타기")
	x.contestIndex++
	x.phase = "사다리 결과"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) advanceLadderResultLocked(x *seatingSession) {
	if x.phase != "사다리 결과" || time.Now().Before(x.resultEndsAt) {
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
	_ = s.openLadderContestLocked(x)
}

// RevealRandomLadder는 모든 참가자의 출발점 선택을 마감하고, 교사 전용으로
// 사다리 경로를 공개한다. 고정 정보는 이 시점에도 공개 응답에 포함하지 않는다.
func (s *SeatingServer) RevealRandomLadder(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "랜덤 사다리 배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 랜덤 사다리 회차가 없습니다")
	}
	if x.phase != "사다리 출발점 선택" {
		return SeatingSessionInfo{}, errors.New("모든 학생의 출발점 선택을 마감한 뒤 공개할 수 있습니다")
	}
	if len(x.ladderStarts) != len(x.order) {
		return SeatingSessionInfo{}, errors.New("모든 참여 학생의 출발점 선택이 완료되어야 합니다")
	}
	seatIDs := x.ladderSeatIDs
	if len(seatIDs) == 0 {
		seatIDs = s.ladderSeatIDsLocked(x)
		x.ladderSeatIDs = append([]string(nil), seatIDs...)
	}
	if len(seatIDs) < len(x.order) {
		return SeatingSessionInfo{}, errors.New("배정할 좌석 수가 참여 학생 수보다 적습니다")
	}
	available := append([]string(nil), seatIDs...)
	used := map[string]bool{}
	x.ladderSeatByStudent = map[string]string{}
	for studentID, seatID := range x.fixed {
		if x.joined[studentID] == "" || !containsSeatID(available, seatID) || used[seatID] {
			continue
		}
		x.ladderSeatByStudent[studentID] = seatID
		used[seatID] = true
	}
	remainingSeats := make([]string, 0, len(available))
	for _, seatID := range available {
		if !used[seatID] {
			remainingSeats = append(remainingSeats, seatID)
		}
	}
	shuffled, err := ShuffleStudentIDs(remainingSeats)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	idx := 0
	for _, studentID := range x.order {
		if x.ladderSeatByStudent[studentID] != "" {
			continue
		}
		x.ladderSeatByStudent[studentID] = shuffled[idx]
		idx++
	}
	x.ladderRungs = ladderRungsForAssignments(x, seatIDs)
	x.ladderRevealed = true
	x.ladderCurrent = 0
	x.ladderAnimating = false
	x.phase = "사다리 공개"
	return s.infoLocked(x)
}

// AdvanceRandomLadder는 교사가 한 번 누를 때마다 다음 학생 한 명의 경로와
// 결과를 공개한다. 자동으로 다음 학생으로 넘어가지 않아 교사가 수업 흐름을 제어한다.
func (s *SeatingServer) AdvanceRandomLadder(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "랜덤 사다리 배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 랜덤 사다리 회차가 없습니다")
	}
	if x.phase != "사다리 공개" && x.phase != "사다리 결과 확인" {
		return SeatingSessionInfo{}, errors.New("사다리 공개 뒤에 한 명씩 진행할 수 있습니다")
	}
	if x.ladderCurrent >= len(x.order) {
		x.phase = "배정 완료"
		return s.infoLocked(x)
	}
	studentID := x.order[x.ladderCurrent]
	seatID := x.ladderSeatByStudent[studentID]
	if seatID == "" {
		return SeatingSessionInfo{}, errors.New("학생의 사다리 도착 좌석을 찾지 못했습니다")
	}
	if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "사다리", studentID, seatID)
		return s.infoLocked(x)
	}
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	x.lastShot, x.lastShotSeatID = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID
	x.ladderAnimating = true
	// 실제 세로·가로 이동 구간을 따라가는 사다리 연출과 같은 시간으로 유지한다.
	x.ladderEndsAt = time.Now().Add(6 * time.Second)
	x.phase = "사다리 연출"
	return s.infoLocked(x)
}

func containsSeatID(ids []string, wanted string) bool {
	for _, id := range ids {
		if id == wanted {
			return true
		}
	}
	return false
}

// ladderSeatIDsLocked는 고정 학생의 실제 좌석도 빠지지 않게 사다리 도착점 묶음을 만든다.
// 고정 여부는 이 목록의 번호만으로 외부에 드러나지 않으며, 학생은 모두 같은 절차를 거친다.
func (s *SeatingServer) ladderSeatIDsLocked(x *seatingSession) []string {
	need := len(x.order)
	if need == 0 {
		return nil
	}
	all := s.orderedSeatIDsLocked(x)
	selected := make([]string, 0, need)
	used := map[string]bool{}
	for _, studentID := range x.order {
		seatID := x.fixed[studentID]
		if seatID != "" && x.joined[studentID] != "" && x.available[seatID] && !used[seatID] {
			selected = append(selected, seatID)
			used[seatID] = true
		}
	}
	for _, seatID := range all {
		if len(selected) >= need {
			break
		}
		if x.available[seatID] && !used[seatID] {
			selected = append(selected, seatID)
			used[seatID] = true
		}
	}
	return selected
}

// ladderRungsForAssignments는 학생이 고른 출발점과 서버가 고정한 도착 좌석을
// 실제 사다리의 인접 가로선으로 변환한다. 원하는 도착 순열을 인접 교환으로
// 만들기 때문에 사다리 경로를 끝까지 따라가면 반드시 저장된 좌석에 도착한다.
func ladderRungsForAssignments(x *seatingSession, seatIDs []string) []ladderRung {
	laneCount := len(x.order)
	if laneCount < 2 {
		return nil
	}
	desired := make([]int, laneCount)
	for orderIndex, studentID := range x.order {
		start := x.ladderStarts[studentID]
		seatID := x.ladderSeatByStudent[studentID]
		end := -1
		for index, id := range seatIDs[:laneCount] {
			if id == seatID {
				end = index
				break
			}
		}
		if start < 1 || start > laneCount || end < 0 {
			return nil
		}
		desired[end] = start
		_ = orderIndex
	}
	lanes := make([]int, laneCount)
	for index := range lanes {
		lanes[index] = index + 1
	}
	rungs := make([]ladderRung, 0, laneCount*4)
	for end, start := range desired {
		position := end
		for position < laneCount && lanes[position] != start {
			position++
		}
		for position > end {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: position})
			lanes[position], lanes[position-1] = lanes[position-1], lanes[position]
			position--
		}
	}
	// 모든 인접 열을 앞뒤로 지나는 교차 묶음은 항등 순열이다. 따라서 저장된 도착 좌석을
	// 바꾸지 않으면서도 적은 인원에서 충분히 풍성한 사다리 연결선을 만들 수 있다.
	// 6명 이하는 세 묶음, 12명 이하는 두 묶음으로 수업용 게임판의 밀도를 보장한다.
	cycles := 1
	if laneCount <= 6 {
		cycles = 3
	} else if laneCount <= 12 {
		cycles = 2
	}
	for cycle := 0; cycle < cycles; cycle++ {
		for left := 1; left < laneCount; left++ {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: left})
		}
		for left := laneCount - 1; left >= 1; left-- {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: left})
		}
	}
	return rungs
}

func (s *SeatingServer) ladderAPI(x *seatingSession) http.HandlerFunc {
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
			Starts []int `json:"starts"`
			Start  int   `json:"start"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body) != nil {
			http.Error(w, "출발점 입력을 확인해 주세요", http.StatusBadRequest)
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
		if x.drawMethod == "랜덤 사다리 배정" {
			if x.closed || x.phase != "사다리 출발점 선택" {
				http.Error(w, "현재 사다리 출발점 선택 시간이 아닙니다", http.StatusForbidden)
				return
			}
			if x.ladderStarts[cookie.Value] != 0 {
				http.Error(w, "출발점 번호를 이미 확정했습니다", http.StatusConflict)
				return
			}
			if x.ladderCurrent >= len(x.order) || x.order[x.ladderCurrent] != cookie.Value {
				http.Error(w, "현재 출발점 선택 차례가 아닙니다", http.StatusForbidden)
				return
			}
			lane := body.Start
			if lane < 1 || lane > len(x.order) {
				http.Error(w, "유효한 출발점 번호를 선택해 주세요", http.StatusBadRequest)
				return
			}
			for _, selected := range x.ladderStarts {
				if selected == lane {
					http.Error(w, "다른 학생이 선택한 출발점입니다", http.StatusConflict)
					return
				}
			}
			x.ladderStarts[cookie.Value] = lane
			for x.ladderCurrent < len(x.order) && x.ladderStarts[x.order[x.ladderCurrent]] != 0 {
				x.ladderCurrent++
			}
			system.WriteJSON(w, map[string]any{"ok": true, "start": lane})
			return
		}
		if x.closed || x.phase != "사다리 출발점 선택" || time.Now().After(x.ladderEndsAt) {
			http.Error(w, "현재 사다리 출발점 선택 시간이 아닙니다", http.StatusForbidden)
			return
		}
		contest := s.currentContestLocked(x)
		eligible := false
		laneCount := 0
		if contest != nil {
			laneCount = len(contest.StudentIDs)
			for _, studentID := range contest.StudentIDs {
				if studentID == cookie.Value {
					eligible = true
					break
				}
			}
		}
		if !eligible {
			http.Error(w, "현재 사다리 경쟁 후보가 아닙니다", http.StatusForbidden)
			return
		}
		if len(body.Starts) < 1 || len(body.Starts) > 3 {
			http.Error(w, "출발점은 1~3순위로 선택해 주세요", http.StatusBadRequest)
			return
		}
		seen := map[int]bool{}
		for _, lane := range body.Starts {
			if lane < 1 || lane > laneCount || seen[lane] {
				http.Error(w, "서로 다른 유효한 출발점을 선택해 주세요", http.StatusBadRequest)
				return
			}
			seen[lane] = true
		}
		x.ladderChoices[cookie.Value] = append([]int(nil), body.Starts...)
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

func (s *SeatingServer) finishRandomLadderAnimationLocked(x *seatingSession) {
	if x.drawMethod != "랜덤 사다리 배정" || x.phase != "사다리 연출" || x.ladderEndsAt.IsZero() || time.Now().Before(x.ladderEndsAt) {
		return
	}
	x.ladderAnimating = false
	x.ladderCurrent++
	x.ladderEndsAt = time.Time{}
	if x.ladderCurrent >= len(x.order) {
		x.phase = "자리 확인"
	} else {
		x.phase = "사다리 결과 확인"
	}
}
