package groupsession

// 모둠장 블라인드 지명: 포트에서 고르기와 뱀 모양 순서입니다.

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
