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
	// Fixed는 미리 모둠이 정해진 학생(모둠장) → 모둠 index입니다. 지망 배정에서 빠지고 옮겨지지 않습니다.
	Fixed map[string]int
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

	// 함께 넣을 학생 묶음: 묶음 중 한 명이 뽑히면 짝도 같은 모둠에 들어간다(교사 조건이 지망보다 우선, 사용자 결정 2026-11-08).
	unitOf := map[string][]string{}
	for _, unit := range togetherUnits(input.Students, input.Together) {
		for _, student := range unit {
			unitOf[student] = unit
		}
	}
	// 모둠장(고정 학생)을 먼저 넣고, 그 짝(함께 넣기)도 자리가 있으면 같은 모둠으로 데려온다.
	immovable := map[string]bool{}
	for student, unit := range unitOf {
		if len(unit) > 1 {
			immovable[student] = true
		}
	}
	pulled := make([][]string, groupCount)
	for _, student := range input.Students {
		group, ok := input.Fixed[student]
		if !ok || group < 0 || group >= groupCount {
			continue
		}
		place(student, group)
		immovable[student] = true
	}
	for _, student := range input.Students {
		group, ok := input.Fixed[student]
		if !ok || group < 0 || group >= groupCount {
			continue
		}
		for _, partner := range unitOf[student] {
			if _, done := assigned[partner]; done || remaining(group) <= 0 || conflicts(partner, group) > 0 {
				continue
			}
			place(partner, group)
			pulled[group] = append(pulled[group], partner)
		}
	}
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
				if _, done := assigned[student]; done { // 앞 모둠에서 짝을 따라 이미 들어감
					continue
				}
				unit := []string{}
				for _, member := range unitOf[student] {
					if _, done := assigned[member]; !done {
						unit = append(unit, member)
					}
				}
				if len(unit) == 0 {
					unit = []string{student}
				}
				if len(unit) > remaining(group) { // 묶음이 다 들어갈 자리가 없으면 다음 기회에 함께
					continue
				}
				blocked := false
				for i, member := range unit {
					if conflicts(member, group) > 0 {
						blocked = true
					}
					for _, other := range unit[i+1:] {
						if separate[pairKey(member, other)] {
							blocked = true
						}
					}
				}
				if blocked {
					continue
				}
				for _, member := range unit {
					place(member, group)
					round.Groups[group].Accepted = append(round.Groups[group].Accepted, member)
				}
			}
		}
		rounds = append(rounds, round)
	}

	// 마지막 빈자리 배정: 떨어진·미제출·미입장 학생을 남은 자리에 넣는다. 함께 넣을 학생은 한 묶음으로 다루고,
	// 여러 번 무작위로 넣어 본 뒤 조건 위반이 가장 적은 배치를 고른다(지망으로 들어간 학생은 움직이지 않음).
	final := Round{Label: "남은 자리", Groups: make([]RoundGroup, groupCount)}
	for group := range final.Groups {
		final.Groups[group].Accepted = append([]string{}, pulled[group]...)
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
	repairTogether(assigned, members, rounds, separate, input.Together, immovable, input.Fixed)
	repairSeparate(assigned, members, rounds, separate, immovable)
	for group := range rounds[len(rounds)-1].Groups {
		sort.Strings(rounds[len(rounds)-1].Groups[group].Accepted)
	}
	return assigned, rounds
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
