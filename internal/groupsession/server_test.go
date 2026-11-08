package groupsession

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"testing"
	"time"
)

type phone struct {
	t      *testing.T
	client *http.Client
	base   string
}

func newPhone(t *testing.T, x *session) *phone {
	jar, _ := cookiejar.New(nil)
	port := x.listener.Addr().(*net.TCPAddr).Port
	return &phone{t: t, client: &http.Client{Jar: jar, Timeout: 5 * time.Second}, base: fmt.Sprintf("http://127.0.0.1:%d/api/%s", port, x.token)}
}

func (p *phone) post(path string, body any) (int, string) {
	data, _ := json.Marshal(body)
	resp, err := p.client.Post(p.base+path, "application/json", bytes.NewReader(data))
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	text, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, strings.TrimSpace(string(text))
}

func (p *phone) state() map[string]any {
	resp, err := p.client.Get(p.base + "/state")
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	var state map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&state)
	return state
}

// startForTest는 회차를 열고, 이 컴퓨터의 다른 프로그램(로컬 프록시 등)이 127.0.0.1의 같은 포트를
// 쓰고 있으면 새 포트로 다시 엽니다(테스트 환경 문제이며 실제 교실 주소와는 무관).
func startForTest(t *testing.T, server *Server, cfg Config) Info {
	t.Helper()
	for attempt := 0; attempt < 10; attempt++ {
		info, err := server.Start(cfg)
		if err != nil {
			t.Fatal(err)
		}
		x := server.current
		port := x.listener.Addr().(*net.TCPAddr).Port
		resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/g/%s", port, x.code))
		if err == nil {
			body, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			if strings.Contains(string(body), x.token) {
				return info
			}
		}
		server.Stop()
	}
	t.Fatal("테스트용 포트를 열지 못했습니다")
	return Info{}
}

func courseConfig(n int) Config {
	participants := make([]Participant, n)
	for i := range participants {
		participants[i] = Participant{Key: fmt.Sprintf("%d|학생%d", i+1, i+1), Number: fmt.Sprint(i + 1), Name: fmt.Sprintf("학생%d", i+1)}
	}
	return Config{
		Request:      StartRequest{SourceKind: "course", SourceID: "r1", SourceLabel: "2-3", GroupNames: []string{"환경", "에너지", "우주"}, PreferenceLimit: 3, SubmitSeconds: 60},
		Participants: participants,
		Separate:     []Pair{{A: "1|학생1", B: "2|학생2"}},
	}
}

func TestSessionFullFlow(t *testing.T) {
	server := NewServer()
	clock := time.Date(2026, 11, 9, 10, 0, 0, 0, time.Local)
	server.now = func() time.Time { return clock }
	info := startForTest(t, server, courseConfig(12))
	defer server.Stop()
	if !strings.Contains(info.StudentURL, "/g/") || !strings.HasPrefix(info.QRCodeDataURL, "data:image/png;base64,") || fmt.Sprint(info.Capacities) != "[4 4 4]" {
		t.Fatalf("시작 정보 %+v", info)
	}
	if _, err := server.Start(courseConfig(12)); err == nil {
		t.Fatal("진행 중인 회차가 있으면 새 회차를 거부해야 합니다")
	}
	x := server.current

	// 학생 화면에는 토큰만, 실명은 없음
	port := x.listener.Addr().(*net.TCPAddr).Port
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/g/%s", port, x.code))
	if err != nil {
		t.Fatal(err)
	}
	page, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(page), x.token) || strings.Contains(string(page), "학생1") {
		t.Fatal("학생 화면에 토큰이 없거나 실명이 들어 있습니다")
	}

	phones := make([]*phone, 10) // 10명만 입장, 2명은 미입장
	for i := range phones {
		phones[i] = newPhone(t, x)
		number := fmt.Sprint(i + 1)
		if i == 0 {
			number = "01번"
		}
		if code, body := phones[i].post("/login", map[string]string{"number": number, "name": fmt.Sprintf(" 학생%d ", i+1)}); code != 200 {
			t.Fatalf("%d번 입장 실패 %d %s", i+1, code, body)
		}
	}
	if code, _ := newPhone(t, x).post("/login", map[string]string{"number": "3", "name": "학생99"}); code != http.StatusUnauthorized {
		t.Fatalf("틀린 이름 %d", code)
	}
	other := newPhone(t, x)
	if code, _ := other.post("/login", map[string]string{"number": "2", "name": "학생2"}); code != http.StatusConflict {
		t.Fatalf("다른 기기 입장은 막아야 합니다 %d", code)
	}
	if _, err := server.ResetStudent("2|학생2"); err != nil {
		t.Fatal(err)
	}
	if code, _ := other.post("/login", map[string]string{"number": "2", "name": "학생2"}); code != 200 {
		t.Fatalf("접속 초기화 뒤 다시 입장 %d", code)
	}
	phones[1] = other
	nick := phones[0].state()["nickname"]
	if nick == "" || nick == nil {
		t.Fatal("닉네임이 없습니다")
	}
	if code, _ := phones[0].post("/preferences", map[string]any{"groups": []int{0}}); code != http.StatusForbidden {
		t.Fatalf("입장 단계 지망은 거부해야 합니다 %d", code)
	}

	info, err = server.OpenPreferences(120)
	if err != nil || info.Phase != PhaseSubmit || info.RemainingSeconds != 120 || info.Joined != 10 {
		t.Fatalf("지망 시작 %+v %v", info, err)
	}
	for i, p := range phones {
		if code, body := p.post("/preferences", map[string]any{"groups": []int{0, 1, 2}}); code != 200 {
			t.Fatalf("%d번 지망 %d %s", i+1, code, body)
		}
	}
	if code, _ := phones[0].post("/preferences", map[string]any{"groups": []int{0, 0}}); code != http.StatusBadRequest {
		t.Fatal("같은 모둠 두 번은 거부해야 합니다")
	}
	if code, _ := phones[0].post("/preferences", map[string]any{"groups": []int{0, 1, 2, 0}}); code != http.StatusBadRequest {
		t.Fatal("지망 개수 초과는 거부해야 합니다")
	}
	// 늦게 온 학생(11번)도 제출 시간 중에는 입장
	late := newPhone(t, x)
	if code, _ := late.post("/login", map[string]string{"number": "11", "name": "학생11"}); code != 200 {
		t.Fatal("제출 중 늦은 입장")
	}
	info, _ = server.Extend(60)
	if info.RemainingSeconds != 180 {
		t.Fatalf("연장 %d", info.RemainingSeconds)
	}
	// 일시정지 중에는 시간이 흐르지 않는다
	server.PauseAll()
	clock = clock.Add(5 * time.Minute)
	if code, _ := phones[0].post("/preferences", map[string]any{"groups": []int{1}}); code != http.StatusLocked {
		t.Fatal("일시정지 중 제출은 거부해야 합니다")
	}
	server.ResumeAll()
	info, _ = server.Info()
	if info.Phase != PhaseSubmit || info.RemainingSeconds != 180 {
		t.Fatalf("재개 뒤 남은 시간 %+v", info.RemainingSeconds)
	}
	// 마감 시각이 지나면 자동 배정
	clock = clock.Add(181 * time.Second)
	info, _ = server.Info()
	if info.Phase != PhaseReveal || len(info.Rounds) != 4 || info.Submitted != 10 {
		t.Fatalf("자동 마감 %+v", info)
	}
	if code, _ := newPhone(t, x).post("/login", map[string]string{"number": "12", "name": "학생12"}); code != http.StatusForbidden {
		t.Fatal("마감 뒤 입장은 거부해야 합니다")
	}
	if phones[0].state()["result"] != nil {
		t.Fatal("라운드 공개 전에는 본인 결과를 보여 주면 안 됩니다")
	}
	if info.Rounds[0].Groups[0].Applicants != 10 || len(info.Rounds[0].Groups[0].Accepted) != 4 {
		t.Fatalf("1지망 추첨 %+v", info.Rounds[0])
	}
	total := 0
	for _, group := range info.Result {
		total += len(group.Members)
		hasOne, hasTwo := false, false
		for _, m := range group.Members {
			hasOne = hasOne || m.Key == "1|학생1"
			hasTwo = hasTwo || m.Key == "2|학생2"
		}
		if hasOne && hasTwo {
			t.Fatal("넣지 않을 학생이 같은 모둠입니다")
		}
	}
	if total != 12 {
		t.Fatalf("12명 모두 배정돼야 합니다: %d", total)
	}
	if _, err := server.RevealNames(); err == nil {
		t.Fatal("배정 완료 전 실명 공개는 거부해야 합니다")
	}
	for i := 0; i < 4; i++ {
		info, _ = server.RevealNext()
	}
	if info.Phase != PhaseAssigned {
		t.Fatalf("모두 공개 뒤 단계 %s", info.Phase)
	}
	result := phones[0].state()["result"].(map[string]any)
	members := fmt.Sprint(result["members"])
	if strings.Contains(members, "학생") {
		t.Fatalf("실명 공개 전에는 닉네임만: %s", members)
	}
	if !strings.Contains(members, "(나)") {
		t.Fatal("본인 표시가 없습니다")
	}
	if _, err := server.RevealNames(); err != nil {
		t.Fatal(err)
	}
	members = fmt.Sprint(phones[0].state()["result"].(map[string]any)["members"])
	if !strings.Contains(members, "학생1 (나)") {
		t.Fatalf("실명 공개 뒤 %s", members)
	}
	server.Stop()
	if info, _ := server.Info(); info.Running {
		t.Fatal("회차를 끝내면 정보가 사라져야 합니다")
	}
}

// 우리 반(담임 학급)도 번호+이름으로 들어온다. 생년월일은 받지도 쓰지도 않는다.
func TestHomeroomLoginUsesNumberAndName(t *testing.T) {
	server := NewServer()
	cfg := courseConfig(4)
	cfg.Request.SourceKind = "homeroom"
	cfg.Request.GroupNames = []string{"1모둠", "2모둠"}
	startForTest(t, server, cfg)
	defer server.Stop()
	p := newPhone(t, server.current)
	if code, _ := p.post("/login", map[string]string{"number": "2", "name": "학생1"}); code != http.StatusUnauthorized {
		t.Fatal("번호와 이름이 다르면 거부")
	}
	if code, _ := p.post("/login", map[string]string{"name": "학생1", "birthDate": "20130115"}); code != http.StatusUnauthorized {
		t.Fatal("번호 없이 생년월일로는 들어올 수 없음")
	}
	if code, _ := p.post("/login", map[string]string{"number": "01", "name": "학생 1"}); code != 200 {
		t.Fatal("우리 반도 번호+이름으로 입장(01·띄어쓰기 허용)")
	}
	for i := 0; i < 5; i++ {
		_, _ = newPhone(t, server.current).post("/login", map[string]string{"number": "9", "name": "없음"})
	}
	if code, _ := newPhone(t, server.current).post("/login", map[string]string{"number": "2", "name": "학생2"}); code != http.StatusTooManyRequests {
		t.Fatalf("5번 틀리면 잠시 대기 %d", code)
	}
	if strings.Contains(studentPageHTML, "생년월일") || strings.Contains(studentPageHTML, "birth") {
		t.Fatal("학생 화면에 생년월일 입력이 남아 있습니다")
	}
}

func TestStartValidation(t *testing.T) {
	server := NewServer()
	cfg := courseConfig(3)
	cfg.Request.GroupNames = []string{"a", "b", "c", "d"}
	if _, err := server.Start(cfg); err == nil {
		t.Fatal("학생보다 모둠이 많으면 거부")
	}
	cfg.Request.GroupNames = []string{"a"}
	if _, err := server.Start(cfg); err == nil {
		t.Fatal("모둠 1개는 거부")
	}
}

func joinAll(t *testing.T, x *session, n int) []*phone {
	t.Helper()
	phones := make([]*phone, n)
	for i := range phones {
		phones[i] = newPhone(t, x)
		if code, body := phones[i].post("/login", map[string]string{"number": fmt.Sprint(i + 1), "name": fmt.Sprintf("학생%d", i+1)}); code != 200 {
			t.Fatalf("%d번 입장 %d %s", i+1, code, body)
		}
	}
	return phones
}

// 모둠장 투표 → 교사 확정 → 포트 → 뱀 순서 블라인드 지명 → 배정 완료 → 실명 공개
func TestDraftFlow(t *testing.T) {
	server := NewServer()
	clock := time.Date(2026, 11, 9, 10, 0, 0, 0, time.Local)
	server.now = func() time.Time { return clock }
	cfg := courseConfig(12)
	cfg.Request.Mode = ModeDraft
	cfg.Request.TurnSeconds = 20
	cfg.Separate = []Pair{{A: "4|학생4", B: "5|학생5"}}
	startForTest(t, server, cfg)
	defer server.Stop()
	x := server.current
	phones := joinAll(t, x, 12)
	if _, err := server.OpenPreferences(60); err == nil {
		t.Fatal("모둠장 방식은 지망 제출로 바로 갈 수 없습니다")
	}
	info, err := server.OpenVote(60)
	if err != nil || info.Phase != PhaseVote {
		t.Fatalf("투표 시작 %v %+v", err, info.Phase)
	}
	// 본인 추천 허용, 최대 2명
	state := phones[0].state()
	if len(state["candidates"].([]any)) != 12 {
		t.Fatal("투표 후보는 명단 전체")
	}
	if code, _ := phones[0].post("/vote", map[string]any{"candidates": []int{0, 1, 2}}); code != http.StatusBadRequest {
		t.Fatal("3명 추천은 거부")
	}
	for i, p := range phones {
		votes := []int{0, 1}
		if i >= 6 {
			votes = []int{2, i % 12}
		}
		if i == 3 {
			votes = []int{3} // 본인 추천
		}
		if code, body := p.post("/vote", map[string]any{"candidates": votes}); code != 200 {
			t.Fatalf("투표 %d %s", code, body)
		}
	}
	clock = clock.Add(61 * time.Second) // 마감 시각 지나면 자동 마감
	info, _ = server.Info()
	if info.Phase != PhaseLeaders || info.Voted != 12 || len(info.Suggested) != 3 || info.VoteCounts[0].Count < 6 {
		t.Fatalf("투표 마감 %+v", info)
	}
	if _, err := server.ConfirmLeaders([]string{"1|학생1", "1|학생1", "3|학생3"}); err == nil {
		t.Fatal("같은 학생 두 모둠장은 거부")
	}
	info, err = server.ConfirmLeaders([]string{"1|학생1", "2|학생2", "3|학생3"})
	if err != nil || info.Phase != PhasePots || len(info.Pots) != 3 {
		t.Fatalf("모둠장 확정 %v %+v", err, info.Pots)
	}
	if !phones[0].state()["isLeader"].(bool) || phones[5].state()["isLeader"] != nil {
		t.Fatal("모둠장은 본인에게만 알려야 합니다")
	}
	// 포트 검사: 4명 넣기·누락 거부, 4·5번은 같은 포트에 두지 않고 다른 포트로
	if _, err := server.SetPots([][]string{{"4|학생4", "5|학생5", "6|학생6", "7|학생7"}, {"8|학생8", "9|학생9", "10|학생10"}, {"11|학생11", "12|학생12"}}); err == nil {
		t.Fatal("포트 하나에 모둠 수보다 많으면 거부")
	}
	if _, err := server.SetPots([][]string{{"4|학생4", "6|학생6", "7|학생7"}}); err == nil {
		t.Fatal("빠진 학생이 있으면 거부")
	}
	pots := [][]string{{"4|학생4", "6|학생6", "7|학생7"}, {"5|학생5", "8|학생8", "9|학생9"}, {"10|학생10", "11|학생11", "12|학생12"}}
	if _, err := server.SetPots(pots); err != nil {
		t.Fatal(err)
	}
	info, err = server.StartDraft()
	if err != nil || info.Phase != PhaseDraft || info.CardsLeft != 3 || info.TurnGroup < 0 {
		t.Fatalf("지명 시작 %v %+v", err, info)
	}
	firstOrder := []int{}
	turnPhone := func(group int) *phone { return phones[group] } // 모둠장 1·2·3번 = 0·1·2모둠
	// 1라운드: 휴대폰으로 고르기, 차례 아닌 모둠장은 거부
	for i := 0; i < 3; i++ {
		info, _ = server.Info()
		g := info.TurnGroup
		firstOrder = append(firstOrder, g)
		other := (g + 1) % 3
		if code, _ := turnPhone(other).post("/pick", map[string]int{"card": 1}); code != http.StatusForbidden {
			t.Fatal("차례가 아닌 모둠장은 고를 수 없음")
		}
		if code, body := turnPhone(g).post("/pick", map[string]int{"card": 1}); code != 200 {
			t.Fatalf("카드 고르기 %d %s", code, body)
		}
	}
	// 2라운드는 뱀 순서(거꾸로): 전자칠판 터치 1번, 시간 초과 자동 1번, 터치 1번
	info, _ = server.Info()
	if info.DraftRound != 1 || info.TurnGroup != firstOrder[2] {
		t.Fatalf("뱀 순서: 1라운드 %v 뒤 2라운드 첫 차례 %d", firstOrder, info.TurnGroup)
	}
	if _, err := server.DraftPick(2); err != nil {
		t.Fatal(err)
	}
	clock = clock.Add(21 * time.Second)
	info, _ = server.Info()
	if len(info.Picks) != 5 || !info.Picks[4].Auto {
		t.Fatalf("시간 초과 자동 뽑기 %+v", info.Picks)
	}
	if _, err := server.DraftPick(0); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := server.DraftPick(0); err != nil {
			t.Fatal(err)
		}
	}
	info, _ = server.Info()
	if info.Phase != PhaseAssigned || len(info.Picks) != 9 {
		t.Fatalf("지명 완료 %+v", info.Phase)
	}
	for g, group := range info.Result {
		if len(group.Members) != 4 || group.Members[0].Key != info.Leaders[g] {
			t.Fatalf("%d모둠 결과 %+v", g+1, group.Members)
		}
		potCount := map[int]int{}
		has4, has5 := false, false
		for _, m := range group.Members[1:] {
			for pi, pot := range pots {
				for _, k := range pot {
					if k == m.Key {
						potCount[pi]++
					}
				}
			}
			has4 = has4 || m.Key == "4|학생4"
			has5 = has5 || m.Key == "5|학생5"
		}
		for pi, c := range potCount {
			if c != 1 {
				t.Fatalf("포트 %d 학생이 한 모둠에 %d명", pi+1, c)
			}
		}
		if has4 && has5 {
			t.Fatal("넣지 않을 학생이 같은 모둠")
		}
	}
	// 실명 공개 전에는 결과에 실명·모둠장 표시 없음
	members := fmt.Sprint(phones[5].state()["result"].(map[string]any)["members"])
	if strings.Contains(members, "학생") || strings.Contains(members, "모둠장") {
		t.Fatalf("실명 공개 전 %s", members)
	}
	if _, err := server.RevealNames(); err != nil {
		t.Fatal(err)
	}
	members = fmt.Sprint(phones[5].state()["result"].(map[string]any)["members"])
	if !strings.Contains(members, "(모둠장)") || !strings.Contains(members, "학생6 (나)") {
		t.Fatalf("실명 공개 뒤 %s", members)
	}
}

// 모둠장 투표 → 확정 → 나머지 학생 지망(모둠장 숨김) → 배정
func TestLeaderPreferenceFlow(t *testing.T) {
	server := NewServer()
	clock := time.Date(2026, 11, 9, 10, 0, 0, 0, time.Local)
	server.now = func() time.Time { return clock }
	cfg := courseConfig(12)
	cfg.Request.Mode = ModeLeaderPreference
	startForTest(t, server, cfg)
	defer server.Stop()
	x := server.current
	phones := joinAll(t, x, 12)
	if _, err := server.OpenVote(60); err != nil {
		t.Fatal(err)
	}
	if _, err := server.CloseVote(); err != nil {
		t.Fatal(err)
	}
	info, err := server.ConfirmLeaders([]string{"1|학생1", "2|학생2", "3|학생3"})
	if err != nil || info.Phase != PhaseSubmit || info.RemainingSeconds != 60 {
		t.Fatalf("모둠장 확정 뒤 지망 제출 %v %+v", err, info.Phase)
	}
	if code, _ := phones[0].post("/preferences", map[string]any{"groups": []int{1}}); code != http.StatusForbidden {
		t.Fatal("모둠장은 지망을 내지 않음")
	}
	for _, p := range phones[3:] {
		if code, body := p.post("/preferences", map[string]any{"groups": []int{0, 1, 2}}); code != 200 {
			t.Fatalf("지망 %d %s", code, body)
		}
	}
	info, _ = server.ClosePreferences()
	if info.Phase != PhaseReveal || info.Rounds[0].Groups[0].Applicants != 9 {
		t.Fatalf("배정 %+v", info.Rounds)
	}
	for _, round := range info.Rounds {
		for _, g := range round.Groups {
			for _, k := range g.Accepted {
				if k == "1|학생1" || k == "2|학생2" || k == "3|학생3" {
					t.Fatal("모둠장은 공개 라운드에 나오지 않아야 합니다")
				}
			}
		}
	}
	for g, group := range info.Result {
		found := false
		for _, m := range group.Members {
			found = found || m.Key == info.Leaders[g]
		}
		if !found || len(group.Members) != 4 {
			t.Fatalf("%d모둠에 모둠장이 없음 %+v", g+1, group.Members)
		}
	}
}

// 모둠장 공개를 고르면 지망 화면에 모둠장이 보이고, 배정 결과에도 모둠장 실명이 먼저 보인다.
func TestLeaderPublicOption(t *testing.T) {
	server := NewServer()
	cfg := courseConfig(9)
	cfg.Request.Mode = ModeLeaderPreference
	cfg.Request.LeaderPublic = true
	startForTest(t, server, cfg)
	defer server.Stop()
	phones := joinAll(t, server.current, 9)
	server.OpenVote(60)
	server.CloseVote()
	if _, err := server.ConfirmLeaders([]string{"1|학생1", "2|학생2", "3|학생3"}); err != nil {
		t.Fatal(err)
	}
	groups := fmt.Sprint(phones[5].state()["groups"])
	if !strings.Contains(groups, "1번 학생1") {
		t.Fatalf("모둠장 공개면 지망 화면에 모둠장이 보여야 합니다: %s", groups)
	}
	for _, p := range phones[3:] {
		p.post("/preferences", map[string]any{"groups": []int{0}})
	}
	server.ClosePreferences()
	for i := 0; i < 4; i++ {
		server.RevealNext()
	}
	members := fmt.Sprint(phones[5].state()["result"].(map[string]any)["members"])
	if !strings.Contains(members, "(모둠장)") {
		t.Fatalf("공개한 모둠장은 이름 공개 전에도 보입니다: %s", members)
	}
	// 비공개(기본)면 지망 화면에 모둠장이 없다
	server.Stop()
	cfg.Request.LeaderPublic = false
	startForTest(t, server, cfg)
	phones = joinAll(t, server.current, 9)
	server.OpenVote(60)
	server.CloseVote()
	server.ConfirmLeaders([]string{"1|학생1", "2|학생2", "3|학생3"})
	if groups := fmt.Sprint(phones[5].state()["groups"]); strings.Contains(groups, "학생1") {
		t.Fatalf("비공개면 모둠장이 보이면 안 됩니다: %s", groups)
	}
}

// '함께 넣기' 짝은 둘 다 모둠장이 될 수 없다(추천에서 빼고, 직접 고르면 거부).
func TestLeadersRespectTogether(t *testing.T) {
	server := NewServer()
	cfg := courseConfig(9)
	cfg.Request.Mode = ModeDraft
	cfg.Together = []Pair{{A: "1|학생1", B: "2|학생2"}}
	startForTest(t, server, cfg)
	defer server.Stop()
	phones := joinAll(t, server.current, 9)
	if _, err := server.OpenVote(60); err != nil {
		t.Fatal(err)
	}
	for _, p := range phones {
		p.post("/vote", map[string]any{"candidates": []int{0, 1}})
	}
	info, _ := server.CloseVote()
	has1, has2 := false, false
	for _, key := range info.Suggested {
		has1 = has1 || key == "1|학생1"
		has2 = has2 || key == "2|학생2"
	}
	if has1 && has2 {
		t.Fatalf("함께 넣을 짝을 둘 다 추천하면 안 됩니다: %v", info.Suggested)
	}
	if _, err := server.ConfirmLeaders([]string{"1|학생1", "2|학생2", "3|학생3"}); err == nil || !strings.Contains(err.Error(), "함께 넣기") {
		t.Fatalf("함께 넣을 짝 둘 다 모둠장은 거부: %v", err)
	}
}
