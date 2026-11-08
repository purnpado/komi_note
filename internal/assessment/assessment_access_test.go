package assessment

import (
	"net"
	"net/http"
	"net/http/cookiejar"
	"strconv"
	"strings"
	"testing"
)

func accessTestServer(t *testing.T) (*AssessmentServer, string, func(body string) (int, *http.Client)) {
	t.Helper()
	item := Assessment{ID: "access", Title: "가상 평가", Subject: "기술", ClassName: "1",
		Students: []AssessmentStudent{{ID: "s1", Number: "1", Name: "가온"}, {ID: "s2", Number: "2", Name: "나 래"}},
		Domains:  []AssessmentDomain{{ID: "d", Name: "설계", MaxScore: 40}}}
	server := NewAssessmentServer(&mockAssessmentStore{items: []Assessment{item}}, NewAssessmentEventBus())
	if _, err := server.Start(item.ID, "d"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = server.Stop(item.ID, "d") })
	session := server.sessions[assessmentSessionKey(item.ID, "d", "score")]
	api := "http://127.0.0.1:" + strconv.Itoa(session.listener.Addr().(*net.TCPAddr).Port) + "/assessment-api/" + session.token
	login := func(body string) (int, *http.Client) {
		jar, _ := cookiejar.New(nil)
		client := &http.Client{Jar: jar}
		res, err := client.Post(api+"/login", "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		_ = res.Body.Close()
		return res.StatusCode, client
	}
	return server, api, login
}

func TestAssessmentLoginAcceptsLeadingZeroAndSpaces(t *testing.T) {
	_, _, login := accessTestServer(t)
	if code, _ := login(`{"number":"01","name":"가온"}`); code != http.StatusOK {
		t.Fatalf("번호 01로도 들어와야 합니다: %d", code)
	}
	if code, _ := login(`{"number":"2번","name":"나래"}`); code != http.StatusOK {
		t.Fatalf("2번·띄어쓰기 다른 이름으로도 들어와야 합니다: %d", code)
	}
}

func TestAssessmentLoginBlocksOtherDeviceUntilTeacherReset(t *testing.T) {
	server, _, login := accessTestServer(t)
	if code, _ := login(`{"number":"1","name":"가온"}`); code != http.StatusOK {
		t.Fatal("첫 기기 로그인 실패")
	}
	if code, _ := login(`{"number":"1","name":"가온"}`); code != http.StatusConflict {
		t.Fatalf("다른 기기는 같은 번호·이름으로 들어올 수 없어야 합니다: %d", code)
	}
	info, err := server.ResetStudentAccess("access", "d", "score", "s1")
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range info.Participants {
		if p.StudentID == "s1" {
			t.Fatalf("초기화한 학생이 접속 목록에 남아 있습니다: %#v", info.Participants)
		}
	}
	if code, _ := login(`{"number":"1","name":"가온"}`); code != http.StatusOK {
		t.Fatalf("교사 초기화 뒤에는 다시 들어올 수 있어야 합니다: %d", code)
	}
}

func TestAssessmentLoginRateLimit(t *testing.T) {
	_, _, login := accessTestServer(t)
	codes := []int{}
	for i := 0; i < 6; i++ {
		code, _ := login(`{"number":"9","name":"없음"}`)
		codes = append(codes, code)
	}
	if codes[4] != http.StatusTooManyRequests || codes[5] != http.StatusTooManyRequests {
		t.Fatalf("5번 틀리면 30초 동안 막아야 합니다: %v", codes)
	}
	if code, _ := login(`{"number":"1","name":"가온"}`); code != http.StatusTooManyRequests {
		t.Fatalf("막힌 동안에는 맞는 번호도 잠시 기다려야 합니다: %d", code)
	}
}

func TestAssessmentParticipantsListShowsStatus(t *testing.T) {
	server, _, login := accessTestServer(t)
	login(`{"number":"2","name":"나래"}`)
	info, err := server.Info("access", "d")
	if err != nil {
		t.Fatal(err)
	}
	if len(info.Participants) != 1 || info.Participants[0].Status != "확인 중" || info.Participants[0].Number != "2" {
		t.Fatalf("접속 학생 목록이 올바르지 않습니다: %#v", info.Participants)
	}
}
