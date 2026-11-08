package groupsession

import (
	"fmt"
	"testing"
)

func students(n int) []string {
	result := make([]string, n)
	for i := range result {
		result[i] = fmt.Sprintf("s%02d", i+1)
	}
	return result
}

func check(t *testing.T, input AllocateInput, assigned map[string]int) {
	t.Helper()
	if len(assigned) != len(input.Students) {
		t.Fatalf("배정 %d명, 기대 %d명", len(assigned), len(input.Students))
	}
	counts := make([]int, len(input.Capacities))
	for _, group := range assigned {
		counts[group]++
	}
	for group, count := range counts {
		if count != input.Capacities[group] {
			t.Fatalf("%d모둠 %d명, 정원 %d", group+1, count, input.Capacities[group])
		}
	}
}

func TestCapacities(t *testing.T) {
	got := Capacities(25, 6)
	if fmt.Sprint(got) != "[5 4 4 4 4 4]" {
		t.Fatal(got)
	}
}

func TestAllocateFirstChoiceWhenRoom(t *testing.T) {
	list := students(8)
	prefs := map[string][]int{}
	for i, s := range list {
		prefs[s] = []int{i % 2, (i + 1) % 2}
	}
	input := AllocateInput{Students: list, Capacities: Capacities(8, 2), PrefIndex: prefs, Rounds: 2}
	assigned, rounds := Allocate(input)
	check(t, input, assigned)
	for i, s := range list {
		if assigned[s] != i%2 {
			t.Fatalf("%s는 1지망에 들어가야 합니다", s)
		}
	}
	if len(rounds) != 3 || rounds[0].Groups[0].Applicants != 4 || len(rounds[2].Groups[0].Accepted) != 0 {
		t.Fatalf("라운드 기록 %+v", rounds)
	}
}

func TestAllocateOversubscribedUsesLotteryThenNextChoice(t *testing.T) {
	list := students(12)
	prefs := map[string][]int{}
	for _, s := range list {
		prefs[s] = []int{0, 1, 2} // 모두 1모둠을 1지망
	}
	input := AllocateInput{Students: list, Capacities: Capacities(12, 3), PrefIndex: prefs, Rounds: 3}
	assigned, rounds := Allocate(input)
	check(t, input, assigned)
	if rounds[0].Groups[0].Applicants != 12 || len(rounds[0].Groups[0].Accepted) != 4 {
		t.Fatalf("1지망 추첨 %+v", rounds[0].Groups[0])
	}
	if rounds[1].Groups[1].Applicants != 8 || len(rounds[1].Groups[1].Accepted) != 4 || len(rounds[2].Groups[2].Accepted) != 4 {
		t.Fatalf("2·3지망 라운드 %+v", rounds)
	}
}

func TestAllocateLotteryIsNotAlwaysSame(t *testing.T) {
	list := students(10)
	prefs := map[string][]int{}
	for _, s := range list {
		prefs[s] = []int{0}
	}
	winners := map[string]bool{}
	for i := 0; i < 30; i++ {
		assigned, _ := Allocate(AllocateInput{Students: list, Capacities: Capacities(10, 2), PrefIndex: prefs, Rounds: 1})
		for s, g := range assigned {
			if g == 0 {
				winners[s] = true
			}
		}
	}
	if len(winners) < 8 {
		t.Fatalf("추첨이 한쪽으로 치우칩니다: %d명만 당첨", len(winners))
	}
}

func TestAllocateKeepsSeparateAndFillsMissing(t *testing.T) {
	list := students(12)
	prefs := map[string][]int{}
	for i, s := range list[:8] { // 4명은 미제출
		prefs[s] = []int{i % 3}
	}
	prefs["s01"] = []int{0}
	prefs["s02"] = []int{0}
	separate := []Pair{{A: "s01", B: "s02"}, {A: "s03", B: "s09"}}
	together := []Pair{{A: "s10", B: "s11"}}
	for i := 0; i < 50; i++ {
		input := AllocateInput{Students: list, Capacities: Capacities(12, 3), PrefIndex: prefs, Separate: separate, Together: together, Rounds: 1}
		assigned, rounds := Allocate(input)
		check(t, input, assigned)
		if assigned["s01"] == assigned["s02"] || assigned["s03"] == assigned["s09"] {
			t.Fatalf("넣지 않을 학생이 같은 모둠: %v", assigned)
		}
		if len(rounds) != 2 || rounds[1].Label != "남은 자리" {
			t.Fatalf("라운드 %+v", rounds)
		}
	}
}

func TestAllocateTogetherInFinalFill(t *testing.T) {
	list := students(9)
	for i := 0; i < 30; i++ {
		input := AllocateInput{Students: list, Capacities: Capacities(9, 3), PrefIndex: map[string][]int{}, Together: []Pair{{A: "s01", B: "s02"}}, Rounds: 2}
		assigned, _ := Allocate(input)
		check(t, input, assigned)
		if assigned["s01"] != assigned["s02"] {
			t.Fatalf("함께 넣을 학생이 갈라짐: %v", assigned)
		}
	}
}

// 함께 넣기는 학생 지망보다 우선한다: 짝이 서로 다른 모둠을 지망해도 같은 모둠에 들어간다.
func TestAllocateTogetherBeatsPreferences(t *testing.T) {
	list := students(12)
	for i := 0; i < 50; i++ {
		prefs := map[string][]int{}
		for j, s := range list {
			prefs[s] = []int{j % 3, (j + 1) % 3}
		}
		prefs["s01"] = []int{0, 1}
		prefs["s02"] = []int{2, 1} // 짝과 다른 1지망
		input := AllocateInput{Students: list, Capacities: Capacities(12, 3), PrefIndex: prefs,
			Together: []Pair{{A: "s01", B: "s02"}}, Separate: []Pair{{A: "s01", B: "s03"}}, Rounds: 2}
		assigned, rounds := Allocate(input)
		check(t, input, assigned)
		if assigned["s01"] != assigned["s02"] {
			t.Fatalf("함께 넣을 학생이 갈라짐: %v", assigned)
		}
		if assigned["s01"] == assigned["s03"] {
			t.Fatalf("넣지 않을 학생이 같은 모둠: %v", assigned)
		}
		recorded := map[string]int{}
		for _, round := range rounds {
			for g, group := range round.Groups {
				for _, s := range group.Accepted {
					if _, dup := recorded[s]; dup {
						t.Fatalf("%s가 라운드 기록에 두 번 있습니다", s)
					}
					recorded[s] = g
				}
			}
		}
		for s, g := range assigned {
			if recorded[s] != g {
				t.Fatalf("라운드 기록과 결과가 다릅니다: %s %d/%d", s, recorded[s], g)
			}
		}
	}
}

// 모둠장(고정 학생)은 지망 배정에서 빠지고 자기 모둠에 남으며, 함께 넣을 짝은 모둠장 모둠으로 온다.
func TestAllocateWithFixedLeaders(t *testing.T) {
	list := students(12)
	for i := 0; i < 30; i++ {
		prefs := map[string][]int{}
		for _, s := range list {
			prefs[s] = []int{0, 1, 2} // 모두 1모둠 1지망
		}
		input := AllocateInput{Students: list, Capacities: Capacities(12, 3), PrefIndex: prefs, Rounds: 3,
			Fixed:    map[string]int{"s01": 0, "s02": 1, "s03": 2},
			Together: []Pair{{A: "s02", B: "s09"}}, Separate: []Pair{{A: "s01", B: "s10"}}}
		assigned, rounds := Allocate(input)
		check(t, input, assigned)
		if assigned["s01"] != 0 || assigned["s02"] != 1 || assigned["s03"] != 2 {
			t.Fatalf("모둠장이 자기 모둠을 벗어남: %v", assigned)
		}
		if assigned["s09"] != 1 || assigned["s10"] == 0 {
			t.Fatalf("모둠장 조건 위반: %v", assigned)
		}
		for _, round := range rounds {
			for _, group := range round.Groups {
				for _, s := range group.Accepted {
					if s == "s01" || s == "s02" || s == "s03" {
						t.Fatal("모둠장이 라운드 기록에 들어 있으면 안 됩니다(공개 전까지 숨김)")
					}
				}
			}
		}
		if rounds[0].Groups[0].Applicants != 8 { // 12명 - 모둠장 3명 - 모둠장 짝으로 먼저 들어간 1명
			t.Fatalf("모둠장은 지원자로 세지 않습니다: %d", rounds[0].Groups[0].Applicants)
		}
	}
}

func TestPickFromPotRespectsRules(t *testing.T) {
	members := [][]string{{"L1", "a"}, {"L2"}, {"L3", "b"}}
	for i := 0; i < 50; i++ {
		got := PickFromPot(PickInput{Pot: []string{"x", "y", "z"}, Group: 0, Members: members,
			Separate: []Pair{{A: "x", B: "a"}}, Together: []Pair{{A: "z", B: "b"}}})
		if got != "y" {
			t.Fatalf("넣지 않기(x)와 다른 모둠 짝(z)을 피해야 합니다: %s", got)
		}
		got = PickFromPot(PickInput{Pot: []string{"x", "y", "z"}, Group: 2, Members: members, Together: []Pair{{A: "z", B: "b"}}})
		if got != "z" {
			t.Fatalf("짝이 있는 모둠이면 그 학생을 골라야 합니다: %s", got)
		}
	}
	seen := map[string]bool{}
	for i := 0; i < 60; i++ {
		seen[PickFromPot(PickInput{Pot: []string{"x", "y", "z"}, Group: 1, Members: members})] = true
	}
	if len(seen) != 3 {
		t.Fatalf("조건이 없으면 고르게 뽑혀야 합니다: %v", seen)
	}
	if fmt.Sprint(SnakeOrder([]int{2, 0, 1}, 0)) != "[2 0 1]" || fmt.Sprint(SnakeOrder([]int{2, 0, 1}, 1)) != "[1 0 2]" {
		t.Fatal("뱀 순서")
	}
}

// 다음 모둠이 막다른 카드만 받게 되지 않도록 미리 피한다: 모둠 0이 x를 가져가면 모둠 1(a 소속)은 y밖에 못 받는데
// y는 a와 넣지 않기라 막힌다. 그래서 모둠 0은 y를 받아야 한다.
func TestPickFromPotLooksAhead(t *testing.T) {
	members := [][]string{{"L1"}, {"L2", "a"}}
	for i := 0; i < 50; i++ {
		got := PickFromPot(PickInput{Pot: []string{"x", "y"}, Group: 0, Members: members, Separate: []Pair{{A: "y", B: "a"}}, Later: []int{1}})
		if got != "y" {
			t.Fatalf("다음 모둠이 막히지 않게 y를 골라야 합니다: %s", got)
		}
	}
}
