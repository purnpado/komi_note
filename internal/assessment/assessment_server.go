package assessment

import (
	"encoding/base64"
	"encoding/json"
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

type assessmentSession struct {
	assessmentID string
	domainID     string
	token        string
	shortCode    string
	listener     net.Listener
	server       *http.Server
	paused       bool
	closed       bool
	activeByUser map[string]string
	verified     map[string]bool
	completed    map[string]bool
	mode         string
	// loginAttempts는 회차 메모리에만 두는 IP별 로그인 실패 기록이다(번호·이름 무작위 대입 방지).
	loginAttempts map[string]assessmentLoginAttempt
}

// AssessmentServer는 수행평가 확인에만 쓰는 교실 내부 임시 HTTP 서버입니다.
// 성적은 URL, QR, 전자칠판 상태에 포함하지 않고 암호화 보관함에서 인증 뒤에만 읽습니다.
type AssessmentServer struct {
	store    Store
	events   *AssessmentEventBus
	mu       sync.Mutex
	sessions map[string]*assessmentSession
}

func NewAssessmentServer(store Store, events *AssessmentEventBus) *AssessmentServer {
	return &AssessmentServer{store: store, events: events, sessions: map[string]*assessmentSession{}}
}

func (s *AssessmentServer) HasActiveSession() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed {
			return true
		}
	}
	return false
}

func (s *AssessmentServer) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed && session.paused {
			return true
		}
	}
	return false
}

func (s *AssessmentServer) PauseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed {
			session.paused = true
		}
	}
}

func (s *AssessmentServer) ResumeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed {
			session.paused = false
		}
	}
}

func assessmentToken() (string, error) {
	bytes, err := system.RandomBytes(18)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func (s *AssessmentServer) newShortCodeLocked() (string, error) {
	const letters = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	for attempt := 0; attempt < 20; attempt++ {
		bytes, err := system.RandomBytes(6)
		if err != nil {
			return "", err
		}
		code := make([]byte, 6)
		for index, value := range bytes {
			code[index] = letters[int(value)%len(letters)]
		}
		candidate := string(code)
		used := false
		for _, session := range s.sessions {
			if session.shortCode == candidate {
				used = true
				break
			}
		}
		if !used {
			return candidate, nil
		}
	}
	return "", errors.New("수행평가 확인 주소를 만들지 못했습니다")
}

func assessmentSessionKey(assessmentID, domainID, mode string) string {
	return assessmentID + ":" + domainID + ":" + mode
}

func assessmentDomain(item Assessment, domainID string) (AssessmentDomain, bool) {
	for _, domain := range item.Domains {
		if domain.ID == domainID {
			return domain, true
		}
	}
	return AssessmentDomain{}, false
}

// assessmentDisplayTitle은 나이스 자동 파일명을 공개 화면의 짧은 평가명으로 바꿉니다.
// 교사가 직접 저장한 제목은 그대로 보존합니다.
func assessmentDisplayTitle(item Assessment) string {
	title := strings.TrimSpace(item.Title)
	if strings.Contains(title, "수행평가 파일일괄등록") {
		return strings.TrimSpace(item.Subject) + " · " + strings.TrimSpace(item.ClassName) + " 수행평가"
	}
	return title
}

func (s *AssessmentServer) Start(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return s.start(assessmentID, domainID, "score")
}

// StartAnswerReview는 답변 완료 이의만 다시 확인하는 QR 회차를 엽니다.
func (s *AssessmentServer) StartAnswerReview(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return s.start(assessmentID, domainID, "answer")
}

func (s *AssessmentServer) start(assessmentID, domainID, mode string) (AssessmentSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := assessmentSessionKey(assessmentID, domainID, mode)
	if active := s.sessions[key]; active != nil && !active.closed {
		return s.infoLocked(active)
	}
	item, err := s.store.GetAssessment(assessmentID)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	if _, ok := assessmentDomain(item, domainID); !ok {
		return AssessmentSessionInfo{}, errors.New("확인할 평가 영역을 찾지 못했습니다")
	}
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return AssessmentSessionInfo{}, fmt.Errorf("수행평가 확인 서버를 열지 못했습니다: %w", err)
	}
	token, err := assessmentToken()
	if err != nil {
		_ = listener.Close()
		return AssessmentSessionInfo{}, err
	}
	shortCode, err := s.newShortCodeLocked()
	if err != nil {
		_ = listener.Close()
		return AssessmentSessionInfo{}, err
	}
	session := &assessmentSession{assessmentID: assessmentID, domainID: domainID, token: token, shortCode: shortCode, listener: listener, activeByUser: map[string]string{}, verified: map[string]bool{}, completed: map[string]bool{}, mode: mode, loginAttempts: map[string]assessmentLoginAttempt{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/assessment/"+session.token, s.studentPage(session))
	mux.HandleFunc("/a/"+session.shortCode, s.studentPage(session))
	mux.HandleFunc("/assessment-board/"+session.token, s.boardPage(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/state", s.stateAPI(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/board-state", s.boardStateAPI(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/qr", s.qrAPI(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/login", s.loginAPI(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/complete", s.completeAPI(session))
	mux.HandleFunc("/assessment-api/"+session.token+"/objection", s.objectionAPI(session))
	session.server = &http.Server{Handler: system.SecurityHeaders(mux), ReadHeaderTimeout: 5 * time.Second}
	s.sessions[key] = session
	go func() { _ = session.server.Serve(listener) }()
	eventType := "공개시작"
	if mode == "answer" {
		eventType = "답변공개시작"
	}
	s.events.Publish(AssessmentEvent{Type: eventType, AssessmentID: assessmentID, DomainID: domainID})
	return s.infoLocked(session)
}

func (s *AssessmentServer) Stop(assessmentID, domainID string) error {
	return s.stop(assessmentID, domainID, "score")
}

func (s *AssessmentServer) StopAnswerReview(assessmentID, domainID string) error {
	return s.stop(assessmentID, domainID, "answer")
}

func (s *AssessmentServer) stop(assessmentID, domainID, mode string) error {
	s.mu.Lock()
	session := s.sessions[assessmentSessionKey(assessmentID, domainID, mode)]
	if session == nil {
		s.mu.Unlock()
		return nil
	}
	session.closed = true
	session.activeByUser = map[string]string{}
	s.mu.Unlock()
	_ = session.server.Close()
	_ = session.listener.Close()
	eventType := "세션종료"
	if mode == "answer" {
		eventType = "답변공개종료"
	}
	s.events.Publish(AssessmentEvent{Type: eventType, AssessmentID: assessmentID, DomainID: domainID})
	return nil
}

func (s *AssessmentServer) Discard(assessmentID string) {
	s.mu.Lock()
	keys := make([]string, 0)
	for key, session := range s.sessions {
		if session.assessmentID == assessmentID && !session.closed {
			keys = append(keys, key)
		}
	}
	s.mu.Unlock()
	for _, key := range keys {
		parts := strings.SplitN(key, ":", 3)
		if len(parts) == 3 {
			_ = s.stop(parts[0], parts[1], parts[2])
		}
	}
}

func (s *AssessmentServer) Info(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return s.info(assessmentID, domainID, "score")
}

func (s *AssessmentServer) AnswerReviewInfo(assessmentID, domainID string) (AssessmentSessionInfo, error) {
	return s.info(assessmentID, domainID, "answer")
}

func (s *AssessmentServer) info(assessmentID, domainID, mode string) (AssessmentSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if session := s.sessions[assessmentSessionKey(assessmentID, domainID, mode)]; session != nil && !session.closed {
		return s.infoLocked(session)
	}
	item, err := s.store.GetAssessment(assessmentID)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	domain, ok := assessmentDomain(item, domainID)
	if !ok {
		return AssessmentSessionInfo{}, errors.New("확인할 평가 영역을 찾지 못했습니다")
	}
	return AssessmentSessionInfo{AssessmentID: item.ID, DomainID: domain.ID, DomainName: domain.Name, Title: assessmentDisplayTitle(item), Mode: mode, Notice: "이 영역의 확인 QR이 열려 있지 않습니다."}, nil
}

func (s *AssessmentServer) infoLocked(session *assessmentSession) (AssessmentSessionInfo, error) {
	item, err := s.store.GetAssessment(session.assessmentID)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	domain, ok := assessmentDomain(item, session.domainID)
	if !ok {
		return AssessmentSessionInfo{}, errors.New("확인할 평가 영역을 찾지 못했습니다")
	}
	address := system.LocalAddress(session.listener.Addr().(*net.TCPAddr).Port)
	studentURL := "http://" + address + "/a/" + session.shortCode
	png, err := qrcode.Encode(studentURL, qrcode.Medium, 280)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	objections := 0
	for _, objection := range item.Objections {
		if objection.Status != "답변 완료" {
			objections++
		}
	}
	notice := "QR을 스캔한 뒤 수업 반·번호와 이름으로 이 영역의 본인 점수만 확인합니다."
	if session.mode == "answer" {
		notice = "QR을 스캔한 뒤 수업 반·번호와 이름으로 본인의 이의 답변만 확인합니다."
	}
	if session.paused {
		notice = "교사가 확인 회차를 일시정지했습니다."
	}
	return AssessmentSessionInfo{AssessmentID: item.ID, DomainID: domain.ID, DomainName: domain.Name, Title: assessmentDisplayTitle(item), Running: !session.closed, StudentURL: studentURL, BoardURL: "http://" + address + "/assessment-board/" + session.token, ShortCode: session.shortCode, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), VerifiedCount: len(session.verified), CompletedCount: len(session.completed), ObjectionCount: objections, Notice: notice, Mode: session.mode, Participants: assessmentParticipants(item, session)}, nil
}

func (s *AssessmentServer) studentIDFromRequest(r *http.Request, session *assessmentSession) string {
	cookie, err := r.Cookie("kkomi-assessment-session")
	if err != nil {
		return ""
	}
	for studentID, token := range session.activeByUser {
		if token == cookie.Value {
			return studentID
		}
	}
	return ""
}

func (s *AssessmentServer) studentPage(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 준비하지 못했습니다", http.StatusServiceUnavailable)
			return
		}
		domain, ok := assessmentDomain(item, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		// 다른 학생의 로그인·확인 완료가 activeByUser를 동시에 바꾸므로 잠금 안에서 조회합니다.
		// 잠금 없이 map을 읽으면 Go 런타임이 프로그램 전체를 강제 종료할 수 있습니다.
		s.mu.Lock()
		authenticated := s.studentIDFromRequest(r, session) != ""
		s.mu.Unlock()
		_ = assessmentStudentTemplate.Execute(w, map[string]any{"Title": assessmentDisplayTitle(item), "DomainName": domain.Name, "Token": session.token, "Authenticated": authenticated, "AnswerOnly": session.mode == "answer"})
	}
}

func (s *AssessmentServer) boardPage(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 준비하지 못했습니다", http.StatusServiceUnavailable)
			return
		}
		domain, ok := assessmentDomain(item, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		address := system.LocalAddress(session.listener.Addr().(*net.TCPAddr).Port)
		_ = assessmentBoardTemplate.Execute(w, map[string]any{"Title": assessmentDisplayTitle(item), "DomainName": domain.Name, "Token": session.token, "StudentURL": "http://" + address + "/a/" + session.shortCode})
	}
}

func (s *AssessmentServer) stateAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		paused, closed := session.paused, session.closed
		studentID := s.studentIDFromRequest(r, session)
		completed := session.completed[studentID]
		s.mu.Unlock()
		if closed {
			system.WriteJSON(w, map[string]any{"closed": true})
			return
		}
		if paused {
			system.WriteJSON(w, map[string]any{"paused": true})
			return
		}
		if studentID == "" {
			system.WriteJSON(w, map[string]any{"authenticated": false})
			return
		}
		if completed {
			system.WriteJSON(w, map[string]any{"authenticated": true, "completed": true})
			return
		}
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		student, score, ok := assessmentStudentScore(item, studentID)
		if !ok {
			http.Error(w, "학생 정보를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		domain, ok := assessmentPublicDomain(item, score, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		if session.mode == "answer" {
			system.WriteJSON(w, map[string]any{"authenticated": true, "answerOnly": true, "title": assessmentDisplayTitle(item), "student": map[string]string{"number": student.Number, "name": student.Name}, "objections": assessmentAnsweredObjections(item, studentID, session.domainID)})
			return
		}
		system.WriteJSON(w, map[string]any{"authenticated": true, "title": assessmentDisplayTitle(item), "student": map[string]string{"number": student.Number, "name": student.Name}, "domain": domain, "hasOpenObjection": assessmentHasOpenObjection(item, studentID, session.domainID)})
	}
}

// boardStateAPI는 전자칠판에 학생 성적 없이 접속 현황만 제공합니다.
func (s *AssessmentServer) boardStateAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		closed, paused := session.closed, session.paused
		verified, completed := len(session.verified), len(session.completed)
		s.mu.Unlock()
		system.WriteJSON(w, map[string]any{"closed": closed, "paused": paused, "verifiedCount": verified, "completedCount": completed})
	}
}

func (s *AssessmentServer) qrAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		closed := session.closed
		address := system.LocalAddress(session.listener.Addr().(*net.TCPAddr).Port)
		shortCode := session.shortCode
		s.mu.Unlock()
		if closed {
			http.Error(w, "확인 회차가 종료되었습니다", http.StatusGone)
			return
		}
		png, err := qrcode.Encode("http://"+address+"/a/"+shortCode, qrcode.Medium, 420)
		if err != nil {
			http.Error(w, "QR 코드를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}
}

func (s *AssessmentServer) loginAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			Number string `json:"number"`
			Name   string `json:"name"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&request) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		clientIP := assessmentClientIP(r)
		s.mu.Lock()
		blockedUntil := session.loginAttempts[clientIP].blockedUntil
		s.mu.Unlock()
		if time.Now().Before(blockedUntil) {
			http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
			return
		}
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		studentID := ""
		wantNumber, wantName := normalizeAssessmentNumber(request.Number), normalizeAssessmentName(request.Name)
		for _, student := range item.Students {
			if wantNumber != "" && normalizeAssessmentNumber(student.Number) == wantNumber && normalizeAssessmentName(student.Name) == wantName {
				studentID = student.ID
				break
			}
		}
		if studentID == "" {
			s.mu.Lock()
			blocked := recordAssessmentLoginFailureLocked(session, clientIP, time.Now())
			s.mu.Unlock()
			if blocked {
				http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
				return
			}
			http.Error(w, "번호 또는 이름을 확인해 주세요", http.StatusUnauthorized)
			return
		}
		if session.mode == "answer" && len(assessmentAnsweredObjections(item, studentID, session.domainID)) == 0 {
			http.Error(w, "확인할 답변이 없습니다", http.StatusForbidden)
			return
		}
		s.mu.Lock()
		if session.closed || session.paused {
			s.mu.Unlock()
			http.Error(w, "현재 확인 회차에 참여할 수 없습니다", http.StatusLocked)
			return
		}
		for _, other := range s.sessions {
			if other.assessmentID != session.assessmentID || other.closed {
				continue
			}
			if _, active := other.activeByUser[studentID]; active {
				s.mu.Unlock()
				http.Error(w, "이미 다른 기기에서 이 번호·이름으로 확인 중입니다. 본인이 아니라면 선생님께 접속 초기화를 요청하세요", http.StatusConflict)
				return
			}
		}
		if session.completed[studentID] {
			s.mu.Unlock()
			http.Error(w, "이 번호·이름은 이미 확인을 마쳤습니다. 본인이 확인하지 않았다면 선생님께 접속 초기화를 요청하세요", http.StatusConflict)
			return
		}
		token, err := assessmentToken()
		if err != nil {
			s.mu.Unlock()
			http.Error(w, "접속 정보를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		session.activeByUser[studentID] = token
		session.verified[studentID] = true
		delete(session.loginAttempts, clientIP)
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: "학생인증", AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

func (s *AssessmentServer) completeAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		studentID := s.studentIDFromRequest(r, session)
		if studentID == "" {
			s.mu.Unlock()
			http.Error(w, "확인 인증이 필요합니다", http.StatusUnauthorized)
			return
		}
		delete(session.activeByUser, studentID)
		session.completed[studentID] = true
		s.mu.Unlock()
		historyType, detail, eventType := "확인완료", "학생이 영역별 점수를 확인했습니다", "확인완료"
		if session.mode == "answer" {
			historyType, detail, eventType = "답변확인완료", "학생이 이의 답변을 확인했습니다", "답변확인완료"
		}
		if err := s.store.AddAssessmentHistory(session.assessmentID, historyType, studentID, session.domainID, detail); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: eventType, AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true, "completed": true})
	}
}

func (s *AssessmentServer) objectionAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		if session.mode != "score" {
			http.Error(w, "답변 재확인 회차에서는 이의를 제출할 수 없습니다", http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			Content string `json:"content"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&request) != nil {
			http.Error(w, "이의 내용을 확인해 주세요", http.StatusBadRequest)
			return
		}
		request.Content = strings.TrimSpace(request.Content)
		if request.Content == "" {
			http.Error(w, "이의 내용을 입력해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		studentID := s.studentIDFromRequest(r, session)
		if studentID == "" {
			s.mu.Unlock()
			http.Error(w, "확인 인증이 필요합니다", http.StatusUnauthorized)
			return
		}
		s.mu.Unlock()
		if err := s.store.SubmitAssessmentObjection(session.assessmentID, session.domainID, studentID, request.Content); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		s.mu.Lock()
		delete(session.activeByUser, studentID)
		session.completed[studentID] = true
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: "이의제출", AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true, "completed": true})
	}
}

func assessmentStudentScore(item Assessment, studentID string) (AssessmentStudent, AssessmentScore, bool) {
	var student AssessmentStudent
	for _, value := range item.Students {
		if value.ID == studentID {
			student = value
			break
		}
	}
	if student.ID == "" {
		return AssessmentStudent{}, AssessmentScore{}, false
	}
	for _, score := range item.Scores {
		if score.StudentID == studentID {
			return student, score, true
		}
	}
	return student, AssessmentScore{StudentID: studentID}, true
}

func assessmentPublicDomains(item Assessment, score AssessmentScore) []map[string]any {
	values := map[string]AssessmentDomainScore{}
	for _, domain := range score.Domains {
		values[domain.DomainID] = domain
	}
	result := make([]map[string]any, 0, len(item.Domains))
	for _, domain := range item.Domains {
		criteriaScores := map[string]AssessmentCriterionScore{}
		for _, score := range values[domain.ID].Criteria {
			criteriaScores[score.CriterionID] = score
		}
		criteria := make([]map[string]any, 0, len(domain.Criteria))
		for _, criterion := range domain.Criteria {
			if isLegacyAssessmentImportedCriterion(domain, criterion) {
				continue
			}
			value := criteriaScores[criterion.ID]
			criteria = append(criteria, map[string]any{"name": criterion.Name, "maxScore": criterion.MaxScore, "score": value.Score, "reason": value.Reason, "note": criterion.Note})
		}
		result = append(result, map[string]any{"name": domain.Name, "maxScore": domain.MaxScore, "importedScore": assessmentImportedScore(domain, values[domain.ID]), "criteria": criteria})
	}
	return result
}

func assessmentPublicDomain(item Assessment, score AssessmentScore, domainID string) (map[string]any, bool) {
	domain, ok := assessmentDomain(item, domainID)
	if !ok {
		return nil, false
	}
	criteriaScores := map[string]AssessmentCriterionScore{}
	var importedScore *float64
	for _, domainScore := range score.Domains {
		if domainScore.DomainID != domainID {
			continue
		}
		importedScore = assessmentImportedScore(domain, domainScore)
		for _, criterion := range domainScore.Criteria {
			criteriaScores[criterion.CriterionID] = criterion
		}
	}
	criteria := make([]map[string]any, 0, len(domain.Criteria))
	for _, criterion := range domain.Criteria {
		if isLegacyAssessmentImportedCriterion(domain, criterion) {
			continue
		}
		value := criteriaScores[criterion.ID]
		criteria = append(criteria, map[string]any{"name": criterion.Name, "maxScore": criterion.MaxScore, "score": value.Score, "reason": value.Reason, "note": criterion.Note})
	}
	return map[string]any{"name": domain.Name, "maxScore": domain.MaxScore, "importedScore": importedScore, "criteria": criteria}, true
}

func assessmentHasOpenObjection(item Assessment, studentID, domainID string) bool {
	for _, objection := range item.Objections {
		if objection.StudentID == studentID && objection.Status != "답변 완료" && (objection.DomainID == "" || objection.DomainID == domainID) {
			return true
		}
	}
	return false
}

// assessmentAnsweredObjections는 답변 재확인 QR에서 해당 학생만 볼 수 있는 최소 이력입니다.
func assessmentAnsweredObjections(item Assessment, studentID, domainID string) []map[string]string {
	values := []map[string]string{}
	for _, objection := range item.Objections {
		if objection.StudentID != studentID || objection.Status != "답변 완료" || strings.TrimSpace(objection.Answer) == "" {
			continue
		}
		// 영역 정보가 없던 이전 이의는 같은 학생의 답변 재확인에만 호환 표시합니다.
		if objection.DomainID != "" && objection.DomainID != domainID {
			continue
		}
		values = append(values, map[string]string{"content": objection.Content, "answer": objection.Answer, "answeredAt": objection.AnsweredAt})
	}
	return values
}

var assessmentStudentTemplate = template.Must(template.New("assessment-student").Parse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{.Title}} · {{.DomainName}} 확인</title><style>:root{color:#382319;font-family:system-ui,sans-serif}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% 0,#ffe7b5 0,transparent 36%),#f8f1e8}.card{max-width:640px;margin:5vh auto;padding:clamp(24px,6vw,42px);border:1px solid #edbd83;border-radius:30px;background:#fffdf9;box-shadow:0 24px 58px #784b2322}h1{font-size:clamp(28px,7vw,44px);line-height:1.18;margin:8px 0 22px}.eyebrow{margin:0;color:#b36520;font-size:14px;font-weight:850;letter-spacing:.02em}.notice{margin:0 0 26px;padding:15px 17px;border-radius:16px;background:#fff0d6;line-height:1.65}.student-heading{margin:0 0 15px;font-size:clamp(21px,5vw,29px)}.domain{padding:18px;border:1px solid #f2d4a6;border-radius:20px;background:linear-gradient(145deg,#fff8eb,#fff1d6)}.criterion{margin:10px 0 0;padding:15px;border-radius:14px;background:#fffdf9;border:1px solid #f1ddc1}.total{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:14px 16px;border-radius:14px;background:#fffdf9;border:2px solid #e8b06c}.total span{flex:1;font-weight:800}.total strong{font-size:26px;color:#b5520f}.total small{color:#765d4c}.answer{margin:9px 0 0;padding:12px;border-left:4px solid #ce6916;border-radius:8px;background:#fff5e8;line-height:1.6}.answer strong{display:block;margin-bottom:3px}.answer p{margin:6px 0}.muted{color:#765d4c}.error{margin:8px 0;color:#a33a16;font-weight:750}input,textarea,button{box-sizing:border-box;width:100%;font:inherit;border-radius:14px;padding:15px;margin:8px 0}input,textarea{border:1px solid #c79c75;background:#fff}button{border:0;background:linear-gradient(135deg,#dd7b22,#bd5312);box-shadow:0 4px 0 #9c4210;color:white;font-weight:850}@media(max-width:480px){.card{margin:0;min-height:100vh;border-radius:0;border:0;padding:28px 20px}}</style><main class="card" id="app"><p class="eyebrow">{{.DomainName}} · {{if .AnswerOnly}}이의 답변 재확인{{else}}개인 점수 확인{{end}}</p><h1>{{.Title}}</h1><p class="notice">{{if .AnswerOnly}}본인 수업 반·번호와 이름을 입력하면 교사의 이의 답변만 확인할 수 있습니다. 확인 뒤에는 이 화면이 자동으로 닫힙니다.{{else}}본인 수업 반·번호와 이름을 입력하면 이 평가 영역의 본인 점수와 채점 사유만 확인할 수 있습니다. 확인 또는 이의 제출 뒤에는 이 화면이 자동으로 닫힙니다.{{end}}</p><div id="content">불러오는 중입니다.</div></main><script>const token={{.Token}},api='/assessment-api/'+token,initialAuthenticated={{.Authenticated}},answerOnly={{.AnswerOnly}};async function call(path,body){const r=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});if(!r.ok)throw new Error(await r.text()||'요청을 처리하지 못했습니다.');return r.json()}async function state(){const r=await fetch(api+'/state',{cache:'no-store'});if(!r.ok)throw new Error('확인 정보를 불러오지 못했습니다. 교사에게 QR 회차 상태를 확인해 달라고 알려 주세요.');return r.json()}function esc(v){return String(v??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}function failure(message){const box=document.querySelector('#content');box.innerHTML='<h2>연결을 확인해 주세요</h2><p>'+esc(message)+'</p><button id="retry">다시 시도</button>';document.querySelector('#retry').onclick=render}function showLogin(){const box=document.querySelector('#content');box.innerHTML='<label>수업 반·번호<input id="number" inputmode="numeric" placeholder="예: 7 (번호만 입력)"></label><label>이름<input id="name" autocomplete="name"></label><button id="login">'+(answerOnly?'내 답변 확인':'내 점수 확인')+'</button>';document.querySelector('#login').onclick=async()=>{try{await call('/login',{number:document.querySelector('#number').value,name:document.querySelector('#name').value});render()}catch(e){failure(e.message)}}}function showObjection(){const box=document.querySelector('#content');box.innerHTML='<h2>이의 내용</h2><textarea id="objection-content" rows="6" placeholder="확인이 필요한 내용을 구체적으로 입력해 주세요."></textarea><p id="objection-error" class="error" role="alert"></p><button id="submit">이의 제출</button>';document.querySelector('#submit').onclick=async()=>{const input=document.querySelector('#objection-content'),error=document.querySelector('#objection-error'),content=input.value.trim();if(!content){error.textContent='이의 내용을 입력해 주세요.';input.focus();return}try{await call('/objection',{content});render()}catch(e){error.textContent=e.message||'이의 내용을 제출하지 못했습니다. 잠시 후 다시 시도해 주세요.'}}}async function render(){const box=document.querySelector('#content');try{const data=await state();if(data.closed||data.completed){box.innerHTML='<h2>확인이 완료되었습니다</h2><p>창을 닫아 주세요.</p>';return}if(data.paused){box.innerHTML='<h2>잠시 기다려 주세요</h2><p>교사가 확인 회차를 일시정지했습니다.</p>';return}if(!data.authenticated){showLogin();return}if(data.answerOnly){const rows=data.objections.map(o=>'<article class="criterion"><strong>내 이의 내용</strong><p>'+esc(o.content)+'</p><div class="answer"><strong>교사 답변</strong>'+esc(o.answer)+'</div></article>').join('');box.innerHTML='<h2 class="student-heading">'+esc(data.student.number)+'번 '+esc(data.student.name)+' 학생의 답변</h2><section class="domain">'+rows+'</section><button id="complete">답변 확인했어요</button>';document.querySelector('#complete').onclick=async()=>{try{await call('/complete');render()}catch(e){failure(e.message)}};return}const d=data.domain,crit=d.criteria||[],rows=crit.map(c=>'<article class="criterion"><strong>'+esc(c.name)+'</strong><p>'+(c.score==null?'미입력':c.score+'점')+' / '+c.maxScore+'점</p><div class="answer"><strong>채점 사유</strong>'+esc(c.reason||'채점 사유가 아직 입력되지 않았습니다.')+'</div></article>').join('');const scored=crit.filter(c=>c.score!=null),sum=scored.reduce((a,c)=>a+Number(c.score),0),sumMax=crit.reduce((a,c)=>a+Number(c.maxScore),0);let summary='';if(d.importedScore!=null)summary+='<div class="total"><span>나이스 영역 점수</span><strong>'+d.importedScore+'점</strong><small>/ '+d.maxScore+'점</small></div>';if(crit.length)summary+='<div class="total"><span>세부 기준 합계'+(scored.length<crit.length?' (일부 미입력)':'')+'</span><strong>'+sum+'점</strong><small>/ '+sumMax+'점</small></div>';const heading='<h2 class="student-heading">'+esc(data.student.number)+'번 '+esc(data.student.name)+' 학생</h2>';if(!summary&&!crit.length){box.innerHTML=heading+'<section class="domain"><p class="muted">아직 공개된 점수가 없습니다. 선생님께 말씀해 주세요.</p></section><p class="muted">점수가 입력되면 다시 QR로 확인할 수 있습니다. 이 창을 닫아도 됩니다.</p>';return}box.innerHTML=heading+'<section class="domain">'+summary+rows+'</section><button id="complete">확인했어요</button>'+(data.hasOpenObjection?'<p class="muted">이 영역에 낸 이의를 선생님이 확인하고 있습니다.</p>':'<button id="objection">이의가 있어요</button>');document.querySelector('#complete').onclick=async()=>{try{await call('/complete');render()}catch(e){failure(e.message)}};const ob=document.querySelector('#objection');if(ob)ob.onclick=showObjection}catch(e){failure(e.message||'학생 점수 확인 서버에 연결하지 못했습니다.')}}initialAuthenticated?render():showLogin()</script></html>`))

var assessmentBoardTemplate = template.Must(template.New("assessment-board").Parse(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{.Title}} · {{.DomainName}} QR</title><style>body{margin:0;background:radial-gradient(circle at top,#286c56,#0d3028);color:#fff;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;text-align:center}.card{width:min(920px,82vw);padding:4vh 5vw;border:3px solid #e8bf64;border-radius:30px;background:#103c32cc;box-shadow:0 28px 70px #03150f88}.eyebrow{color:#ffda85;font-size:clamp(18px,2vw,28px);font-weight:850}h1{font-size:clamp(34px,5vw,68px);margin:10px 0}.qr{width:min(320px,52vw);border:14px solid #fff;border-radius:20px;background:#fff}.url{overflow-wrap:anywhere;color:#c9e4ff;font-size:clamp(15px,1.7vw,24px)}.status{display:flex;justify-content:center;gap:22px;color:#ffebc5;font-size:clamp(18px,2vw,28px)}</style><main class="card"><p class="eyebrow">{{.DomainName}} · 학생 점수 확인</p><h1>{{.Title}}</h1><img class="qr" src="/assessment-api/{{.Token}}/qr" alt="학생 점수 확인 QR 코드"><p class="url">{{.StudentURL}}</p><div class="status" id="status">접속 현황을 불러오는 중입니다.</div></main><script>const api='/assessment-api/{{.Token}}';async function state(){const data=await (await fetch(api+'/board-state')).json();document.querySelector('#status').textContent=data.closed?'확인 회차가 종료되었습니다':data.paused?'교사가 회차를 일시정지했습니다':'인증 '+data.verifiedCount+'명 · 확인 완료 '+data.completedCount+'명'}state();setInterval(state,1500)</script></html>`))
