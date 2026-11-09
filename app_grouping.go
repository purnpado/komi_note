package main

// 모둠 편성과 학생 참여 회차 바인딩

import (
	"errors"
	"strconv"
	"strings"

	"TeacherNote/internal/groupsession"
)

// GetGroupingBook은 모둠 편성 이력과 반별 편성 조건을 반환합니다.
func (a *App) GetGroupingBook() (GroupingBook, error) {
	return a.vault.GetGroupingBook()
}

// SaveGroupPlan은 모둠 편성 결과를 암호화해 저장합니다.
func (a *App) SaveGroupPlan(plan GroupPlan) (GroupPlan, error) {
	saved, err := a.vault.SaveGroupPlan(plan)
	return notifyAfter(eventGroupingChanged, savedKind(plan.ID), func(p GroupPlan) string { return p.ID }, saved, err)
}

// DeleteGroupPlan은 모둠 편성 이력 하나를 삭제합니다.
func (a *App) DeleteGroupPlan(id string) error {
	return notifyErr(eventGroupingChanged, changeDeleted, id, a.vault.DeleteGroupPlan(id))
}

// SaveGroupRules는 반별 교사 전용 편성 조건을 암호화해 저장합니다.
func (a *App) SaveGroupRules(rules GroupRules) (GroupRules, error) {
	saved, err := a.vault.SaveGroupRules(rules)
	return notifyAfter(eventGroupingChanged, changeUpdated, func(r GroupRules) string { return r.SourceID }, saved, err)
}

// StartGroupingSession은 학생 참여형 모둠 편성(지망 배정) QR 회차를 엽니다.
// 학생 명단과 교사 전용 조건은 보관함에서 직접 읽고, 빠질 학생은 제외합니다.
func (a *App) StartGroupingSession(request GroupSessionRequest) (GroupSessionInfo, error) {
	excluded := map[string]bool{}
	for _, key := range request.ExcludedKeys {
		excluded[key] = true
	}
	participants := []groupsession.Participant{}
	switch request.SourceKind {
	case "homeroom":
		list, err := a.vault.ListStudents()
		if err != nil {
			return GroupSessionInfo{}, err
		}
		for _, student := range list {
			if !excluded[student.ID] {
				participants = append(participants, groupsession.Participant{Key: student.ID, Number: strconv.Itoa(student.Number), Name: student.Name})
			}
		}
	case "course":
		rosters, err := a.vault.ListCourseRosters()
		if err != nil {
			return GroupSessionInfo{}, err
		}
		found := false
		for _, roster := range rosters {
			if roster.ID != request.SourceID {
				continue
			}
			found = true
			for _, student := range roster.Students {
				key := strings.TrimSpace(student.Number) + "|" + strings.TrimSpace(student.Name)
				if student.Status != "전출" && !excluded[key] {
					participants = append(participants, groupsession.Participant{Key: key, Number: strings.TrimSpace(student.Number), Name: strings.TrimSpace(student.Name)})
				}
			}
		}
		if !found {
			return GroupSessionInfo{}, errors.New("수업 명렬을 찾지 못했습니다")
		}
	default:
		return GroupSessionInfo{}, errors.New("모둠을 만들 반을 골라 주세요")
	}
	config := groupsession.Config{Request: request, Participants: participants}
	if book, err := a.vault.GetGroupingBook(); err == nil {
		for _, rules := range book.Rules {
			if rules.SourceKind == request.SourceKind && rules.SourceID == request.SourceID {
				for _, pair := range rules.Separate {
					config.Separate = append(config.Separate, groupsession.Pair{A: pair.A, B: pair.B})
				}
				for _, pair := range rules.Together {
					config.Together = append(config.Together, groupsession.Pair{A: pair.A, B: pair.B})
				}
			}
		}
	}
	return a.groupSession.Start(config)
}

// GetGroupingSessionInfo는 모둠 참여 회차의 진행 상태를 돌려줍니다(회차가 없으면 running=false).
func (a *App) GetGroupingSessionInfo() (GroupSessionInfo, error) {
	return a.groupSession.Info()
}

// OpenGroupingPreferences는 학생 지망 제출을 시작합니다(seconds: 제출 시간).
func (a *App) OpenGroupingPreferences(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.OpenPreferences(seconds)
}

// ExtendGroupingDeadline은 지망 제출 시간을 늘립니다.
func (a *App) ExtendGroupingDeadline(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.Extend(seconds)
}

// CloseGroupingPreferences는 지망 제출을 마감하고 배정합니다.
func (a *App) CloseGroupingPreferences() (GroupSessionInfo, error) {
	return a.groupSession.ClosePreferences()
}

// RevealGroupingNextRound는 다음 지망 라운드 결과를 공개합니다.
func (a *App) RevealGroupingNextRound() (GroupSessionInfo, error) {
	return a.groupSession.RevealNext()
}

// RevealGroupingNames는 배정이 모두 끝난 뒤 실명을 공개합니다.
func (a *App) RevealGroupingNames() (GroupSessionInfo, error) {
	return a.groupSession.RevealNames()
}

// ResetGroupingStudent는 학생 기기 연결을 풀어 다시 들어오게 합니다.
func (a *App) ResetGroupingStudent(key string) (GroupSessionInfo, error) {
	return a.groupSession.ResetStudent(key)
}

// OpenGroupingVote는 모둠장 투표를 시작합니다(모둠장이 있는 방식).
func (a *App) OpenGroupingVote(seconds int) (GroupSessionInfo, error) {
	return a.groupSession.OpenVote(seconds)
}

// CloseGroupingVote는 모둠장 투표를 마감합니다.
func (a *App) CloseGroupingVote() (GroupSessionInfo, error) {
	return a.groupSession.CloseVote()
}

// ConfirmGroupingLeaders는 모둠마다 모둠장을 확정합니다(keys는 모둠 순서).
func (a *App) ConfirmGroupingLeaders(keys []string) (GroupSessionInfo, error) {
	return a.groupSession.ConfirmLeaders(keys)
}

// SetGroupingPots는 교사가 나눈 포트를 저장합니다(교사만 보는 기준).
func (a *App) SetGroupingPots(pots [][]string) (GroupSessionInfo, error) {
	return a.groupSession.SetPots(pots)
}

// StartGroupingDraft는 뱀 순서 블라인드 지명을 시작합니다.
func (a *App) StartGroupingDraft() (GroupSessionInfo, error) {
	return a.groupSession.StartDraft()
}

// GroupingDraftPick은 전자칠판에서 지금 차례 모둠장이 카드를 고릅니다(card 0이면 무작위).
func (a *App) GroupingDraftPick(card int) (GroupSessionInfo, error) {
	return a.groupSession.DraftPick(card)
}

// StopGroupingSession은 모둠 참여 회차를 닫고 메모리의 지망·닉네임을 지웁니다.
func (a *App) StopGroupingSession() {
	a.groupSession.Stop()
}
