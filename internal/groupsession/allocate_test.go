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
