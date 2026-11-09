package groupsession

// 지망 배정 뒤 '같이 둘 학생'·'떨어뜨릴 학생' 조건을 맞추는 고치기 단계입니다.

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
