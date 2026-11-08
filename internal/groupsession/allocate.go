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

// repairTogether는 앞 라운드가 자리를 채워 '함께 넣을 학생'이 갈라졌을 때, 한 명을 짝의 모둠 학생(묶음이 아닌 학생)과
// 맞바꿔 다시 모읍니다. '넣지 않기' 조건을 새로 어기는 맞바꿈은 하지 않습니다. 옮긴 학생은 라운드 기록에서 "남은 자리"로 옮깁니다.
func repairTogether(assigned map[string]int, members [][]string, rounds []Round, separate map[[2]string]bool, together []Pair, immovable map[string]bool, fixed map[string]int) {
	if len(together) == 0 {
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
	last := len(rounds) - 1
	removeFrom := func(list []string, value string) []string {
		result := list[:0]
		for _, item := range list {
			if item != value {
				result = append(result, item)
			}
		}
		return result
	}
	conflictsIn := func(student string, group int, except string) bool {
		for _, other := range members[group] {
			if other != student && other != except && separate[pairKey(student, other)] {
				return true
			}
		}
		return false
	}
	moveRecord := func(student string, group int) {
		r := roundOf[student]
		for g := range rounds[r].Groups {
			rounds[r].Groups[g].Accepted = removeFrom(rounds[r].Groups[g].Accepted, student)
		}
		rounds[last].Groups[group].Accepted = append(rounds[last].Groups[group].Accepted, student)
		roundOf[student] = last
	}
	for pass := 0; pass < 100; pass++ {
		changed := false
		for _, pair := range together {
			ga, okA := assigned[pair.A]
			gb, okB := assigned[pair.B]
			if !okA || !okB || ga == gb {
				continue
			}
			// 늦게 들어온 쪽(라운드가 뒤인 학생)을 짝의 모둠으로 옮긴다. 안 되면 반대로 시도한다.
			type move struct {
				student  string
				from, to int
			}
			tries := []move{{pair.B, gb, ga}, {pair.A, ga, gb}}
			if roundOf[pair.A] > roundOf[pair.B] {
				tries[0], tries[1] = tries[1], tries[0]
			}
			for _, try := range tries {
				mover, from, to := try.student, try.from, try.to
				if _, isFixed := fixed[mover]; isFixed || conflictsIn(mover, to, "") {
					continue
				}
				best, bestRank := "", -1
				for _, candidate := range members[to] {
					if immovable[candidate] || conflictsIn(mover, to, candidate) || conflictsIn(candidate, from, mover) {
						continue
					}
					if roundOf[candidate] > bestRank {
						best, bestRank = candidate, roundOf[candidate]
					}
				}
				if best == "" {
					continue
				}
				members[from] = removeFrom(members[from], mover)
				members[to] = removeFrom(members[to], best)
				members[from] = append(members[from], best)
				members[to] = append(members[to], mover)
				assigned[mover], assigned[best] = to, from
				moveRecord(mover, to)
				moveRecord(best, from)
				changed = true
				break
			}
		}
		if !changed {
			return
		}
	}
}

// repairSeparate는 앞 라운드가 다른 모둠을 채워 '넣지 않을 학생'끼리 남은 자리에서 만날 수밖에 없을 때,
// 그 학생을 다른 모둠 학생과 맞바꿔 조건을 지킵니다. 맞바꿀 학생은 남은 자리로 들어온 학생,
// 그다음 늦은 지망으로 들어온 학생을 먼저 고릅니다. 옮긴 두 학생은 라운드 기록에서 "남은 자리"로 옮겨
// 전자칠판 공개가 실제 결과와 어긋나지 않게 합니다.
func repairSeparate(assigned map[string]int, members [][]string, rounds []Round, separate map[[2]string]bool, immovable map[string]bool) {
	inUnit := func(student string) bool { return immovable[student] }
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
						if inUnit(a) || (!inUnit(b) && roundOf[b] > roundOf[a]) {
							mover = b
						}
						if inUnit(mover) {
							mover = "" // 둘 다 묶음 학생이면 옮기지 않고 교사 화면 경고에 맡긴다
							continue
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
				if inUnit(candidate) {
					continue
				}
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

// PickInput은 블라인드 지명에서 카드 한 장을 뒤집을 때 필요한 값입니다.
type PickInput struct {
	Pot      []string   // 이 포트에 남은 학생
	Group    int        // 고르는 모둠
	Members  [][]string // 지금까지 모둠별 학생(모둠장 포함)
	Separate []Pair
	Together []Pair
	// Later는 이번 라운드에서 이 모둠 다음에 고를 모둠들(차례 순서)입니다. 남은 카드로 이 모둠들도
	// '넣지 않기'를 어기지 않고 받을 수 있는 학생을 우선하기 위해 씁니다.
	Later []int
}

// PickFromPot은 카드를 뒤집는 순간 그 포트에 남은 학생 중 한 명을 고릅니다. 카드 번호와 학생은 미리
// 연결되지 않으므로(잘 섞은 카드 더미와 같은 공정성), 교사 조건을 지키면서도 누가 남았는지·왜 그 카드를
// 못 고르는지 드러나지 않습니다. 넣지 않을 학생이 있는 모둠은 피하고, 함께 넣을 짝이 이 모둠에 있으면
// 그 학생을, 다른 모둠에 있으면 다른 학생을 우선합니다. 같은 점수끼리는 무작위입니다.
func PickFromPot(input PickInput) string {
	if len(input.Pot) == 0 {
		return ""
	}
	separate := map[[2]string]bool{}
	for _, pair := range input.Separate {
		separate[pairKey(pair.A, pair.B)] = true
	}
	groupOf := map[string]int{}
	for g, list := range input.Members {
		for _, student := range list {
			groupOf[student] = g
		}
	}
	partners := map[string][]string{}
	for _, pair := range input.Together {
		partners[pair.A] = append(partners[pair.A], pair.B)
		partners[pair.B] = append(partners[pair.B], pair.A)
	}
	best := []string{}
	bestScore := 1 << 30
	for _, student := range input.Pot {
		score := 0
		if input.Group >= 0 && input.Group < len(input.Members) {
			for _, other := range input.Members[input.Group] {
				if separate[pairKey(student, other)] {
					score += 1000
				}
			}
		}
		for _, partner := range partners[student] {
			if g, ok := groupOf[partner]; ok {
				if g == input.Group {
					score -= 100
				} else {
					score += 100
				}
			}
		}
		// 이 학생을 이 모둠에 넣으면 이번 라운드의 다음 모둠들이 막다른 카드만 받게 되는지 미리 본다.
		if !laterGroupsCanPick(input, student, separate) {
			score += 500
		}
		if score < bestScore {
			best, bestScore = []string{student}, score
		} else if score == bestScore {
			best = append(best, student)
		}
	}
	return best[randomIntn(len(best))]
}

// laterGroupsCanPick은 student를 뺀 남은 포트로, 이번 라운드에서 고를 다음 모둠들이 각각 '넣지 않기'에 걸리지 않는
// 서로 다른 학생을 받을 수 있는지(이분 매칭) 확인합니다.
func laterGroupsCanPick(input PickInput, student string, separate map[[2]string]bool) bool {
	rest := []string{}
	for _, other := range input.Pot {
		if other != student {
			rest = append(rest, other)
		}
	}
	picking := input.Later
	if len(picking) > len(rest) {
		picking = picking[:len(rest)]
	}
	if len(picking) == 0 || len(separate) == 0 {
		return true
	}
	allowed := func(group int, candidate string) bool {
		if group < 0 || group >= len(input.Members) {
			return true
		}
		for _, member := range input.Members[group] {
			if separate[pairKey(candidate, member)] {
				return false
			}
		}
		return true
	}
	owner := make([]int, len(rest)) // 학생 index → 맡은 picking index(+1), 0이면 없음
	var try func(g int, seen []bool) bool
	try = func(g int, seen []bool) bool {
		for c, candidate := range rest {
			if seen[c] || !allowed(picking[g], candidate) {
				continue
			}
			seen[c] = true
			if owner[c] == 0 || try(owner[c]-1, seen) {
				owner[c] = g + 1
				return true
			}
		}
		return false
	}
	for g := range picking {
		if !try(g, make([]bool, len(rest))) {
			return false
		}
	}
	return true
}

// SnakeOrder는 라운드(포트) 번호에 따른 지명 순서입니다. 짝수 라운드는 기본 순서, 홀수 라운드는 거꾸로.
func SnakeOrder(base []int, round int) []int {
	order := append([]int(nil), base...)
	if round%2 == 1 {
		for i, j := 0, len(order)-1; i < j; i, j = i+1, j-1 {
			order[i], order[j] = order[j], order[i]
		}
	}
	return order
}
