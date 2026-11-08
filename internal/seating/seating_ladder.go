package seating

import (
	"errors"
	"strconv"
)

// ResolveLadderContest는 후보별 출발점 선호를 서로 다른 출발점으로 공정하게 배정하고,
// 고정된 도착점 중 하나를 승리 도착점으로 정한다.
func ResolveLadderContest(candidateIDs []string, preferences map[string][]int) (LadderResult, error) {
	if len(candidateIDs) < 2 {
		return LadderResult{}, errors.New("사다리 경쟁에는 두 명 이상의 후보가 필요합니다")
	}
	ordered, err := ShuffleStudentIDs(candidateIDs)
	if err != nil {
		return LadderResult{}, err
	}
	available := map[int]bool{}
	for lane := 1; lane <= len(ordered); lane++ {
		available[lane] = true
	}
	starts := map[string]int{}
	// 같은 순위의 같은 출발점만 추첨한다. 따라서 단독 1순위는
	// 다른 후보의 2·3순위 처리 순서에 밀리지 않는다.
	for priority := 0; priority < 3; priority++ {
		contendersByLane := map[int][]string{}
		for _, studentID := range ordered {
			if starts[studentID] != 0 || len(preferences[studentID]) <= priority {
				continue
			}
			lane := preferences[studentID][priority]
			if lane >= 1 && lane <= len(ordered) && available[lane] {
				contendersByLane[lane] = append(contendersByLane[lane], studentID)
			}
		}
		for lane, contenders := range contendersByLane {
			shuffled, shuffleErr := ShuffleStudentIDs(contenders)
			if shuffleErr != nil {
				return LadderResult{}, shuffleErr
			}
			starts[shuffled[0]] = lane
			delete(available, lane)
		}
	}
	remainingStudents := make([]string, 0, len(ordered))
	for _, studentID := range ordered {
		if starts[studentID] == 0 {
			remainingStudents = append(remainingStudents, studentID)
		}
	}
	remainingLanes := make([]string, 0, len(available))
	for lane := range available {
		remainingLanes = append(remainingLanes, strconv.Itoa(lane))
	}
	remainingLanes, err = ShuffleStudentIDs(remainingLanes)
	if err != nil {
		return LadderResult{}, err
	}
	for index, studentID := range remainingStudents {
		lane, _ := strconv.Atoi(remainingLanes[index])
		starts[studentID] = lane
	}
	ends := make([]string, len(ordered))
	for index := range ordered {
		ends[index] = strconv.Itoa(index + 1)
	}
	ends, err = ShuffleStudentIDs(ends)
	if err != nil {
		return LadderResult{}, err
	}
	endByStudent := map[string]int{}
	for _, studentID := range ordered {
		endByStudent[studentID], _ = strconv.Atoi(ends[starts[studentID]-1])
	}
	winning, err := NextArrowTarget(ends, "", nil)
	if err != nil {
		return LadderResult{}, err
	}
	winningEnd, _ := strconv.Atoi(winning)
	result := LadderResult{LaneCount: len(ordered), WinningEnd: winningEnd, StartByStudent: starts, EndByStudent: endByStudent}
	for _, studentID := range ordered {
		if endByStudent[studentID] == winningEnd {
			result.WinnerID = studentID
			break
		}
	}
	if result.WinnerID == "" {
		return LadderResult{}, errors.New("사다리 승자를 결정하지 못했습니다")
	}
	return result, nil
}
