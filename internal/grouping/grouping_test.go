package grouping

import (
	"strings"
	"testing"
)

func member(key, name string) Member { return Member{Key: key, Number: key, Name: name} }

func samplePlan() Plan {
	return Plan{
		Title: " 과학 실험 모둠 ", SourceKind: SourceCourse, SourceID: "roster1", SourceLabel: "2-3",
		Roles:    []string{" 모둠장 ", "기록", "모둠장", ""},
		Groups:   []Group{{Name: "", Members: []Member{member("1|가", "가"), member("2|나", "나")}}, {Name: "별모둠", Members: []Member{member("3|다", "다")}}},
		Excluded: []Member{{Key: "4|라", Number: "4", Name: "라", Role: "기록"}},
	}
}

func TestNormalisePlanCleans(t *testing.T) {
	plan, err := NormalisePlan(samplePlan())
	if err != nil {
		t.Fatal(err)
	}
	if plan.Title != "과학 실험 모둠" || len(plan.Roles) != 2 || plan.Groups[0].Name != "1모둠" || plan.Groups[1].Name != "별모둠" || plan.Excluded[0].Role != "" {
		t.Fatalf("정리 결과 %+v", plan)
	}
}

func TestNormalisePlanRejects(t *testing.T) {
	cases := map[string]func(*Plan){
		"두 모둠":     func(p *Plan) { p.Groups[1].Members = append(p.Groups[1].Members, member("1|가", "가")) },
		"함께 있습니다":  func(p *Plan) { p.Excluded = []Member{member("3|다", "다")} },
		"반을 골라":    func(p *Plan) { p.SourceID = " " },
		"반 종류":     func(p *Plan) { p.SourceKind = "기타" },
		"모둠이 없습니다": func(p *Plan) { p.Groups = nil },
		"한 명도":     func(p *Plan) { p.Groups = []Group{{Name: "1모둠"}} },
		"비어 있는":    func(p *Plan) { p.Groups[0].Members[0].Name = "" },
	}
	for want, edit := range cases {
		plan := samplePlan()
		edit(&plan)
		if _, err := NormalisePlan(plan); err == nil || !strings.Contains(err.Error(), want) {
			t.Fatalf("%q 오류를 기대했지만 %v", want, err)
		}
	}
}

func TestNormaliseRules(t *testing.T) {
	rules, err := NormaliseRules(Rules{SourceKind: SourceHomeroom, SourceID: "homeroom",
		Separate: []Pair{{A: "b", B: "a"}, {A: "a", B: "b"}, {A: "c", B: "c"}, {A: "", B: "d"}},
		Together: []Pair{{A: "c", B: "d"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(rules.Separate) != 1 || rules.Separate[0] != (Pair{A: "a", B: "b"}) || len(rules.Together) != 1 {
		t.Fatalf("조건 정리 %+v", rules)
	}
	if _, err := NormaliseRules(Rules{SourceKind: SourceHomeroom, SourceID: "homeroom", Separate: []Pair{{A: "a", B: "b"}}, Together: []Pair{{A: "b", B: "a"}}}); err == nil {
		t.Fatal("같은 두 학생의 반대 조건은 거부해야 합니다")
	}
}
