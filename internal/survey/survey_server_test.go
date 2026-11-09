package survey

import (
	"errors"
	"io"
	"net/http"
	"net/http/cookiejar"
	"strings"
	"sync"
	"testing"
)

type fakeStore struct {
	mu           sync.Mutex
	item         Survey
	participants []Participant
}

func (f *fakeStore) GetSurvey(id string) (Survey, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if id != f.item.ID {
		return Survey{}, errors.New("없음")
	}
	return f.item, nil
}
func (f *fakeStore) SetSurveyStatus(id, status string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.item.Status = status
	return nil
}
func (f *fakeStore) SubmitSurvey(id, studentID, name string, answers map[string]string, multi map[string][]string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	clean, cleanMulti, err := ValidateAnswers(f.item.Questions, answers, multi)
	if err != nil {
		return err
	}
	f.item.Responses = append(f.item.Responses, SurveyResponse{StudentID: studentID, RespondentName: name, Answers: clean, MultiAnswers: cleanMulti})
	return nil
}
func (f *fakeStore) SurveyParticipants(string) ([]Participant, error) { return f.participants, nil }

type phone struct {
	t      *testing.T
	client *http.Client
	base   string
}

func newPhone(t *testing.T, base string) *phone {
	jar, _ := cookiejar.New(nil)
	return &phone{t: t, client: &http.Client{Jar: jar}, base: base}
}

func (p *phone) post(path, body string) (int, string) {
	resp, err := p.client.Post(p.base+path, "application/json", strings.NewReader(body))
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(data)
}

func (p *phone) get(path string) string {
	resp, err := p.client.Get(p.base + path)
	if err != nil {
		p.t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return string(data)
}

func startTestSurvey(t *testing.T, item Survey) (*SurveyServer, *fakeStore, string) {
	t.Helper()
	item.ID = "sv"
	if item.Questions == nil {
		item.Questions = []SurveyQuestion{{ID: "q", Text: "질문", Type: TypeSingle, Options: []string{"가", "나"}}}
	}
	store := &fakeStore{item: item, participants: []Participant{{ID: "s1", Number: "1", Name: "가온"}, {ID: "s2", Number: "2", Name: "나래"}}}
	server := NewSurveyServer(store)
	info, err := server.Start("sv")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { server.Discard("sv") })
	port := info.BoardURL[strings.LastIndex(info.BoardURL, ":"):strings.Index(info.BoardURL, "/board")]
	return server, store, "http://127.0.0.1" + port + "/api/" + info.BoardURL[strings.LastIndex(info.BoardURL, "/")+1:]
}

func TestSurvey학생은번호와이름으로한기기만들어온다(t *testing.T) {
	server, _, base := startTestSurvey(t, Survey{Audience: "학생", Scope: "담임용"})
	first, second := newPhone(t, base), newPhone(t, base)
	if code, _ := first.post("/login", `{"number":"01","name":"가 온"}`); code != http.StatusOK {
		t.Fatalf("01번·띄어쓴 이름도 들어와야 합니다: %d", code)
	}
	if code, _ := second.post("/login", `{"number":"1","name":"가온"}`); code != http.StatusConflict {
		t.Fatalf("다른 기기는 막아야 합니다: %d", code)
	}
	if !strings.Contains(first.get("/state"), `"authenticated":true`) {
		t.Fatal("첫 기기는 확인된 상태여야 합니다")
	}
	if strings.Contains(first.get("/state"), `"questions"`) {
		t.Fatal("시작 전에는 문항을 보내지 않습니다")
	}
	info, err := server.ResetStudentAccess("sv", "s1")
	if err != nil || info.Participants[0].Joined {
		t.Fatalf("교사 초기화 뒤 접속이 풀려야 합니다: %+v %v", info.Participants, err)
	}
	if code, _ := second.post("/login", `{"number":"1","name":"가온"}`); code != http.StatusOK {
		t.Fatalf("초기화 뒤 다른 기기로 들어올 수 있어야 합니다: %d", code)
	}
}

func TestSurvey로그인5번틀리면잠시막는다(t *testing.T) {
	_, _, base := startTestSurvey(t, Survey{Audience: "학생", Scope: "담임용"})
	p := newPhone(t, base)
	codes := []int{}
	for i := 0; i < 6; i++ {
		code, _ := p.post("/login", `{"number":"9","name":"없음"}`)
		codes = append(codes, code)
	}
	if codes[3] != http.StatusUnauthorized || codes[4] != http.StatusTooManyRequests || codes[5] != http.StatusTooManyRequests {
		t.Fatalf("5번째부터 막아야 합니다: %v", codes)
	}
}

func TestSurvey응답은한번만시작뒤에만받는다(t *testing.T) {
	server, store, base := startTestSurvey(t, Survey{Audience: "학생", Scope: "담임용"})
	p := newPhone(t, base)
	p.post("/login", `{"number":"2","name":"나래"}`)
	if code, _ := p.post("/answer", `{"answers":{"q":"가"}}`); code != http.StatusLocked {
		t.Fatalf("시작 전 응답은 막아야 합니다: %d", code)
	}
	if _, err := server.StartQuestions("sv"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.get("/state"), `"questions"`) {
		t.Fatal("시작 뒤에는 확인된 기기에 문항을 보냅니다")
	}
	if code, body := p.post("/answer", `{"answers":{"q":"가"}}`); code != http.StatusOK {
		t.Fatalf("응답 저장 실패: %d %s", code, body)
	}
	if code, _ := p.post("/answer", `{"answers":{"q":"나"}}`); code != http.StatusConflict {
		t.Fatalf("두 번째 응답은 막아야 합니다: %d", code)
	}
	if len(store.item.Responses) != 1 || store.item.Responses[0].StudentID != "s2" {
		t.Fatalf("응답 하나만 저장돼야 합니다: %+v", store.item.Responses)
	}
	server.ResetStudentAccess("sv", "s2")
	again := newPhone(t, base)
	if code, _ := again.post("/login", `{"number":"2","name":"나래"}`); code != http.StatusConflict {
		t.Fatalf("이미 응답한 학생은 초기화 뒤에도 다시 낼 수 없습니다: %d", code)
	}
}

func TestSurvey결과는마감뒤공개할때만보인다(t *testing.T) {
	server, _, base := startTestSurvey(t, Survey{Audience: "학생", Scope: "담임용"})
	board := newPhone(t, base)
	server.StartQuestions("sv")
	if _, err := server.SetPublicResults("sv", true); err == nil {
		t.Fatal("진행 중에는 결과를 공개할 수 없습니다")
	}
	if err := server.Stop("sv"); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(board.get("/state"), `"results"`) {
		t.Fatal("공개를 켜기 전에는 결과를 보내지 않습니다")
	}
	if _, err := server.SetPublicResults("sv", true); err != nil {
		t.Fatalf("마감 뒤 공개는 됩니다: %v", err)
	}
	state := board.get("/state")
	if !strings.Contains(state, `"results"`) || strings.Contains(state, "가온") {
		t.Fatalf("결과는 이름 없이 보여야 합니다: %s", state)
	}
}

func TestSurvey교직원이름입력과익명(t *testing.T) {
	_, store, base := startTestSurvey(t, Survey{Audience: "교직원", Scope: "업무용", StaffIdentityMode: "이름 입력"})
	p := newPhone(t, base)
	if code, _ := p.post("/login", `{"name":""}`); code != http.StatusBadRequest {
		t.Fatalf("이름 입력 방식은 이름이 필요합니다: %d", code)
	}
	if code, _ := p.post("/login", `{"name":"김선생"}`); code != http.StatusOK {
		t.Fatalf("교직원 이름으로 들어와야 합니다: %d", code)
	}
	if label := respondentLabel(store.item, "staff|김선생|김선생"); label != "김선생" {
		t.Fatalf("교사 화면에는 입력한 이름: %q", label)
	}
	if label := respondentLabel(Survey{Anonymous: true}, "s1"); label != "" {
		t.Fatalf("익명 학생 설문은 이름을 남기지 않습니다: %q", label)
	}
}
