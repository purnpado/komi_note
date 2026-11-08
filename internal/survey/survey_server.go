package survey

import (
	"encoding/base64"
	"errors"
	"fmt"
	"html/template"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	qrcode "github.com/skip2/go-qrcode"

	"TeacherNote/internal/system"
)

type surveySession struct {
	surveyID      string
	token         string
	shortCode     string
	listener      net.Listener
	server        *http.Server
	started       bool
	closed        bool
	publicResults bool
	joined        map[string]bool
	responded     map[string]bool
	paused        bool
}

// SurveyServer는 꼬미노트 실행 중에만 열리는 교실 내부 참여 서버입니다.
type SurveyServer struct {
	store    Store
	mu       sync.Mutex
	sessions map[string]*surveySession
}

func (s *SurveyServer) HasActiveSession() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed {
			return true
		}
	}
	return false
}

func (s *SurveyServer) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed && x.paused {
			return true
		}
	}
	return false
}

func (s *SurveyServer) PauseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed {
			x.paused = true
		}
	}
}

func (s *SurveyServer) ResumeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed {
			x.paused = false
		}
	}
}

func NewSurveyServer(store Store) *SurveyServer {
	return &SurveyServer{store: store, sessions: map[string]*surveySession{}}
}

func (s *SurveyServer) newSurveyShortCodeLocked() (string, error) {
	candidates := "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	for attempt := 0; attempt < 100; attempt++ {
		bytes, err := system.RandomBytes(4)
		if err != nil {
			return "", err
		}
		var builder strings.Builder
		for _, b := range bytes {
			builder.WriteByte(candidates[int(b)%len(candidates)])
		}
		code := builder.String()
		collision := false
		for _, session := range s.sessions {
			if session != nil && session.shortCode == code {
				collision = true
				break
			}
		}
		if !collision {
			return code, nil
		}
	}
	return "", errors.New("단축 코드를 생성하지 못했습니다")
}

func (s *SurveyServer) Start(surveyID string) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if active := s.sessions[surveyID]; active != nil {
		return s.infoLocked(active)
	}
	if _, err := s.store.GetSurvey(surveyID); err != nil {
		return SurveySessionInfo{}, err
	}
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return SurveySessionInfo{}, fmt.Errorf("교실 참여 서버를 열지 못했습니다: %w", err)
	}
	tokenBytes, err := system.RandomBytes(18)
	if err != nil {
		_ = listener.Close()
		return SurveySessionInfo{}, err
	}
	shortCode, err := s.newSurveyShortCodeLocked()
	if err != nil {
		_ = listener.Close()
		return SurveySessionInfo{}, err
	}
	session := &surveySession{surveyID: surveyID, token: base64.RawURLEncoding.EncodeToString(tokenBytes), shortCode: shortCode, listener: listener, joined: map[string]bool{}, responded: map[string]bool{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/survey/"+session.token, s.studentPage(session))
	mux.HandleFunc("/s/"+session.shortCode, s.studentPage(session))
	mux.HandleFunc("/board/"+session.token, s.boardPage(session))
	mux.HandleFunc("/api/"+session.token+"/state", s.stateAPI(session))
	mux.HandleFunc("/api/"+session.token+"/qr", s.qrAPI(session))
	mux.HandleFunc("/api/"+session.token+"/login", s.loginAPI(session))
	mux.HandleFunc("/api/"+session.token+"/answer", s.answerAPI(session))
	session.server = &http.Server{Handler: system.SecurityHeaders(mux), ReadHeaderTimeout: 5 * time.Second}
	s.sessions[surveyID] = session
	if err := s.store.SetSurveyStatus(surveyID, "참여 대기"); err != nil {
		delete(s.sessions, surveyID)
		_ = listener.Close()
		return SurveySessionInfo{}, err
	}
	go func() { _ = session.server.Serve(listener) }()
	return s.infoLocked(session)
}

func (s *SurveyServer) StartQuestions(surveyID string) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return SurveySessionInfo{}, errors.New("열려 있는 참여 회차가 없습니다")
	}
	session.started = true
	session.closed = false
	if err := s.store.SetSurveyStatus(surveyID, "진행 중"); err != nil {
		return SurveySessionInfo{}, err
	}
	return s.infoLocked(session)
}

func (s *SurveyServer) Stop(surveyID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return nil
	}
	session.closed = true
	_ = session.listener.Close()
	delete(s.sessions, surveyID)
	return s.store.SetSurveyStatus(surveyID, "마감")
}

func (s *SurveyServer) SetPublicResults(surveyID string, enabled bool) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return SurveySessionInfo{}, errors.New("열려 있는 참여 회차가 없습니다")
	}
	session.publicResults = enabled
	return s.infoLocked(session)
}

func (s *SurveyServer) Discard(surveyID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return
	}
	session.closed = true
	_ = session.listener.Close()
	delete(s.sessions, surveyID)
}

func (s *SurveyServer) Info(surveyID string) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		item, err := s.store.GetSurvey(surveyID)
		if err != nil {
			return SurveySessionInfo{}, err
		}
		return SurveySessionInfo{SurveyID: item.ID, Title: item.Title, Running: false, Closed: item.Status == "마감"}, nil
	}
	return s.infoLocked(session)
}

func (s *SurveyServer) infoLocked(session *surveySession) (SurveySessionInfo, error) {
	item, err := s.store.GetSurvey(session.surveyID)
	if err != nil {
		return SurveySessionInfo{}, err
	}
	port := session.listener.Addr().(*net.TCPAddr).Port
	address := system.LocalAddress(port)
	shortAddress := address
	studentURL := "http://" + shortAddress + "/s/" + session.shortCode
	png, err := qrcode.Encode(studentURL, qrcode.Medium, 240)
	if err != nil {
		return SurveySessionInfo{}, err
	}
	expected := item.ExpectedParticipants
	if expected == 0 {
		students, _ := s.store.ListStudents()
		expected = len(students)
	}
	notice := "학생 화면에서 인증 뒤 교사가 시작할 때까지 대기합니다."
	if session.started {
		notice = "현재 설문이 진행 중입니다."
	}
	if session.closed {
		notice = "설문이 마감되었습니다."
	}
	return SurveySessionInfo{SurveyID: item.ID, Title: item.Title, Running: true, Started: session.started, Closed: session.closed, PublicResults: session.publicResults, StudentURL: studentURL, ShortCode: session.shortCode, BoardURL: "http://" + address + "/board/" + session.token, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), ParticipantCnt: len(session.joined), ExpectedParticipants: expected, ResponseCnt: len(item.Responses), Notice: notice}, nil
}

func (s *SurveyServer) sessionStudent(r *http.Request, session *surveySession) string {
	cookie, err := r.Cookie("survey_student_" + session.token)
	if err != nil || cookie.Value == "" {
		return ""
	}
	return cookie.Value
}

func (s *SurveyServer) studentPage(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		_ = waitingStudentSurveyTemplate.Execute(w, map[string]any{"Title": item.Title, "Token": session.token})
	}
}

func (s *SurveyServer) boardPage(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		_ = boardSurveyTemplate.Execute(w, map[string]any{"Title": item.Title, "Token": session.token})
	}
}

func (s *SurveyServer) stateAPI(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		counts := map[string]map[string]int{}
		for _, q := range item.Questions {
			counts[q.ID] = map[string]int{}
			for _, option := range q.Options {
				counts[q.ID][option] = 0
			}
		}
		for _, response := range item.Responses {
			for qID, answer := range response.Answers {
				if _, ok := counts[qID][answer]; ok {
					counts[qID][answer]++
				}
			}
			for qID, answers := range response.MultiAnswers {
				for _, answer := range answers {
					if _, ok := counts[qID][answer]; ok {
						counts[qID][answer]++
					}
				}
			}
		}
		expected := item.ExpectedParticipants
		if expected == 0 {
			students, _ := s.store.ListStudents()
			expected = len(students)
		}
		// 학생 접속 처리와 동시에 회차 상태를 읽으므로 잠금 안에서 값을 복사합니다.
		s.mu.Lock()
		started, closed, publicResults, participants := session.started, session.closed, session.publicResults, len(session.joined)
		s.mu.Unlock()
		system.WriteJSON(w, map[string]any{
			"title":                item.Title,
			"started":              started,
			"closed":               closed,
			"publicResults":        publicResults,
			"participants":         participants,
			"expectedParticipants": expected,
			"responses":            len(item.Responses),
			"counts":               counts,
			"questions":            item.Questions,
		})
	}
}

func (s *SurveyServer) qrAPI(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		port := session.listener.Addr().(*net.TCPAddr).Port
		address := system.LocalAddress(port)
		studentURL := "http://" + address + "/s/" + session.shortCode
		png, err := qrcode.Encode(studentURL, qrcode.Medium, 280)
		if err != nil {
			http.Error(w, "QR을 생성하지 못했습니다", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}
}

func (s *SurveyServer) loginAPI(session *surveySession) http.HandlerFunc {
	type loginRequest struct {
		Name      string `json:"name"`
		BirthDate string `json:"birthDate"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var request loginRequest
		if err := system.DecodeJSONBody(r, &request); err != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		name := strings.TrimSpace(request.Name)
		birthDate := strings.ReplaceAll(strings.TrimSpace(request.BirthDate), "-", "")
		if name == "" {
			http.Error(w, "이름을 입력해 주세요", http.StatusBadRequest)
			return
		}
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		if item.Audience == "교직원" {
			studentID := "staff-" + name
			http.SetCookie(w, &http.Cookie{Name: "survey_student_" + session.token, Value: studentID, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
			s.mu.Lock()
			session.joined[studentID] = true
			s.mu.Unlock()
			system.WriteJSON(w, map[string]any{"ok": true, "name": name})
			return
		}
		students, err := s.store.ListStudents()
		if err != nil {
			http.Error(w, "학생 명렬을 확인하지 못했습니다", http.StatusInternalServerError)
			return
		}
		var matchedStudentID string
		for _, std := range students {
			stdBirth := strings.ReplaceAll(strings.TrimSpace(std.BirthDate), "-", "")
			if std.Name == name && (birthDate == "" || stdBirth == birthDate) {
				matchedStudentID = std.ID
				break
			}
		}
		if matchedStudentID == "" {
			http.Error(w, "일치하는 학생을 찾지 못했습니다", http.StatusUnauthorized)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "survey_student_" + session.token, Value: matchedStudentID, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
		s.mu.Lock()
		session.joined[matchedStudentID] = true
		s.mu.Unlock()
		system.WriteJSON(w, map[string]any{"ok": true, "name": name})
	}
}

func (s *SurveyServer) answerAPI(session *surveySession) http.HandlerFunc {
	type answerRequest struct {
		Answers      map[string]string   `json:"answers"`
		MultiAnswers map[string][]string `json:"multiAnswers"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		studentID := s.sessionStudent(r, session)
		if studentID == "" {
			http.Error(w, "먼저 참여 인증을 해 주세요", http.StatusUnauthorized)
			return
		}
		var request answerRequest
		if err := system.DecodeJSONBody(r, &request); err != nil {
			http.Error(w, "답변 형식이 올바르지 않습니다", http.StatusBadRequest)
			return
		}
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		respondentName := ""
		if !item.Anonymous {
			respondentName = studentID
		}
		if err := s.store.SubmitSurvey(session.surveyID, studentID, respondentName, request.Answers, request.MultiAnswers); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		session.responded[studentID] = true
		s.mu.Unlock()
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

var boardSurveyTemplate = template.Must(template.New("board").Parse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{.Title}} · 공개 화면</title><style>body{margin:0;padding:6vw;background:#fff8ed;color:#3b3028;font:clamp(17px,2.3vw,31px) Pretendard,Arial}h1{font-size:1.5em}.count{padding:1.1em;margin:.7em 0;border-radius:.7em;background:#fff;box-shadow:0 8px 25px #8f5a1c20}.option{display:flex;justify-content:space-between;padding:.3em 0}.muted{color:#876b55;font-size:.72em}</style><h1 id="title">{{.Title}}</h1><p class="muted">익명 공개 결과 · 교사용 꼬미노트에서만 실명 확인 가능</p><div id="content"></div><script>const api='/api/{{.Token}}/state';async function load(){const d=await fetch(api).then(r=>r.json());title.textContent=d.title+' · 참여 '+d.responses+'명';content.innerHTML=d.questions.map(q=>'<section class="count"><b>'+q.text+'</b>'+q.options.map(o=>'<div class="option"><span>'+o+'</span><strong>'+d.counts[q.id][o]+'명</strong></div>').join('')+'</section>').join('')}load();setInterval(load,2000)</script></html>`))

var waitingStudentSurveyTemplate = template.Must(template.New("waiting-student").Parse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{.Title}} · 꼬미노트</title><style>*{box-sizing:border-box}body{min-height:100vh;margin:0;padding:clamp(18px,5vw,60px);background:linear-gradient(145deg,#fff8ef,#fff0dc);color:#3e3129;font:clamp(15px,1.7vw,18px) Pretendard,Arial}.shell{width:min(760px,100%);margin:auto;padding:clamp(22px,5vw,48px);border-radius:clamp(18px,3vw,28px);background:#fff;box-shadow:0 14px 38px #8f5a1c20}.eyebrow{margin:0 0 14px;color:#a8612d;font-weight:800}.title{margin:0 0 28px;font-size:clamp(29px,6vw,52px);line-height:1.18;word-break:keep-all}.hint,.notice{line-height:1.6;color:#765a49}input,button{width:100%;font:inherit}#loginPanel input{margin:7px 0;padding:15px;border:1px solid #e8caaa;border-radius:12px;background:#fffdf9}button{margin-top:14px;padding:15px;border:0;border-radius:12px;background:#d87c35;color:#fff;font-weight:800}.waiting{padding:18px;border-radius:14px;background:#fff4e5;color:#8b5428;line-height:1.55}.hidden{display:none}fieldset{margin:0 0 28px;padding:0;border:0}legend{margin-bottom:13px;font-size:clamp(19px,3.2vw,26px);font-weight:800;line-height:1.42}.option{position:relative;display:grid;grid-template-columns:26px 31px minmax(0,1fr);align-items:center;gap:9px;margin:9px 0;padding:13px 14px;border:1px solid #ead8c5;border-radius:14px;background:#fffdf9;cursor:pointer}.option input{position:absolute;width:1px;height:1px;opacity:0}.choice-mark{width:23px;height:23px;border:2px solid #b9a997;border-radius:50%;background:#fff}.choice-number{display:grid;width:27px;height:27px;place-items:center;border-radius:50%;color:#926035;background:#f9e8d1;font-size:13px;font-weight:800}.choice-text{line-height:1.45;word-break:keep-all}.option:has(input:checked){border-color:#d87c35;background:#fff4e5;box-shadow:0 0 0 2px #f7d6b5}.option input:checked~.choice-mark{border-color:#d87c35;background:#d87c35;box-shadow:inset 0 0 0 5px #fff}.option input:focus-visible~.choice-mark{outline:3px solid #f4c796;outline-offset:2px}.notice{margin:18px 0 0;color:#a44b2d}@media(max-width:430px){body{padding:14px}.shell{padding:25px 21px}.option{grid-template-columns:24px 27px minmax(0,1fr);padding:12px 10px;gap:7px}}</style><main class="shell"><p class="eyebrow">꼬미노트 학급 참여</p><h1 class="title" id="title">{{.Title}}</h1><div id="loginPanel"><p class="hint">본인 확인 뒤 교사의 설문 시작을 기다립니다.</p><input id="name" placeholder="이름" autocomplete="name"><input id="birth" inputmode="numeric" placeholder="생년월일 8자리"><button onclick="joinSurvey()">참여하기</button></div><div id="waiting" class="waiting hidden">참여 인증이 완료되었습니다. 교사가 설문을 시작할 때까지 기다려 주세요.</div><form id="form" class="hidden" onsubmit="answer(event)"></form><p id="notice" class="notice"></p></main><script>const token='{{.Token}}',api='/api/'+token,form=document.querySelector('#form'),notice=document.querySelector('#notice'),nameInput=document.querySelector('#name'),birthInput=document.querySelector('#birth'),loginPanel=document.querySelector('#loginPanel'),waiting=document.querySelector('#waiting');let state,joined=false,answered=false,rendered=false;function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function renderQuestions(){form.innerHTML=state.questions.map((q,qi)=>'<fieldset><legend>'+(qi+1)+'. '+esc(q.text)+'</legend>'+q.options.map((o,oi)=>'<label class="option"><input required type="radio" name="'+esc(q.id)+'" value="'+esc(o)+'"><span class="choice-mark"></span><span class="choice-number">'+(oi+1)+'</span><span class="choice-text">'+esc(o)+'</span></label>').join('')+'</fieldset>').join('')+'<button>응답 제출</button>';rendered=true}async function load(){const r=await fetch(api+'/state');if(!r.ok)return;state=await r.json();title.textContent=state.title;if(joined&&!answered){if(state.closed){waiting.textContent='설문이 마감되었습니다.';return}if(state.started){waiting.classList.add('hidden');form.classList.remove('hidden');if(!rendered)renderQuestions()}else{waiting.classList.remove('hidden')}}}async function joinSurvey(){const r=await fetch(api+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:nameInput.value,birthDate:birthInput.value})});if(!r.ok){notice.textContent=await r.text();return}joined=true;loginPanel.classList.add('hidden');waiting.classList.remove('hidden');await load()}async function answer(e){e.preventDefault();const answers={};state.questions.forEach(q=>answers[q.id]=new FormData(form).get(q.id));const r=await fetch(api+'/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers})});notice.textContent=r.ok?'응답을 저장했습니다. 참여해 주셔서 고맙습니다.':await r.text();if(r.ok){answered=true;form.classList.add('hidden')}}load();setInterval(load,1800)</script></html>`))
