package seating

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"TeacherNote/internal/students"
)

// memSeatingStore는 자리배정 흐름 테스트용 메모리 저장소다.
type memSeatingStore struct {
	mu       sync.Mutex
	plans    map[string]SeatingPlan
	students []students.Student
}

func (m *memSeatingStore) GetSeatingPlan(id string) (SeatingPlan, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	plan, ok := m.plans[id]
	if !ok {
		return SeatingPlan{}, errors.New("배치안 없음")
	}
	plan.Seats = append([]SeatingSeat(nil), plan.Seats...)
	return plan, nil
}

func (m *memSeatingStore) ListSeatingPlans() ([]SeatingPlan, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := []SeatingPlan{}
	for _, plan := range m.plans {
		result = append(result, plan)
	}
	return result, nil
}

func (m *memSeatingStore) SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	plan.Seats = append([]SeatingSeat(nil), plan.Seats...)
	m.plans[plan.ID] = plan
	return plan, nil
}

func (m *memSeatingStore) ListStudents() ([]students.Student, error) {
	return append([]students.Student(nil), m.students...), nil
}

// newFlowServer는 재적 rosterCount명, 같은 수의 좌석(3열 격자)을 가진 회차를 연다.
func newFlowServer(t *testing.T, method string, rosterCount int) (*SeatingServer, *memSeatingStore, *seatingSession) {
	t.Helper()
	store := &memSeatingStore{plans: map[string]SeatingPlan{}}
	seats := []SeatingSeat{}
	for index := 0; index < rosterCount; index++ {
		seats = append(seats, SeatingSeat{ID: fmt.Sprintf("seat-%02d", index+1), Row: index/3 + 1, Column: index%3 + 1})
		store.students = append(store.students, students.Student{ID: fmt.Sprintf("st-%02d", index+1), Number: index + 1, Name: fmt.Sprintf("학생%02d", index+1), BirthDate: fmt.Sprintf("2012-01-%02d", index+1)})
	}
	store.plans["plan"] = NormaliseSeatingPlan(SeatingPlan{ID: "plan", Rows: (rosterCount + 2) / 3, Columns: 3, DrawMethod: method, Seats: seats})
	server := NewSeatingServer(store)
	if _, err := server.Start("plan"); err != nil {
		t.Fatalf("회차를 열지 못했습니다: %v", err)
	}
	t.Cleanup(func() { server.Stop("plan") })
	return server, store, server.sessions["plan"]
}

func joinStudent(t *testing.T, server *SeatingServer, x *seatingSession, number int) {
	t.Helper()
	body := fmt.Sprintf(`{"number":"%d","name":"학생%02d"}`, number, number)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/token/login", strings.NewReader(body))
	request.RemoteAddr = fmt.Sprintf("10.0.0.%d:1234", number)
	server.loginAPI(x)(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("학생%02d 입장 실패: %d %s", number, recorder.Code, recorder.Body.String())
	}
}

// expireTimers는 테스트에서 기다리지 않도록 회차의 모든 타이머를 지난 시각으로 돌린다.
func expireTimers(server *SeatingServer, x *seatingSession) {
	server.mu.Lock()
	defer server.mu.Unlock()
	past := time.Now().Add(-time.Second)
	for _, p := range []*time.Time{&x.rpsEndsAt, &x.ladderEndsAt, &x.resultEndsAt, &x.orderShuffleEndsAt, &x.turnStartsAt, &x.turnEndsAt} {
		if !p.IsZero() {
			*p = past
		}
	}
	if x.pendingShot != nil {
		x.pendingShot.endsAt = past
	}
}

func runUntilTerminal(t *testing.T, server *SeatingServer, x *seatingSession, step func(phase string)) {
	t.Helper()
	for i := 0; i < 400; i++ {
		expireTimers(server, x)
		info, err := server.Info("plan")
		if err != nil {
			t.Fatalf("상태 확인 실패: %v", err)
		}
		if isTerminalSeatingPhase(info.Phase) {
			return
		}
		if step != nil {
			step(info.Phase)
		}
	}
	t.Fatalf("배정이 끝나지 않았습니다. 마지막 단계: %s", x.phase)
}

func boardState(t *testing.T, server *SeatingServer, x *seatingSession) map[string]any {
	t.Helper()
	recorder := httptest.NewRecorder()
	server.stateAPI(x, true)(recorder, httptest.NewRequest(http.MethodGet, "/board-api/board/state", nil))
	var state map[string]any
	if err := json.NewDecoder(recorder.Body).Decode(&state); err != nil {
		t.Fatalf("전자칠판 상태 해석 실패: %v", err)
	}
	return state
}

func TestCloseEntryRequiresFullRosterUnlessPartialConfirmed(t *testing.T) {
	server, _, x := newFlowServer(t, "랜덤 룰렛 배정", 12)
	for number := 1; number <= 4; number++ {
		joinStudent(t, server, x, number)
	}
	if _, err := server.CloseEntry("plan", false); err == nil || !strings.Contains(err.Error(), "재적 12명 중 4명") {
		t.Fatalf("일반 마감은 재적 인원이 모두 입장해야 합니다: %v", err)
	}
	info, err := server.CloseEntry("plan", true)
	if err != nil {
		t.Fatalf("예외 마감 실패: %v", err)
	}
	if !info.PartialClosed || info.RosterCnt != 12 || info.ParticipantCnt != 4 || info.Phase != "입장 마감" {
		t.Fatalf("예외 마감 정보가 올바르지 않습니다: %#v", info)
	}
}

func TestCloseEntryAllowsNormalCloseWhenEveryoneJoined(t *testing.T) {
	server, _, x := newFlowServer(t, "희망 경쟁배정", 3)
	for number := 1; number <= 3; number++ {
		joinStudent(t, server, x, number)
	}
	info, err := server.CloseEntry("plan", false)
	if err != nil || info.PartialClosed || info.Phase != "희망 자리 제출 준비" {
		t.Fatalf("전원 입장 뒤 일반 마감이 되어야 합니다: %#v %v", info, err)
	}
}

// 재적 12명 중 4명만 입장해도, 4명이 모두 배정되면 빈자리가 남아도 결과 단계로 끝나야 한다.
func TestRouletteEndsWhenAllJoinedStudentsAssigned(t *testing.T) {
	server, store, x := newFlowServer(t, "랜덤 룰렛 배정", 12)
	for number := 1; number <= 4; number++ {
		joinStudent(t, server, x, number)
	}
	if _, err := server.CloseEntry("plan", true); err != nil {
		t.Fatal(err)
	}
	if _, err := server.StartRandomArrowAssignment("plan"); err != nil {
		t.Fatal(err)
	}
	runUntilTerminal(t, server, x, func(phase string) {
		if phase == "룰렛 시작 준비" {
			if _, err := server.StartRoulette("plan"); err != nil {
				t.Fatal(err)
			}
		}
	})
	assertAssignedCount(t, store, 4)
}

func TestLadderEndsWhenAllJoinedStudentsAssigned(t *testing.T) {
	server, store, x := newFlowServer(t, "랜덤 사다리 배정", 12)
	for number := 1; number <= 4; number++ {
		joinStudent(t, server, x, number)
	}
	if _, err := server.CloseEntry("plan", true); err != nil {
		t.Fatal(err)
	}
	if _, err := server.StartRandomArrowAssignment("plan"); err != nil {
		t.Fatal(err)
	}
	runUntilTerminal(t, server, x, func(phase string) {
		switch phase {
		case "사다리 출발점 선택":
			server.mu.Lock()
			for index, studentID := range x.order {
				x.ladderStarts[studentID] = index + 1
			}
			server.mu.Unlock()
			if _, err := server.RevealRandomLadder("plan"); err != nil {
				t.Fatal(err)
			}
		case "사다리 공개", "사다리 결과 확인":
			if _, err := server.AdvanceRandomLadder("plan"); err != nil {
				t.Fatal(err)
			}
		}
	})
	assertAssignedCount(t, store, 4)
}

// 두 학생이 같은 1지망을 고르면 경쟁하고, 탈락한 학생 기록에는 본인 결과만 남는다.
func TestPreferenceFlowEndsAndRecordsPersonalHistory(t *testing.T) {
	server, store, x := newFlowServer(t, "희망 경쟁배정", 12)
	for number := 1; number <= 4; number++ {
		joinStudent(t, server, x, number)
	}
	if _, err := server.CloseEntry("plan", true); err != nil {
		t.Fatal(err)
	}
	if _, err := server.OpenPreferenceSubmission("plan"); err != nil {
		t.Fatal(err)
	}
	server.mu.Lock()
	x.preferences = map[string][]string{
		"st-01": {"seat-01", "seat-05", "seat-06"},
		"st-02": {"seat-01", "seat-07", "seat-08"},
		"st-03": {"seat-02", "seat-09", "seat-10"},
		"st-04": {"seat-03", "seat-11", "seat-12"},
	}
	server.mu.Unlock()
	if _, err := server.ClosePreferenceSubmission("plan"); err != nil {
		t.Fatal(err)
	}
	runUntilTerminal(t, server, x, func(phase string) {
		switch {
		case phase == "경쟁률 공개":
			if _, err := server.StartSeatingRPSCompetition("plan"); err != nil {
				t.Fatal(err)
			}
		case strings.HasSuffix(phase, "지망 처리 완료"):
			if _, err := server.AdvancePreferenceRound("plan"); err != nil {
				t.Fatal(err)
			}
		}
	})
	assertAssignedCount(t, store, 4)
	server.mu.Lock()
	defer server.mu.Unlock()
	if got := strings.Join(x.history["st-03"], "|"); got != "1차 · 1지망 2번 · 단독 희망 → 확정" {
		t.Fatalf("단독 확정 기록이 올바르지 않습니다: %q", got)
	}
	winner, loser := "st-01", "st-02"
	if x.assigned["st-02"] == "seat-01" {
		winner, loser = "st-02", "st-01"
	}
	if !strings.Contains(strings.Join(x.history[winner], "|"), "1지망 1번 · 가위바위보 2명 경쟁 → 확정") {
		t.Fatalf("승자 기록이 없습니다: %#v", x.history[winner])
	}
	loserHistory := strings.Join(x.history[loser], "|")
	if !strings.Contains(loserHistory, "1지망 1번 · 가위바위보 2명 경쟁 → 탈락") || !strings.Contains(loserHistory, "2지망") {
		t.Fatalf("탈락자는 탈락과 다음 지망 결과가 남아야 합니다: %q", loserHistory)
	}
	// 기록에는 다른 학생의 이름·닉네임이 들어가면 안 된다.
	for studentID, lines := range x.history {
		for _, line := range lines {
			for otherID, nickname := range x.joined {
				if otherID != studentID && strings.Contains(line, nickname) {
					t.Fatalf("기록에 다른 학생 닉네임이 있습니다: %q", line)
				}
			}
		}
	}
}

func TestStudentStateReturnsOnlyOwnHistory(t *testing.T) {
	server, _, x := newFlowServer(t, "희망 경쟁배정", 2)
	x.history = map[string][]string{"st-01": {"내 기록"}, "st-02": {"다른 학생 기록"}}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/token/state", nil)
	request.AddCookie(deviceCookie(x, "st-01"))
	server.stateAPI(x, false)(recorder, request)
	body := recorder.Body.String()
	if !strings.Contains(body, "내 기록") || strings.Contains(body, "다른 학생 기록") {
		t.Fatalf("학생 상태에는 본인 기록만 있어야 합니다: %s", body)
	}
	server.Stop("plan")
	if server.sessions["plan"] != nil {
		t.Fatal("회차를 닫으면 기록을 가진 회차가 사라져야 합니다")
	}
}

func finishRouletteWithAll(t *testing.T, rosterCount int) (*SeatingServer, *memSeatingStore, *seatingSession) {
	t.Helper()
	server, store, x := newFlowServer(t, "랜덤 룰렛 배정", rosterCount)
	for number := 1; number <= rosterCount; number++ {
		joinStudent(t, server, x, number)
	}
	if _, err := server.CloseEntry("plan", false); err != nil {
		t.Fatal(err)
	}
	if _, err := server.StartRandomArrowAssignment("plan"); err != nil {
		t.Fatal(err)
	}
	runUntilTerminal(t, server, x, func(phase string) {
		if phase == "룰렛 시작 준비" {
			_, _ = server.StartRoulette("plan")
		}
	})
	return server, store, x
}

func TestBoardShowsNamesOnlyAfterTeacherReveal(t *testing.T) {
	server, _, x := finishRouletteWithAll(t, 3)
	if strings.Contains(fmt.Sprint(boardState(t, server, x)["layout"]), "학생0") {
		t.Fatal("교사가 공개하기 전에는 전자칠판에 실명이 없어야 합니다")
	}
	info, err := server.RevealNames("plan", true)
	if err != nil || !info.NamesRevealed {
		t.Fatalf("실명 공개 실패: %#v %v", info, err)
	}
	if !strings.Contains(fmt.Sprint(boardState(t, server, x)["layout"]), "학생0") {
		t.Fatal("공개 뒤에는 전자칠판 최종 배치도에 실명이 보여야 합니다")
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/token/state", nil)
	request.AddCookie(deviceCookie(x, "st-01"))
	server.stateAPI(x, false)(recorder, request)
	if strings.Contains(recorder.Body.String(), "학생0") {
		t.Fatal("공개 뒤에도 학생 휴대폰에는 실명을 보내면 안 됩니다")
	}
	if _, err := server.RevealNames("plan", false); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(fmt.Sprint(boardState(t, server, x)["layout"]), "학생0") {
		t.Fatal("다시 가리면 실명이 사라져야 합니다")
	}
}

func TestBoardStateIgnoresStudentCookie(t *testing.T) {
	server, _, x := finishRouletteWithAll(t, 3)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/board-api/board/state", nil)
	request.AddCookie(deviceCookie(x, "st-01"))
	server.stateAPI(x, true)(recorder, request)
	var state map[string]any
	_ = json.NewDecoder(recorder.Body).Decode(&state)
	if layout, _ := state["layout"].([]any); len(layout) != 3 {
		t.Fatalf("학생 쿠키가 있어도 전자칠판에는 전체 배치도가 와야 합니다: %v", state["layout"])
	}
}

func TestRevealNamesRejectedWhileAssigning(t *testing.T) {
	server, _, _ := newFlowServer(t, "랜덤 룰렛 배정", 3)
	if _, err := server.RevealNames("plan", true); err == nil {
		t.Fatal("배정 중에는 실명을 공개할 수 없어야 합니다")
	}
}

func TestSwapSeatsUpdatesPlanSessionAndHistory(t *testing.T) {
	server, store, x := finishRouletteWithAll(t, 3)
	before, _ := store.GetSeatingPlan("plan")
	first, second := before.Seats[0], before.Seats[2]
	saved, err := server.SwapSeats("plan", first.ID, second.ID)
	if err != nil {
		t.Fatal(err)
	}
	after := map[string]string{}
	for _, seat := range saved.Seats {
		after[seat.ID] = seat.StudentID
	}
	if after[first.ID] != second.StudentID || after[second.ID] != first.StudentID {
		t.Fatalf("두 자리 학생이 맞바뀌지 않았습니다: %#v", after)
	}
	if len(saved.Changes) != 1 || saved.Changes[0].Summary != "1번 ↔ 3번 자리 맞바꿈" {
		t.Fatalf("변경 기록이 올바르지 않습니다: %#v", saved.Changes)
	}
	server.mu.Lock()
	if x.assigned[first.StudentID] != second.ID || x.assigned[second.StudentID] != first.ID {
		server.mu.Unlock()
		t.Fatalf("열린 회차의 배정 지도가 갱신되지 않았습니다: %#v", x.assigned)
	}
	server.mu.Unlock()
	// 기록에는 학생 이름이 들어가지 않는다.
	if strings.Contains(saved.Changes[0].Summary, "학생") {
		t.Fatal("변경 기록에 학생 이름이 있으면 안 됩니다")
	}
}

func TestSwapSeatsMovesToEmptySeatAfterSessionClosed(t *testing.T) {
	store := &memSeatingStore{plans: map[string]SeatingPlan{"plan": {ID: "plan", Seats: []SeatingSeat{{ID: "a", Row: 1, Column: 1, StudentID: "st-01"}, {ID: "b", Row: 1, Column: 2}}}}}
	server := NewSeatingServer(store)
	saved, err := server.SwapSeats("plan", "a", "b")
	if err != nil {
		t.Fatal(err)
	}
	if saved.Seats[0].StudentID != "" || saved.Seats[1].StudentID != "st-01" || saved.Changes[0].Summary != "1번 → 2번 빈자리로 옮김" {
		t.Fatalf("빈자리 옮기기 결과가 올바르지 않습니다: %#v", saved)
	}
	if _, err := server.SwapSeats("plan", "a", "a"); err == nil {
		t.Fatal("같은 자리끼리는 바꿀 수 없어야 합니다")
	}
}

func TestSwapSeatsRejectedWhileAssigning(t *testing.T) {
	server, store, x := newFlowServer(t, "랜덤 룰렛 배정", 3)
	joinStudent(t, server, x, 1)
	plan, _ := store.GetSeatingPlan("plan")
	plan.Seats[0].StudentID = "st-01"
	_, _ = store.SaveSeatingPlan(plan)
	if _, err := server.SwapSeats("plan", plan.Seats[0].ID, plan.Seats[1].ID); err == nil {
		t.Fatal("배정 진행 중에는 자리를 바꿀 수 없어야 합니다")
	}
}

func assertAssignedCount(t *testing.T, store *memSeatingStore, want int) {
	t.Helper()
	plan, _ := store.GetSeatingPlan("plan")
	count := 0
	for _, seat := range plan.Seats {
		if seat.StudentID != "" {
			count++
		}
	}
	if count != want {
		t.Fatalf("배정된 학생 수 %d명, 기대 %d명", count, want)
	}
}

// deviceCookie는 실제 입장처럼 학생에게 기기 토큰을 등록하고 그 토큰을 담은 쿠키를 돌려준다.
// 학생 쿠키에는 학생 ID가 아니라 기기 토큰이 들어간다.
func deviceCookie(x *seatingSession, studentID string) *http.Cookie {
	if x.deviceTokens == nil {
		x.deviceTokens = map[string]string{}
		x.deviceStudents = map[string]string{}
	}
	token := x.deviceTokens[studentID]
	if token == "" {
		token = "test-token-" + studentID
		x.deviceTokens[studentID] = token
		x.deviceStudents[token] = studentID
	}
	return &http.Cookie{Name: "kkomi-seat", Value: token}
}

// 자리배정 입장은 번호+이름으로 하고, 먼저 들어온 기기만 허용하며, 교사가 접속을 초기화할 수 있다.
func TestLoginUsesNumberAndNameWithOneDevice(t *testing.T) {
	server, _, x := newFlowServer(t, "희망 경쟁배정", 3)
	login := func(body string, cookie *http.Cookie, ip string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPost, "/api/token/login", strings.NewReader(body))
		request.RemoteAddr = ip + ":1234"
		if cookie != nil {
			request.AddCookie(cookie)
		}
		server.loginAPI(x)(recorder, request)
		return recorder
	}
	if code := login(`{"name":"학생01","birthDate":"2012-01-01"}`, nil, "10.0.0.1").Code; code != http.StatusUnauthorized {
		t.Fatalf("생년월일로는 들어올 수 없어야 합니다: %d", code)
	}
	if code := login(`{"number":"2","name":"학생01"}`, nil, "10.0.0.1").Code; code != http.StatusUnauthorized {
		t.Fatalf("번호가 다르면 거부: %d", code)
	}
	first := login(`{"number":"01번","name":"학생 01"}`, nil, "10.0.0.2")
	if first.Code != http.StatusOK {
		t.Fatalf("번호+이름 입장 실패: %d %s", first.Code, first.Body.String())
	}
	cookies := first.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Value == "st-01" || cookies[0].Value == "" {
		t.Fatalf("쿠키에 학생 ID 대신 기기 토큰이 들어가야 합니다: %+v", cookies)
	}
	if code := login(`{"number":"1","name":"학생01"}`, cookies[0], "10.0.0.2").Code; code != http.StatusOK {
		t.Fatalf("같은 기기 다시 입장은 허용: %d", code)
	}
	if code := login(`{"number":"1","name":"학생01"}`, nil, "10.0.0.3").Code; code != http.StatusConflict {
		t.Fatalf("다른 기기 입장은 막아야 합니다: %d", code)
	}
	// 학생 ID를 쿠키에 직접 넣어도 학생으로 인정되지 않는다.
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/token/state", nil)
	request.AddCookie(&http.Cookie{Name: "kkomi-seat", Value: "st-01"})
	server.stateAPI(x, false)(recorder, request)
	if strings.Contains(recorder.Body.String(), `"nickname":"`+x.joined["st-01"]+`"`) {
		t.Fatal("학생 ID 쿠키로 다른 학생 상태를 볼 수 없어야 합니다")
	}
	if _, err := server.ResetStudentAccess("plan", "st-01"); err != nil {
		t.Fatal(err)
	}
	second := login(`{"number":"1","name":"학생01"}`, nil, "10.0.0.3")
	if second.Code != http.StatusOK {
		t.Fatalf("접속 초기화 뒤 다른 기기 입장: %d", second.Code)
	}
	if nick := x.joined["st-01"]; nick == "" || len(x.joinedOrder) != 1 {
		t.Fatal("초기화해도 닉네임·입장 기록은 유지돼야 합니다")
	}
	if ids := server.JoinedStudentIDs("plan"); len(ids) != 1 || ids[0] != "st-01" {
		t.Fatalf("입장 학생 목록 %v", ids)
	}
}
