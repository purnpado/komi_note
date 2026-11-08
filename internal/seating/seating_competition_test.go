package seating

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuildSeatingContestsSkipsAssignedAndOccupied(t *testing.T) {
	items := BuildSeatingContests([]SeatingPreference{
		{StudentID: "a", SeatIDs: []string{"s1", "s2"}},
		{StudentID: "b", SeatIDs: []string{"s1", "s3"}},
		{StudentID: "c", SeatIDs: []string{"s2", "s3"}},
	}, map[string]bool{"c": true}, map[string]bool{"s2": true}, 1)
	if len(items) != 1 || items[0].SeatID != "s1" || len(items[0].StudentIDs) != 2 {
		t.Fatalf("유효 후보 경쟁 계산이 올바르지 않습니다: %#v", items)
	}
}

func TestRemainingPreferenceCount(t *testing.T) {
	for input, want := range map[int]int{5: 3, 2: 2, 1: 1, 0: 0} {
		if got := RemainingPreferenceCount(input); got != want {
			t.Fatalf("빈 자리 %d개: %d를 기대했으나 %d", input, want, got)
		}
	}
}

func TestPreferenceSubmissionRejectsAlreadyAssignedStudent(t *testing.T) {
	session := &seatingSession{
		assigned:        map[string]string{"assigned-student": "seat-1"},
		available:       map[string]bool{"seat-2": true},
		preferenceLimit: 1,
	}
	if err := validatePreferenceSubmissionLocked(session, "assigned-student", []string{"seat-2"}); err == nil {
		t.Fatal("이미 확정된 학생의 다음 라운드 지망 제출은 거부되어야 합니다")
	}
	if err := validatePreferenceSubmissionLocked(session, "unassigned-student", []string{"seat-2"}); err != nil {
		t.Fatalf("미배정 학생의 빈 자리 제출은 허용되어야 합니다: %v", err)
	}
}

func TestPreferenceSubmissionRejectsOccupiedSeat(t *testing.T) {
	session := &seatingSession{
		assigned:        map[string]string{},
		available:       map[string]bool{"seat-1": true},
		preferenceLimit: 1,
	}
	if err := validatePreferenceSubmissionLocked(session, "student", []string{"seat-2"}); err == nil {
		t.Fatal("이미 확정됐거나 존재하지 않는 좌석은 지망으로 제출할 수 없어야 합니다")
	}
}

func TestPreferenceConfirmationKeepsOnlyOneEntryPerStudentAndSeat(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{}
	server.recordPreferenceConfirmationLocked(session, "student-1", "seat-1", 1)
	server.recordPreferenceConfirmationLocked(session, "student-1", "seat-2", 2)
	server.recordPreferenceConfirmationLocked(session, "student-2", "seat-1", 2)
	if len(session.confirmed) != 1 {
		t.Fatalf("확정 이력은 학생·좌석별로 한 번만 남아야 합니다: %#v", session.confirmed)
	}
	if session.confirmed[0].Priority != 1 || session.confirmed[0].SeatID != "seat-1" {
		t.Fatalf("첫 확정 이력이 보존되지 않았습니다: %#v", session.confirmed[0])
	}
	if got := preferenceCompletionPhase(2); got != "2지망 처리 완료" {
		t.Fatalf("지망 처리 완료 단계명이 올바르지 않습니다: %q", got)
	}
}

func TestAllJoinedStudentsAssignedUsesParticipantsNotEmptySeats(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{
		joined:   map[string]string{"student-1": "새싹토끼", "student-2": "별빛여우"},
		assigned: map[string]string{"student-1": "seat-1", "student-2": "seat-2"},
		available: map[string]bool{
			"seat-3": true,
			"seat-4": true,
		},
	}
	if !server.allJoinedStudentsAssignedLocked(session) {
		t.Fatal("빈자리가 남아도 입장 참가자 전원이 확정되면 배정 완료로 판정해야 합니다")
	}
	delete(session.assigned, "student-2")
	if server.allJoinedStudentsAssignedLocked(session) {
		t.Fatal("미배정 참가자가 있으면 다음 차 지망 처리 대상으로 남아야 합니다")
	}
}

func TestPreferenceStateHidesVacantSeatsFromAssignedStudent(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{
		phase:           "희망 자리 제출",
		joined:          map[string]string{"assigned-student": "새싹토끼"},
		available:       map[string]bool{"seat-2": true},
		seatLabels:      map[string]string{"seat-1": "1번", "seat-2": "2번"},
		seatLayout:      map[string]SeatingSeat{"seat-1": {ID: "seat-1", Row: 1, Column: 1}, "seat-2": {ID: "seat-2", Row: 1, Column: 2}},
		assigned:        map[string]string{"assigned-student": "seat-1"},
		preferences:     map[string][]string{},
		preferenceLimit: 1,
		rpsChoices:      map[string]string{},
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "/api/token/state", nil)
	request.AddCookie(deviceCookie(session, "assigned-student"))
	server.stateAPI(session)(recorder, request)
	var state map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("상태 응답 해석 실패: %v", err)
	}
	if state["canSubmitPreferences"] != false || state["mySeatLabel"] != "1번" {
		t.Fatalf("확정 학생 상태가 올바르지 않습니다: %#v", state)
	}
	if len(state["availableSeats"].([]any)) != 0 || len(state["layout"].([]any)) != 0 {
		t.Fatalf("확정 학생에게는 다음 라운드 빈 좌석과 배치도를 보내면 안 됩니다: %#v", state)
	}
}

func TestStudentStateDoesNotExposeFinalNames(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{
		phase:       "배정 완료",
		joined:      map[string]string{"student": "새싹토끼"},
		available:   map[string]bool{},
		seatLabels:  map[string]string{"seat-1": "1번"},
		seatLayout:  map[string]SeatingSeat{"seat-1": {ID: "seat-1", Row: 1, Column: 1}},
		assigned:    map[string]string{"student": "seat-1"},
		preferences: map[string][]string{},
		rpsChoices:  map[string]string{},
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/student-token/state?display=board", nil)
	server.stateAPI(session, false)(recorder, request)
	if strings.Contains(recorder.Body.String(), "finalName") {
		t.Fatal("학생 토큰의 state 응답은 display=board 쿼리가 있어도 최종 실명을 포함하면 안 됩니다")
	}
}

func TestLoginFailuresAreTemporaryAndBlockAfterFiveAttempts(t *testing.T) {
	session := &seatingSession{loginAttempts: map[string]seatingLoginAttempt{}}
	now := time.Now()
	for attempt := 1; attempt <= 4; attempt++ {
		if recordSeatingLoginFailureLocked(session, "192.0.2.10", now) {
			t.Fatalf("%d번째 실패에서 차단되면 안 됩니다", attempt)
		}
	}
	if !recordSeatingLoginFailureLocked(session, "192.0.2.10", now) {
		t.Fatal("5번째 실패에서는 임시 차단되어야 합니다")
	}
	blockedUntil := session.loginAttempts["192.0.2.10"].blockedUntil
	if blockedUntil.Before(now.Add(29*time.Second)) || blockedUntil.After(now.Add(31*time.Second)) {
		t.Fatalf("차단 시간이 30초가 아닙니다: %v", blockedUntil.Sub(now))
	}
	if recordSeatingLoginFailureLocked(session, "192.0.2.10", blockedUntil.Add(time.Second)) {
		t.Fatal("차단 만료 뒤 다음 실패는 새 카운트로 시작해야 합니다")
	}
}

func TestSplitSeatingContests(t *testing.T) {
	singles, contests := SplitSeatingContests([]SeatingContest{
		{SeatID: "s1", StudentIDs: []string{"a"}},
		{SeatID: "s2", StudentIDs: []string{"b", "c"}},
		{SeatID: "s3", StudentIDs: nil},
	})
	if len(singles) != 1 || singles[0].SeatID != "s1" || len(contests) != 1 || contests[0].SeatID != "s2" {
		t.Fatalf("단독·복수 후보 분리가 올바르지 않습니다: %#v / %#v", singles, contests)
	}
}

func TestEligibleSeatIDs(t *testing.T) {
	got := EligibleSeatIDs([]string{"s1", "s2", "s3"}, map[string]bool{"s1": true, "s3": true})
	if len(got) != 1 || got[0] != "s2" {
		t.Fatalf("제외 규칙이 적용되지 않았습니다: %#v", got)
	}
}

func TestNextArrowTargetPrefersFixedSeat(t *testing.T) {
	got, err := NextArrowTarget([]string{"s1", "s2"}, "s2", map[string]bool{"s2": true})
	if err != nil || got != "s2" {
		t.Fatalf("고정 자리 배정 = %q, %v", got, err)
	}
}

func TestResolveRPSRound(t *testing.T) {
	result := ResolveRPSRound([]string{"a", "b", "c"}, map[string]string{"a": "가위", "b": "보", "c": "보"})
	if result.Draw || len(result.Winners) != 1 || result.Winners[0] != "a" {
		t.Fatalf("가위바위보 승자 판정 오류: %#v", result)
	}
}

func TestResolveRPSRoundSingleResponseWins(t *testing.T) {
	result := ResolveRPSRound([]string{"a", "b"}, map[string]string{"a": "바위"})
	if result.Draw || len(result.Winners) != 1 || result.Winners[0] != "a" || len(result.Missing) != 1 || result.Missing[0] != "b" {
		t.Fatalf("미입력 탈락 판정 오류: %#v", result)
	}
}

func TestRPSTwoMissingStudentsUseRandomWinner(t *testing.T) {
	result := ResolveRPSRound([]string{"a", "b"}, map[string]string{})
	if !result.Draw || len(result.Missing) != 2 {
		t.Fatalf("양쪽 미입력은 세션에서 별도 복구해야 합니다: %#v", result)
	}
	winner, err := NextArrowTarget([]string{"a", "b"}, "", nil)
	if err != nil || (winner != "a" && winner != "b") {
		t.Fatalf("양쪽 미입력 무작위 승자 선정 오류: %q, %v", winner, err)
	}
}

func TestSkipRouletteRecoveryMovesToNextStudentWithoutAssignment(t *testing.T) {
	session := &seatingSession{
		order:             []string{"student-1", "student-2"},
		current:           0,
		assigned:          map[string]string{},
		phase:             "오류",
		recoveryKind:      "룰렛",
		recoveryStudentID: "student-1",
		recoverySeatID:    "seat-1",
	}
	server := &SeatingServer{}
	server.skipRecoveryLocked(session)
	if session.phase != "룰렛 시작 대기" || session.current != 1 {
		t.Fatalf("룰렛 오류 건너뛰기 뒤 다음 학생 대기로 넘어가야 합니다: %#v", session)
	}
	if len(session.assigned) != 0 || session.recoveryStudentID != "" {
		t.Fatalf("건너뛴 학생은 배정되거나 복구 정보가 남으면 안 됩니다: %#v", session)
	}
}

func TestBuildRPSTournamentRoundOddCandidates(t *testing.T) {
	round, err := BuildRPSTournamentRound([]string{"a", "b", "c"})
	if err != nil || len(round) != 2 {
		t.Fatalf("3명 토너먼트 대진 구성 오류: %#v, %v", round, err)
	}
	byes := 0
	for _, match := range round {
		if match.Bye && match.WinnerID != "" {
			byes++
		}
	}
	if byes != 1 {
		t.Fatalf("홀수 후보의 부전승이 필요합니다: %#v", round)
	}
}
