package seating

import (
	"crypto/rand"
	"errors"
	"math/big"
	"sort"
)

// SeatingPreference는 한 학생이 한 라운드에 제출한 자리 희망 순위입니다.
type SeatingPreference struct {
	StudentID string   `json:"studentId"`
	SeatIDs   []string `json:"seatIds"`
}

// SeatingContest는 같은 자리의 유효 후보만 모은 경쟁 단위입니다.
type SeatingContest struct {
	SeatID     string   `json:"seatId"`
	Priority   int      `json:"priority"`
	StudentIDs []string `json:"studentIds"`
}

// BuildSeatingContests는 아직 배정되지 않은 학생과 비어 있는 자리만으로 지망 차수별 경쟁을 만듭니다.
// 호출자는 단독 후보를 바로 확정하고, 복수 후보의 승자만 assigned에 추가한 뒤 다음 차수를 다시 계산합니다.
func BuildSeatingContests(preferences []SeatingPreference, assigned map[string]bool, occupied map[string]bool, priority int) []SeatingContest {
	if priority < 1 {
		return nil
	}
	candidates := map[string][]string{}
	for _, preference := range preferences {
		if preference.StudentID == "" || assigned[preference.StudentID] || len(preference.SeatIDs) < priority {
			continue
		}
		seatID := preference.SeatIDs[priority-1]
		if seatID != "" && !occupied[seatID] {
			candidates[seatID] = append(candidates[seatID], preference.StudentID)
		}
	}
	result := make([]SeatingContest, 0, len(candidates))
	for seatID, studentIDs := range candidates {
		sort.Strings(studentIDs)
		result = append(result, SeatingContest{SeatID: seatID, Priority: priority, StudentIDs: studentIDs})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].SeatID < result[j].SeatID })
	return result
}

// SplitSeatingContests는 단독 후보의 즉시 확정과 복수 후보 경쟁 대기를 구분한다.
// 각 좌석은 한 번만 처리하며, 경쟁 대기 학생은 승자 판정 전까지 다음 지망으로 넘기지 않는다.
func SplitSeatingContests(items []SeatingContest) (singles, contests []SeatingContest) {
	for _, item := range items {
		switch len(item.StudentIDs) {
		case 1:
			singles = append(singles, item)
		case 2:
			fallthrough
		default:
			if len(item.StudentIDs) > 1 {
				contests = append(contests, item)
			}
		}
	}
	return singles, contests
}

// RemainingPreferenceCount는 남은 자리에 맞춰 다음 라운드에서 받을 지망 수를 제한합니다.
func RemainingPreferenceCount(emptySeats int) int {
	if emptySeats <= 1 {
		return emptySeats
	}
	if emptySeats == 2 {
		return 2
	}
	return 3
}

// EligibleSeatIDs는 교사가 선택한 이전 자리·짝궁 제외 규칙을 적용한 배정 가능 자리만 반환합니다.
func EligibleSeatIDs(seatIDs []string, excluded map[string]bool) []string {
	result := make([]string, 0, len(seatIDs))
	for _, seatID := range seatIDs {
		if seatID != "" && !excluded[seatID] {
			result = append(result, seatID)
		}
	}
	return result
}

// ShuffleStudentIDs는 랜덤 화살배정의 참여 순서를 암호학적으로 섞습니다.
func ShuffleStudentIDs(ids []string) ([]string, error) {
	result := append([]string(nil), ids...)
	for index := len(result) - 1; index > 0; index-- {
		picked, err := rand.Int(rand.Reader, big.NewInt(int64(index+1)))
		if err != nil {
			return nil, err
		}
		other := int(picked.Int64())
		result[index], result[other] = result[other], result[index]
	}
	return result, nil
}

// NextArrowTarget은 랜덤 화살배정에서 한 학생이 실제로 배정될 수 있는 자리를 고릅니다.
// fixedSeatID는 교사만 아는 고정 자리이며, 일반 학생에게는 제외 규칙만 적용합니다.
func NextArrowTarget(availableSeatIDs []string, fixedSeatID string, excluded map[string]bool) (string, error) {
	available := map[string]bool{}
	for _, seatID := range availableSeatIDs {
		available[seatID] = true
	}
	if fixedSeatID != "" && available[fixedSeatID] {
		return fixedSeatID, nil
	}
	eligible := EligibleSeatIDs(availableSeatIDs, excluded)
	if len(eligible) == 0 {
		return "", errors.New("배정 가능한 자리가 없습니다")
	}
	picked, err := rand.Int(rand.Reader, big.NewInt(int64(len(eligible))))
	if err != nil {
		return "", err
	}
	return eligible[picked.Int64()], nil
}

// RPSRoundResult는 가위바위보 한 번의 공개 가능한 판정 결과다.
type RPSRoundResult struct {
	Winners []string
	Missing []string
	Draw    bool
}

// RPSMatch는 전자칠판에 공개할 한 토너먼트 대결이다. ID는 세션 메모리에서만 사용한다.
type RPSMatch struct {
	LeftID      string
	RightID     string
	LeftChoice  string
	RightChoice string
	WinnerID    string
	Bye         bool
}

// BuildRPSTournamentRound은 후보 순서를 한 번만 암호학적으로 섞어 첫 토너먼트 라운드를 만든다.
// 빈 상대는 무작위 대진 결과에 따른 부전승이다.
func BuildRPSTournamentRound(candidateIDs []string) ([]RPSMatch, error) {
	ids, err := ShuffleStudentIDs(candidateIDs)
	if err != nil {
		return nil, err
	}
	result := make([]RPSMatch, 0, (len(ids)+1)/2)
	for index := 0; index < len(ids); index += 2 {
		match := RPSMatch{LeftID: ids[index]}
		if index+1 < len(ids) {
			match.RightID = ids[index+1]
		} else {
			match.Bye, match.WinnerID = true, ids[index]
		}
		result = append(result, match)
	}
	return result, nil
}

// BuildRPSNextRound은 확정된 진출자를 대진표 순서대로 다음 라운드에 배치한다.
func BuildRPSNextRound(winners []string) []RPSMatch {
	result := make([]RPSMatch, 0, (len(winners)+1)/2)
	for index := 0; index < len(winners); index += 2 {
		match := RPSMatch{LeftID: winners[index]}
		if index+1 < len(winners) {
			match.RightID = winners[index+1]
		} else {
			match.Bye, match.WinnerID = true, winners[index]
		}
		result = append(result, match)
	}
	return result
}

// ResolveRPSRound는 복수 후보의 가위·바위·보 선택을 판정한다.
func ResolveRPSRound(candidateIDs []string, choices map[string]string) RPSRoundResult {
	valid := map[string][]string{"가위": {}, "바위": {}, "보": {}}
	missing := make([]string, 0)
	for _, id := range candidateIDs {
		choice := choices[id]
		if _, ok := valid[choice]; !ok {
			missing = append(missing, id)
			continue
		}
		valid[choice] = append(valid[choice], id)
	}
	for _, ids := range valid {
		sort.Strings(ids)
	}
	sort.Strings(missing)
	hands := 0
	for _, ids := range valid {
		if len(ids) > 0 {
			hands++
		}
	}
	if hands == 1 {
		for _, ids := range valid {
			if len(ids) > 0 {
				return RPSRoundResult{Winners: ids, Missing: missing}
			}
		}
	}
	if hands != 2 {
		return RPSRoundResult{Missing: missing, Draw: true}
	}
	winning := ""
	if len(valid["가위"]) > 0 && len(valid["보"]) > 0 {
		winning = "가위"
	}
	if len(valid["바위"]) > 0 && len(valid["가위"]) > 0 {
		winning = "바위"
	}
	if len(valid["보"]) > 0 && len(valid["바위"]) > 0 {
		winning = "보"
	}
	return RPSRoundResult{Winners: valid[winning], Missing: missing}
}
