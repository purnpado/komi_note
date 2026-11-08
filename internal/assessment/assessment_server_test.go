package assessment

import (
	"bytes"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"TeacherNote/internal/students"
)

type mockAssessmentStore struct {
	items []Assessment
}

func (m *mockAssessmentStore) GetAssessment(id string) (Assessment, error) {
	for _, it := range m.items {
		if it.ID == id {
			return it, nil
		}
	}
	return Assessment{}, errors.New("평가를 찾지 못했습니다")
}

func (m *mockAssessmentStore) AddAssessmentHistory(id, historyType, studentID, domainID, detail string) error {
	return nil
}

func (m *mockAssessmentStore) SubmitAssessmentObjection(id, domainID, studentID, content string) error {
	return nil
}

func (m *mockAssessmentStore) ListStudents() ([]students.Student, error) {
	return nil, nil
}

// TestManualAssessmentBrowserPreview는 명시적으로 요청한 경우에만 메모리 가상 평가를
// 로컬 HTTP 서버로 공개한다. 실제 보관함·실제 학생 정보·저장 파일에는 접근하지 않는다.
func TestManualAssessmentBrowserPreview(t *testing.T) {
	seconds, err := strconv.Atoi(os.Getenv("KKOMI_BROWSER_PREVIEW_SECONDS"))
	if err != nil || seconds < 1 {
		t.Skip("수동 브라우저 검수에서만 실행합니다")
	}
	value := 38.0
	item := Assessment{
		ID:        "manual-browser-preview",
		Title:     "[가상 검수] 기술·가정 수행평가",
		Subject:   "기술·가정",
		ClassName: "1",
		Students:  []AssessmentStudent{{ID: "student-1", Number: "1", Name: "가온"}},
		Domains: []AssessmentDomain{{
			ID:       "domain-1",
			Name:     "에너지 마을 설계",
			MaxScore: 40,
			Criteria: []AssessmentCriterion{{ID: "criterion-1", Name: "영역 점수", MaxScore: 40}},
		}},
		Scores: []AssessmentScore{{
			StudentID: "student-1",
			Domains:   []AssessmentDomainScore{{DomainID: "domain-1", Criteria: []AssessmentCriterionScore{{CriterionID: "criterion-1", Score: &value}}}},
		}},
	}
	store := &mockAssessmentStore{items: []Assessment{item}}
	server := NewAssessmentServer(store, NewAssessmentEventBus())
	info, err := server.Start(item.ID, "domain-1")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = server.Stop(item.ID, "domain-1") }()
	parsed, err := url.Parse(info.StudentURL)
	if err != nil {
		t.Fatal(err)
	}
	parsed.Host = "localhost:" + parsed.Port()
	t.Logf("학생 브라우저 주소: %s", parsed.String())
	t.Log("가상 로그인 정보: 번호 1, 이름 가온")
	time.Sleep(time.Duration(seconds) * time.Second)
}

func TestAssessmentPublicDomainsOnlyReturnsStudentScore(t *testing.T) {
	value := 18.0
	item := Assessment{
		Domains: []AssessmentDomain{{ID: "domain", Name: "보고서", MaxScore: 20, Criteria: []AssessmentCriterion{{ID: "criterion", Name: "내용", MaxScore: 20}}}},
		Scores:  []AssessmentScore{{StudentID: "one", Domains: []AssessmentDomainScore{{DomainID: "domain", Criteria: []AssessmentCriterionScore{{CriterionID: "criterion", Score: &value, Reason: "근거가 충분합니다."}}}}}},
	}
	result := assessmentPublicDomains(item, item.Scores[0])
	if len(result) != 1 || result[0]["name"] != "보고서" {
		t.Fatalf("공개 점수 구성이 다름: %#v", result)
	}
	criteria := result[0]["criteria"].([]map[string]any)
	if score, ok := criteria[0]["score"].(*float64); !ok || *score != 18 {
		t.Fatalf("본인 점수를 반환하지 못함: %#v", criteria)
	}
	if reason := criteria[0]["reason"]; reason != "근거가 충분합니다." {
		t.Fatalf("채점 사유를 반환하지 못함: %#v", criteria)
	}
}

func TestAssessmentPublicDomainHidesLegacyImportedCriterionImmediately(t *testing.T) {
	value := 36.0
	item := Assessment{
		Domains: []AssessmentDomain{{ID: "domain", Name: "설계", MaxScore: 40, Criteria: []AssessmentCriterion{{ID: "legacy", Name: "영역 점수", MaxScore: 40}}}},
		Scores:  []AssessmentScore{{StudentID: "student", Domains: []AssessmentDomainScore{{DomainID: "domain", Criteria: []AssessmentCriterionScore{{CriterionID: "legacy", Score: &value}}}}}},
	}
	result, ok := assessmentPublicDomain(item, item.Scores[0], "domain")
	if !ok {
		t.Fatal("기존 평가 영역을 찾지 못함")
	}
	if criteria := result["criteria"].([]map[string]any); len(criteria) != 0 {
		t.Fatalf("기존 영역 점수 열을 즉시 숨기지 못함: %#v", criteria)
	}
	if imported, ok := result["importedScore"].(*float64); !ok || *imported != value {
		t.Fatalf("기존 영역 총점을 참고용 원본 총점으로 옮기지 못함: %#v", result)
	}
}

func TestAssessmentStudentStateAPIRespondsBeforeLogin(t *testing.T) {
	item := Assessment{ID: "state-api", Title: "가상 평가", Subject: "기술·가정", ClassName: "1", Students: []AssessmentStudent{{ID: "student", Number: "1", Name: "가온"}}, Domains: []AssessmentDomain{{ID: "domain", Name: "설계", MaxScore: 40}}}
	store := &mockAssessmentStore{items: []Assessment{item}}
	server := NewAssessmentServer(store, NewAssessmentEventBus())
	if _, err := server.Start(item.ID, "domain"); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = server.Stop(item.ID, "domain") }()
	session := server.sessions[assessmentSessionKey(item.ID, "domain", "score")]
	port := session.listener.Addr().(*net.TCPAddr).Port
	response, err := http.Get("http://127.0.0.1:" + strconv.Itoa(port) + "/assessment-api/" + session.token + "/state")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("학생 상태 API 응답 코드가 다름: %d", response.StatusCode)
	}
	var state map[string]any
	if err := json.NewDecoder(response.Body).Decode(&state); err != nil {
		t.Fatal(err)
	}
	if authenticated, ok := state["authenticated"].(bool); !ok || authenticated {
		t.Fatalf("로그인 전 상태가 잘못됨: %#v", state)
	}
	loginResponse, err := http.Post("http://127.0.0.1:"+strconv.Itoa(port)+"/assessment-api/"+session.token+"/login", "application/json", strings.NewReader(`{"number":"1","name":"가온"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer loginResponse.Body.Close()
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("학생 로그인 API 응답 코드가 다름: %d", loginResponse.StatusCode)
	}
	var rendered bytes.Buffer
	if err := assessmentStudentTemplate.Execute(&rendered, map[string]any{"Title": "가상 평가", "DomainName": "설계", "Token": "student-token", "Authenticated": false}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(rendered.String(), `const token="student-token"`) {
		t.Fatalf("학생 페이지 토큰이 API 경로용 문자열로 출력되지 않음: %s", rendered.String())
	}
	if strings.Count(rendered.String(), `id="content"`) != 1 || !strings.Contains(rendered.String(), `id="objection-content"`) || !strings.Contains(rendered.String(), `content=input.value.trim()`) {
		t.Fatalf("이의 입력란 식별자 또는 제출값 연결이 잘못됨: %s", rendered.String())
	}
}

func TestAssessmentAnswerReviewShowsOnlyOwnAnsweredObjection(t *testing.T) {
	item := Assessment{ID: "answer-api", Title: "가상 평가", Subject: "기술·가정", ClassName: "1", Students: []AssessmentStudent{{ID: "student-1", Number: "1", Name: "가온"}, {ID: "student-2", Number: "2", Name: "나온"}}, Domains: []AssessmentDomain{{ID: "domain-1", Name: "설계", MaxScore: 40}}, Objections: []AssessmentObjection{{ID: "answered", StudentID: "student-1", DomainID: "domain-1", Content: "점수를 확인해 주세요", Answer: "채점 기준을 다시 확인했습니다.", Status: "답변 완료"}, {ID: "other", StudentID: "student-2", DomainID: "domain-1", Content: "다른 학생 이의", Answer: "다른 학생 답변", Status: "답변 완료"}}}
	store := &mockAssessmentStore{items: []Assessment{item}}
	server := NewAssessmentServer(store, NewAssessmentEventBus())
	_, err := server.StartAnswerReview(item.ID, "domain-1")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = server.StopAnswerReview(item.ID, "domain-1") }()
	session := server.sessions[assessmentSessionKey(item.ID, "domain-1", "answer")]
	base := "http://127.0.0.1:" + strconv.Itoa(session.listener.Addr().(*net.TCPAddr).Port) + "/assessment-api/" + session.token
	response, err := http.Post(base+"/login", "application/json", strings.NewReader(`{"number":"1","name":"가온"}`))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("답변 QR 인증 실패: %s", response.Status)
	}
	cookie := response.Cookies()[0]
	_ = response.Body.Close()
	request, _ := http.NewRequest(http.MethodGet, base+"/state", nil)
	request.AddCookie(cookie)
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var payload map[string]any
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload["answerOnly"] != true || payload["domain"] != nil {
		t.Fatalf("답변 QR에서 점수 정보가 노출됨: %#v", payload)
	}
	rows, ok := payload["objections"].([]any)
	if !ok || len(rows) != 1 {
		t.Fatalf("본인 답변만 보여야 함: %#v", payload)
	}
}

func TestAssessmentPublicDomainOnlyReturnsSelectedDomain(t *testing.T) {
	first, second := 18.0, 27.0
	item := Assessment{Domains: []AssessmentDomain{
		{ID: "first", Name: "보고서", MaxScore: 20, Criteria: []AssessmentCriterion{{ID: "a", Name: "내용", MaxScore: 20}}},
		{ID: "second", Name: "발표", MaxScore: 30, Criteria: []AssessmentCriterion{{ID: "b", Name: "전달", MaxScore: 30}}},
	}, Scores: []AssessmentScore{{StudentID: "one", Domains: []AssessmentDomainScore{{DomainID: "first", Criteria: []AssessmentCriterionScore{{CriterionID: "a", Score: &first}}}, {DomainID: "second", Criteria: []AssessmentCriterionScore{{CriterionID: "b", Score: &second}}}}}}}
	result, ok := assessmentPublicDomain(item, item.Scores[0], "second")
	if !ok || result["name"] != "발표" {
		t.Fatalf("선택 영역 공개 구성이 다름: %#v", result)
	}
	criteria := result["criteria"].([]map[string]any)
	if len(criteria) != 1 || criteria[0]["score"] == nil {
		t.Fatalf("선택 영역 점수를 반환하지 못함: %#v", criteria)
	}
}

func TestAssessmentDisplayTitleHidesNAISFileName(t *testing.T) {
	item := Assessment{Title: "수행평가 파일일괄등록 - 2026학년도 2학기.xlsx", Subject: "기술·가정", ClassName: "2-1"}
	if got := assessmentDisplayTitle(item); got != "기술·가정 · 2-1 수행평가" {
		t.Fatalf("자동 파일명 공개 제목이 다름: %q", got)
	}
	item.Title = "에너지 마을 설계"
	if got := assessmentDisplayTitle(item); got != item.Title {
		t.Fatalf("교사 지정 제목을 유지하지 못함: %q", got)
	}
}

func TestAssessmentEventBusDeliversDomainEvent(t *testing.T) {
	bus := NewAssessmentEventBus()
	var received AssessmentEvent
	remove := bus.Subscribe(func(event AssessmentEvent) { received = event })
	bus.Publish(AssessmentEvent{Type: "점수변경", AssessmentID: "test"})
	remove()
	if received.Type != "점수변경" || received.AssessmentID != "test" || received.OccurredAt == "" {
		t.Fatalf("이벤트를 받지 못함: %#v", received)
	}
}

// TestAssessmentStudentPageConcurrentLoginIsRaceFree는 수업 중 여러 학생이 동시에
// QR 페이지를 열고 로그인·확인 완료할 때 접속 목록 map을 안전하게 다루는지 검사한다.
// 잠금이 빠지면 -race 검사에서 실패하고, 실제 실행에서는 프로그램이 강제 종료될 수 있다.
func TestAssessmentStudentPageConcurrentLoginIsRaceFree(t *testing.T) {
	const studentCount = 30
	item := Assessment{ID: "concurrent", Title: "가상 평가", Subject: "기술·가정", ClassName: "1", Domains: []AssessmentDomain{{ID: "domain", Name: "설계", MaxScore: 40}}}
	for index := 1; index <= studentCount; index++ {
		number := strconv.Itoa(index)
		item.Students = append(item.Students, AssessmentStudent{ID: "student-" + number, Number: number, Name: "가상" + number})
	}
	store := &mockAssessmentStore{items: []Assessment{item}}
	server := NewAssessmentServer(store, NewAssessmentEventBus())
	if _, err := server.Start(item.ID, "domain"); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = server.Stop(item.ID, "domain") }()
	server.mu.Lock()
	session := server.sessions[assessmentSessionKey(item.ID, "domain", "score")]
	server.mu.Unlock()
	origin := "http://127.0.0.1:" + strconv.Itoa(session.listener.Addr().(*net.TCPAddr).Port)
	api := origin + "/assessment-api/" + session.token

	var wait sync.WaitGroup
	errs := make(chan error, studentCount)
	for index := 1; index <= studentCount; index++ {
		wait.Add(1)
		go func(number string) {
			defer wait.Done()
			login, err := http.Post(api+"/login", "application/json", strings.NewReader(`{"number":"`+number+`","name":"가상`+number+`"}`))
			if err != nil {
				errs <- err
				return
			}
			_ = login.Body.Close()
			if login.StatusCode != http.StatusOK || len(login.Cookies()) == 0 {
				errs <- errors.New(number + "번 로그인 실패: " + login.Status)
				return
			}
			// 로그인한 학생이 새로고침하는 동안 다른 학생이 로그인·확인 완료하는 상황을 재현한다.
			for repeat := 0; repeat < 5; repeat++ {
				pageRequest, _ := http.NewRequest(http.MethodGet, origin+"/a/"+session.shortCode, nil)
				pageRequest.AddCookie(login.Cookies()[0])
				page, err := http.DefaultClient.Do(pageRequest)
				if err != nil {
					errs <- err
					return
				}
				_ = page.Body.Close()
			}
			request, _ := http.NewRequest(http.MethodPost, api+"/complete", strings.NewReader(`{}`))
			request.AddCookie(login.Cookies()[0])
			complete, err := http.DefaultClient.Do(request)
			if err != nil {
				errs <- err
				return
			}
			_ = complete.Body.Close()
			if complete.StatusCode != http.StatusOK {
				errs <- errors.New(number + "번 확인 완료 실패: " + complete.Status)
			}
		}(strconv.Itoa(index))
	}
	wait.Wait()
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	server.mu.Lock()
	completed := len(session.completed)
	server.mu.Unlock()
	if completed != studentCount {
		t.Fatalf("확인 완료 학생 수가 다름: %d", completed)
	}
}
