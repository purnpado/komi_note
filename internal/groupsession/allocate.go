// Package groupsession은 학생 참여형 모둠 편성 QR 회차(지망 배정)를 운영합니다.
// 회차 중 지망·닉네임·진행 기록은 메모리에만 두고, 결과는 교사가 모둠 편성 화면에서 확인한 뒤 저장합니다.
package groupsession

import (
	"crypto/rand"
	"encoding/binary"
	"sort"
)

// Pair는 교사 전용 조건 한 줄(두 학생의 key)입니다.
type Pair struct{ A, B string }

// RoundGroup은 한 라운드에서 한 모둠의 지원자 수와 들어간 학생입니다.
type RoundGroup struct {
	Applicants int      `json:"applicants"`
	Accepted   []string `json:"accepted"`
}

// Round는 지망 라운드(또는 마지막 빈자리 배정) 하나의 결과입니다.
type Round struct {
	Label  string       `json:"label"`
	Groups []RoundGroup `json:"groups"`
}

// AllocateInput은 배정 계산에 필요한 값입니다. key는 학생을 가리키는 값입니다.
type AllocateInput struct {
	Students   []string         // 배정할 모든 학생(입장하지 않은 학생 포함, 빠진 학생 제외)
	Capacities []int            // 모둠별 정원
	PrefIndex  map[string][]int // 학생 key → 지망 모둠 index(1지망부터)
	Separate   []Pair
	Together   []Pair
	Rounds     int // 지망 개수(1~3)
}

// randomIntn은 암호 난수로 0~n-1을 고릅니다(추첨 공정성).
var randomIntn = func(n int) int {
	if n <= 1 {
		return 0
	}
	var b [8]byte
	_, _ = rand.Read(b[:])
	return int(binary.LittleEndian.Uint64(b[:]) % uint64(n))
}

func shuffled(items []string) []string {
	result := append([]string(nil), items...)
	for i := len(result) - 1; i > 0; i-- {
		j := randomIntn(i + 1)
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func pairKey(a, b string) [2]string {
	if b < a {
		a, b = b, a
	}
	return [2]string{a, b}
}

// Allocate는 1지망부터 차례로 정원만큼 배정합니다. 정원보다 지원이 많으면 무작위 추첨하고,
// '넣지 않을 학생' 조건에 걸리는 지원자는 그 라운드에서 조용히 다음 지망으로 넘깁니다.
// 마지막에 남은 학생(떨어짐·미제출·미입장)은 빈자리에 무작위로 넣되 조건을 최대한 지킵니다.
// 돌려주는 값: 학생 key → 모둠 index, 라운드 기록.
func Allocate(input AllocateInput) (map[string]int, []Round) {
	groupCount := len(input.Capacities)
	assigned := map[string]int{}
	members := make([][]string, groupCount)
	separate := map[[2]string]bool{}
	for _, pair := range input.Separate {
		separate[pairKey(pair.A, pair.B)] = true
	}
	partners := map[string][]string{}
	for _, pair := range input.Together {
		partners[pair.A] = append(partners[pair.A], pair.B)
		partners[pair.B] = append(partners[pair.B], pair.A)
	}
	conflicts := func(student string, group int) int {
		count := 0
		for _, other := range members[group] {
			if separate[pairKey(student, other)] {
				count++
			}
		}
		return count
	}
	place := func(student string, group int) {
		assigned[student] = group
		members[group] = append(members[group], student)
	}
	remaining := func(group int) int { return input.Capacities[group] - len(members[group]) }

	rounds := []Round{}
	inRoster := map[string]bool{}
	for _, student := range input.Students {
		inRoster[student] = true
	}
	for priority := 0; priority < input.Rounds; priority++ {
		round := Round{Label: roundLabel(priority), Groups: make([]RoundGroup, groupCount)}
		applicants := make([][]string, groupCount)
		for _, student := range input.Students {
			if _, done := assigned[student]; done {
				continue
			}
			prefs := input.PrefIndex[student]
			if priority >= len(prefs) {
				continue
			}
			group := prefs[priority]
			if group < 0 || group >= groupCount {
				continue
			}
			applicants[group] = append(applicants[group], student)
		}
		for group := 0; group < groupCount; group++ {
			round.Groups[group].Applicants = len(applicants[group])
			round.Groups[group].Accepted = []string{}
			for _, student := range shuffled(applicants[group]) {
				if remaining(group) <= 0 {
					break
				}
				if conflicts(student, group) > 0 {
					continue
				}
				place(student, group)
				round.Groups[group].Accepted = append(round.Groups[group].Accepted, student)
			}
		}
		rounds = append(rounds, round)
	}

	// 마지막 빈자리 배정: 떨어진·미제출·미입장 학생을 남은 자리에 넣는다. 함께 넣을 학생은 한 묶음으로 다루고,
	// 여러 번 무작위로 넣어 본 뒤 조건 위반이 가장 적은 배치를 고른다(지망으로 들어간 학생은 움직이지 않음).
	final := Round{Label: "남은 자리", Groups: make([]RoundGroup, groupCount)}
	for group := range final.Groups {
		final.Groups[group].Accepted = []string{}
	}
	left := []string{}
	for _, student := range input.Students {
		if _, done := assigned[student]; !done {
			left = append(left, student)
		}
	}
	units := togetherUnits(left, input.Together)
	baseMembers := make([][]string, groupCount)
	for group := range members {
		baseMembers[group] = append([]string(nil), members[group]...)
	}
	var bestPlacement map[string]int
	bestScore := 1 << 30
	for attempt := 0; attempt < 200 && len(left) > 0; attempt++ {
		trial := make([][]string, groupCount)
		for group := range baseMembers {
			trial[group] = append([]string(nil), baseMembers[group]...)
		}
		placement := map[string]int{}
		order := shuffledUnits(units)
		sort.SliceStable(order, func(i, j int) bool { return len(order[i]) > len(order[j]) })
		for _, unit := range order {
			best, bestCost := -1, 1<<30
			for _, group := range shuffledIndexes(groupCount) {
				room := input.Capacities[group] - len(trial[group])
				if room <= 0 {
					continue
				}
				cost := 0
				if room < len(unit) {
					cost += 500 * (len(unit) - room) // 묶음이 다 안 들어가면 일부가 넘침
				}
				for _, student := range unit {
					for _, other := range trial[group] {
						if separate[pairKey(student, other)] {
							cost += 1000
						}
					}
					for _, partner := range partners[student] {
						if g, ok := assigned[partner]; ok && g != group {
							cost += 100
						}
					}
				}
				if cost < bestCost {
					best, bestCost = group, cost
				}
			}
			for _, student := range unit {
				group := best
				if group < 0 || len(trial[group]) >= input.Capacities[group] {
					group = -1
					for _, g := range shuffledIndexes(groupCount) {
						if len(trial[g]) < input.Capacities[g] {
							group = g
							break
						}
					}
					if group < 0 {
						group = 0
					}
				}
				trial[group] = append(trial[group], student)
				placement[student] = group
			}
		}
		score := 0
		for group := range trial {
			for i := 0; i < len(trial[group]); i++ {
				for j := i + 1; j < len(trial[group]); j++ {
					if separate[pairKey(trial[group][i], trial[group][j])] {
						score += 1000
					}
				}
			}
		}
		where := func(student string) int {
			if g, ok := placement[student]; ok {
				return g
			}
			return assigned[student]
		}
		for _, pair := range input.Together {
			if inRoster[pair.A] && inRoster[pair.B] && where(pair.A) != where(pair.B) {
				score += 100
			}
		}
		if score < bestScore {
			bestScore, bestPlacement = score, placement
			if score == 0 {
				break
			}
		}
	}
	for _, student := range left {
		group := bestPlacement[student]
		place(student, group)
		final.Groups[group].Accepted = append(final.Groups[group].Accepted, student)
	}
	rounds = append(rounds, final)
	repairSeparate(assigned, members, rounds, separate)
	for group := range rounds[len(rounds)-1].Groups {
		sort.Strings(rounds[len(rounds)-1].Groups[group].Accepted)
	}
	return assigned, rounds
}

// repairSeparate는 앞 라운드가 다른 모둠을 채워 '넣지 않을 학생'끼리 남은 자리에서 만날 수밖에 없을 때,
// 그 학생을 다른 모둠 학생과 맞바꿔 조건을 지킵니다. 맞바꿀 학생은 남은 자리로 들어온 학생,
// 그다음 늦은 지망으로 들어온 학생을 먼저 고릅니다. 옮긴 두 학생은 라운드 기록에서 "남은 자리"로 옮겨
// 전자칠판 공개가 실제 결과와 어긋나지 않게 합니다.
func repairSeparate(assigned map[string]int, members [][]string, rounds []Round, separate map[[2]string]bool) {
	if len(separate) == 0 {
		return
	}
	roundOf := map[string]int{}
	for r, round := range rounds {
		for _, group := range round.Groups {
			for _, student := range group.Accepted {
				roundOf[student] = r
			}
		}
	}
	conflictsIn := func(student string, group int, except string) bool {
		for _, other := range members[group] {
			if other != student && other != except && separate[pairKey(student, other)] {
				return true
			}
		}
		return false
	}
	removeFrom := func(list []string, value string) []string {
		result := list[:0]
		for _, item := range list {
			if item != value {
				result = append(result, item)
			}
		}
		return result
	}
	last := len(rounds) - 1
	moveRecord := func(student string, group int) {
		r := roundOf[student]
		for g := range rounds[r].Groups {
			rounds[r].Groups[g].Accepted = removeFrom(rounds[r].Groups[g].Accepted, student)
		}
		rounds[last].Groups[group].Accepted = append(rounds[last].Groups[group].Accepted, student)
		roundOf[student] = last
	}
	for pass := 0; pass < 100; pass++ {
		var mover string
		group := -1
		for g := range members {
			for i := 0; i < len(members[g]) && mover == ""; i++ {
				for j := i + 1; j < len(members[g]); j++ {
					a, b := members[g][i], members[g][j]
					if separate[pairKey(a, b)] {
						mover, group = a, g
						if roundOf[b] > roundOf[a] {
							mover = b
						}
						break
					}
				}
			}
			if mover != "" {
				break
			}
		}
		if mover == "" {
			return
		}
		bestPartner, bestGroup, bestRank := "", -1, -1
		for h := range members {
			if h == group || conflictsIn(mover, h, "") {
				continue
			}
			for _, candidate := range members[h] {
				if conflictsIn(mover, h, candidate) || conflictsIn(candidate, group, mover) {
					continue
				}
				if rank := roundOf[candidate]; rank > bestRank {
					bestPartner, bestGroup, bestRank = candidate, h, rank
				}
			}
		}
		if bestPartner == "" {
			return // 맞바꿀 수 없으면 그대로 두고 교사 화면 경고에 맡긴다
		}
		members[group] = removeFrom(members[group], mover)
		members[bestGroup] = removeFrom(members[bestGroup], bestPartner)
		members[group] = append(members[group], bestPartner)
		members[bestGroup] = append(members[bestGroup], mover)
		assigned[mover], assigned[bestPartner] = bestGroup, group
		moveRecord(mover, bestGroup)
		moveRecord(bestPartner, group)
	}
}

// togetherUnits는 함께 넣을 학생끼리 묶음을 만듭니다(남은 학생 안에서만).
func togetherUnits(left []string, together []Pair) [][]string {
	parent := map[string]string{}
	for _, student := range left {
		parent[student] = student
	}
	var find func(string) string
	find = func(key string) string {
		if parent[key] == key {
			return key
		}
		parent[key] = find(parent[key])
		return parent[key]
	}
	for _, pair := range together {
		if _, ok := parent[pair.A]; !ok {
			continue
		}
		if _, ok := parent[pair.B]; !ok {
			continue
		}
		parent[find(pair.A)] = find(pair.B)
	}
	groups := map[string][]string{}
	order := []string{}
	for _, student := range left {
		root := find(student)
		if _, ok := groups[root]; !ok {
			order = append(order, root)
		}
		groups[root] = append(groups[root], student)
	}
	result := make([][]string, 0, len(order))
	for _, root := range order {
		result = append(result, groups[root])
	}
	return result
}

func shuffledUnits(units [][]string) [][]string {
	result := append([][]string(nil), units...)
	for i := len(result) - 1; i > 0; i-- {
		j := randomIntn(i + 1)
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func shuffledIndexes(n int) []int {
	result := make([]int, n)
	for i := range result {
		result[i] = i
	}
	for i := n - 1; i > 0; i-- {
		j := randomIntn(i + 1)
		result[i], result[j] = result[j], result[i]
	}
	return result
}

func roundLabel(priority int) string {
	return []string{"1지망", "2지망", "3지망"}[priority]
}

// Capacities는 학생 수를 모둠 수로 나눠 인원 차이가 1명 이하가 되게 정원을 정합니다.
func Capacities(total, groups int) []int {
	if groups <= 0 {
		return nil
	}
	result := make([]int, groups)
	for i := range result {
		result[i] = total / groups
		if i < total%groups {
			result[i]++
		}
	}
	return result
}
