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
