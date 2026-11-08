// Package grouping은 수업 반·담임 학급의 모둠 편성 이력과 교사 전용 편성 조건의
// 입력 정리와 검사 규칙을 담당합니다. 저장은 vault 패키지가 암호화 보관함에 합니다.
// 학생은 번호·이름과 가리키는 값(Key)만 다루며 성적·연락처는 사용하지 않습니다.
package grouping

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	// SourceHomeroom은 담임 학급(학생 명렬) 편성입니다.
	SourceHomeroom = "homeroom"
	// SourceCourse는 수업 명렬 편성입니다.
	SourceCourse = "course"

	maxGroups   = 30
	maxMembers  = 80
	maxRoles    = 8
	maxPlans    = 300
	maxPairs    = 100
	maxTitle    = 60
	maxText     = 30
	maxSourceID = 80
)

// Member는 모둠에 들어간 학생 한 명입니다.
type Member struct {
	Key    string `json:"key"`
	Number string `json:"number"`
	Name   string `json:"name"`
	Role   string `json:"role"`
}

// Group은 모둠 하나입니다.
type Group struct {
	Name    string   `json:"name"`
	Members []Member `json:"members"`
}

// Plan은 한 번의 모둠 편성 결과(이력)입니다.
type Plan struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	SourceKind  string   `json:"sourceKind"`
	SourceID    string   `json:"sourceId"`
	SourceLabel string   `json:"sourceLabel"`
	Roles       []string `json:"roles"`
	Groups      []Group  `json:"groups"`
	Excluded    []Member `json:"excluded"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

// Pair는 두 학생을 가리키는 조건 한 줄입니다.
type Pair struct {
	A string `json:"a"`
	B string `json:"b"`
}

// Rules는 반별 교사 전용 편성 조건입니다. 전자칠판·인쇄에는 보내지 않습니다.
type Rules struct {
	SourceKind    string `json:"sourceKind"`
	SourceID      string `json:"sourceId"`
	Separate      []Pair `json:"separate"`
	Together      []Pair `json:"together"`
	AvoidRepeat   bool   `json:"avoidRepeat"`
	RolesTemplate string `json:"rolesTemplate"`
}

// Book은 보관함에 저장되는 모둠 편성 전체입니다.
type Book struct {
	Plans []Plan  `json:"plans"`
	Rules []Rules `json:"rules"`
}

func clip(value string, limit int) string {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) <= limit {
		return value
	}
	return string([]rune(value)[:limit])
}

func validSource(kind, id string) error {
	if kind != SourceHomeroom && kind != SourceCourse {
		return errors.New("모둠을 만들 반 종류가 올바르지 않습니다")
	}
	if strings.TrimSpace(id) == "" {
		return errors.New("모둠을 만들 반을 골라 주세요")
	}
	return nil
}

func normaliseMember(member Member) (Member, error) {
	member.Key = clip(member.Key, 120)
	member.Number = clip(member.Number, 10)
	member.Name = clip(member.Name, maxText)
	member.Role = clip(member.Role, maxText)
	if member.Key == "" || member.Name == "" {
		return Member{}, errors.New("학생 정보가 비어 있는 칸이 있습니다. 다시 편성해 주세요")
	}
	return member, nil
}

// NormalisePlan은 편성 결과를 정리하고 잘못된 값이면 교사가 이해할 수 있는 오류를 돌려줍니다.
func NormalisePlan(plan Plan) (Plan, error) {
	plan.SourceKind = strings.TrimSpace(plan.SourceKind)
	plan.SourceID = clip(plan.SourceID, maxSourceID)
	if err := validSource(plan.SourceKind, plan.SourceID); err != nil {
		return Plan{}, err
	}
	plan.SourceLabel = clip(plan.SourceLabel, maxText)
	plan.Title = clip(plan.Title, maxTitle)
	if plan.Title == "" {
		plan.Title = "모둠 편성"
	}
	roles := make([]string, 0, len(plan.Roles))
	seenRoles := map[string]bool{}
	for _, role := range plan.Roles {
		role = clip(role, maxText)
		if role == "" || seenRoles[role] {
			continue
		}
		seenRoles[role] = true
		roles = append(roles, role)
	}
	if len(roles) > maxRoles {
		return Plan{}, fmt.Errorf("역할은 %d개까지 정할 수 있습니다", maxRoles)
	}
	plan.Roles = roles

	if len(plan.Groups) == 0 {
		return Plan{}, errors.New("모둠이 없습니다. 먼저 모둠을 만들어 주세요")
	}
	if len(plan.Groups) > maxGroups {
		return Plan{}, fmt.Errorf("모둠은 %d개까지 만들 수 있습니다", maxGroups)
	}
	seen := map[string]bool{}
	total := 0
	groups := make([]Group, 0, len(plan.Groups))
	for index, group := range plan.Groups {
		group.Name = clip(group.Name, maxText)
		if group.Name == "" {
			group.Name = fmt.Sprintf("%d모둠", index+1)
		}
		members := make([]Member, 0, len(group.Members))
		for _, member := range group.Members {
			member, err := normaliseMember(member)
			if err != nil {
				return Plan{}, err
			}
			if seen[member.Key] {
				return Plan{}, fmt.Errorf("%s 학생이 두 모둠에 들어 있습니다", member.Name)
			}
			seen[member.Key] = true
			members = append(members, member)
		}
		total += len(members)
		group.Members = members
		groups = append(groups, group)
	}
	if total == 0 {
		return Plan{}, errors.New("모둠에 학생이 한 명도 없습니다")
	}
	if total > maxMembers {
		return Plan{}, fmt.Errorf("한 번에 %d명까지 편성할 수 있습니다", maxMembers)
	}
	plan.Groups = groups

	excluded := make([]Member, 0, len(plan.Excluded))
	for _, member := range plan.Excluded {
		member, err := normaliseMember(member)
		if err != nil {
			return Plan{}, err
		}
		if seen[member.Key] {
			return Plan{}, fmt.Errorf("%s 학생이 모둠과 빠진 학생 목록에 함께 있습니다", member.Name)
		}
		seen[member.Key] = true
		member.Role = ""
		excluded = append(excluded, member)
	}
	plan.Excluded = excluded
	return plan, nil
}

// NormaliseRules는 반별 편성 조건을 정리합니다. 같은 학생끼리의 조건·중복 조건은 지웁니다.
func NormaliseRules(rules Rules) (Rules, error) {
	rules.SourceKind = strings.TrimSpace(rules.SourceKind)
	rules.SourceID = clip(rules.SourceID, maxSourceID)
	if err := validSource(rules.SourceKind, rules.SourceID); err != nil {
		return Rules{}, err
	}
	rules.RolesTemplate = clip(rules.RolesTemplate, 120)
	clean := func(pairs []Pair, label string) ([]Pair, error) {
		if len(pairs) > maxPairs {
			return nil, fmt.Errorf("%s 조건은 %d개까지 둘 수 있습니다", label, maxPairs)
		}
		result := make([]Pair, 0, len(pairs))
		seen := map[[2]string]bool{}
		for _, pair := range pairs {
			a, b := clip(pair.A, 120), clip(pair.B, 120)
			if a == "" || b == "" || a == b {
				continue
			}
			if b < a {
				a, b = b, a
			}
			key := [2]string{a, b}
			if seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, Pair{A: a, B: b})
		}
		sort.Slice(result, func(i, j int) bool {
			if result[i].A != result[j].A {
				return result[i].A < result[j].A
			}
			return result[i].B < result[j].B
		})
		return result, nil
	}
	var err error
	if rules.Separate, err = clean(rules.Separate, "넣지 않을 학생"); err != nil {
		return Rules{}, err
	}
	if rules.Together, err = clean(rules.Together, "함께 넣을 학생"); err != nil {
		return Rules{}, err
	}
	separate := map[Pair]bool{}
	for _, pair := range rules.Separate {
		separate[pair] = true
	}
	for _, pair := range rules.Together {
		if separate[pair] {
			return Rules{}, errors.New("같은 두 학생을 '함께 넣기'와 '넣지 않기'에 동시에 둘 수 없습니다")
		}
	}
	return rules, nil
}

// MaxPlans는 보관할 수 있는 편성 이력 수입니다.
func MaxPlans() int { return maxPlans }
