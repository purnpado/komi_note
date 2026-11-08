package vault

import (
	"errors"
	"fmt"
	"sort"
	"time"

	"TeacherNote/internal/grouping"
)

// GroupingBook은 모둠 편성 이력과 반별 편성 조건 전체입니다.
type GroupingBook = grouping.Book

// GroupPlan은 한 번의 모둠 편성 결과입니다.
type GroupPlan = grouping.Plan

// GroupRules는 반별 교사 전용 편성 조건입니다.
type GroupRules = grouping.Rules

func copyGroupPlan(plan grouping.Plan) grouping.Plan {
	plan.Roles = append([]string{}, plan.Roles...)
	groups := make([]grouping.Group, len(plan.Groups))
	for index, group := range plan.Groups {
		groups[index] = group
		groups[index].Members = append([]grouping.Member{}, group.Members...)
	}
	plan.Groups = groups
	plan.Excluded = append([]grouping.Member{}, plan.Excluded...)
	return plan
}

func copyGroupRules(rules grouping.Rules) grouping.Rules {
	rules.Separate = append([]grouping.Pair{}, rules.Separate...)
	rules.Together = append([]grouping.Pair{}, rules.Together...)
	return rules
}

// GetGroupingBook은 최신 순서의 모둠 편성 이력과 반별 조건을 돌려줍니다.
func (s *VaultStore) GetGroupingBook() (GroupingBook, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return GroupingBook{}, errors.New("먼저 보관함을 열어 주세요")
	}
	result := GroupingBook{Plans: []grouping.Plan{}, Rules: []grouping.Rules{}}
	if s.session.Grouping == nil {
		return result, nil
	}
	for _, plan := range s.session.Grouping.Plans {
		result.Plans = append(result.Plans, copyGroupPlan(plan))
	}
	sort.SliceStable(result.Plans, func(i, j int) bool { return result.Plans[i].CreatedAt > result.Plans[j].CreatedAt })
	for _, rules := range s.session.Grouping.Rules {
		result.Rules = append(result.Rules, copyGroupRules(rules))
	}
	return result, nil
}

func (s *VaultStore) groupingLocked() *grouping.Book {
	if s.session.Grouping == nil {
		s.session.Grouping = &grouping.Book{Plans: []grouping.Plan{}, Rules: []grouping.Rules{}}
	}
	return s.session.Grouping
}

// commitGroupingLocked는 바뀐 모둠 자료를 저장하고, 실패하면 이전 상태로 되돌립니다.
func (s *VaultStore) commitGroupingLocked(previous *grouping.Book) error {
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		s.session.Grouping = previous
		return err
	}
	return nil
}

func snapshotGrouping(book *grouping.Book) *grouping.Book {
	if book == nil {
		return nil
	}
	copied := &grouping.Book{Plans: make([]grouping.Plan, len(book.Plans)), Rules: make([]grouping.Rules, len(book.Rules))}
	for index, plan := range book.Plans {
		copied.Plans[index] = copyGroupPlan(plan)
	}
	for index, rules := range book.Rules {
		copied.Rules[index] = copyGroupRules(rules)
	}
	return copied
}

// SaveGroupPlan은 모둠 편성 결과를 새로 저장하거나(ID 없음) 기존 이력을 고칩니다.
// 고칠 때 화면이 읽은 updatedAt과 다르면 덮어쓰지 않습니다.
func (s *VaultStore) SaveGroupPlan(plan GroupPlan) (GroupPlan, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return GroupPlan{}, errors.New("먼저 보관함을 열어 주세요")
	}
	normalised, err := grouping.NormalisePlan(plan)
	if err != nil {
		return GroupPlan{}, err
	}
	previous := snapshotGrouping(s.session.Grouping)
	book := s.groupingLocked()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	index := -1
	if normalised.ID != "" {
		for i := range book.Plans {
			if book.Plans[i].ID == normalised.ID {
				index = i
				break
			}
		}
		if index < 0 {
			return GroupPlan{}, errors.New("고칠 모둠 편성 이력을 찾지 못했습니다. 목록을 다시 열어 주세요")
		}
		if book.Plans[index].UpdatedAt != plan.UpdatedAt {
			return GroupPlan{}, errors.New("다른 화면에서 이 모둠 편성이 먼저 바뀌었습니다. 다시 열고 고쳐 주세요")
		}
		normalised.CreatedAt = book.Plans[index].CreatedAt
	} else {
		if len(book.Plans) >= grouping.MaxPlans() {
			return GroupPlan{}, fmt.Errorf("모둠 편성 이력은 %d개까지 저장할 수 있습니다. 오래된 이력을 지워 주세요", grouping.MaxPlans())
		}
		id, err := newStudentID()
		if err != nil {
			return GroupPlan{}, err
		}
		normalised.ID = id
		normalised.CreatedAt = now
	}
	normalised.UpdatedAt = now
	if index >= 0 {
		book.Plans[index] = normalised
	} else {
		book.Plans = append(book.Plans, normalised)
	}
	if err := s.commitGroupingLocked(previous); err != nil {
		return GroupPlan{}, err
	}
	return copyGroupPlan(normalised), nil
}

// DeleteGroupPlan은 선택한 모둠 편성 이력만 지웁니다.
func (s *VaultStore) DeleteGroupPlan(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	if s.session.Grouping == nil {
		return errors.New("모둠 편성 이력을 찾지 못했습니다")
	}
	previous := snapshotGrouping(s.session.Grouping)
	book := s.session.Grouping
	for index, plan := range book.Plans {
		if plan.ID == id {
			book.Plans = append(book.Plans[:index], book.Plans[index+1:]...)
			return s.commitGroupingLocked(previous)
		}
	}
	return errors.New("모둠 편성 이력을 찾지 못했습니다")
}

// SaveGroupRules는 반별 교사 전용 편성 조건을 저장합니다(반마다 하나).
func (s *VaultStore) SaveGroupRules(rules GroupRules) (GroupRules, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return GroupRules{}, errors.New("먼저 보관함을 열어 주세요")
	}
	normalised, err := grouping.NormaliseRules(rules)
	if err != nil {
		return GroupRules{}, err
	}
	previous := snapshotGrouping(s.session.Grouping)
	book := s.groupingLocked()
	replaced := false
	for index := range book.Rules {
		if book.Rules[index].SourceKind == normalised.SourceKind && book.Rules[index].SourceID == normalised.SourceID {
			book.Rules[index] = normalised
			replaced = true
			break
		}
	}
	if !replaced {
		book.Rules = append(book.Rules, normalised)
	}
	if err := s.commitGroupingLocked(previous); err != nil {
		return GroupRules{}, err
	}
	return copyGroupRules(normalised), nil
}
