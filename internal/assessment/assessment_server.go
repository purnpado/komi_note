package assessment

import (
	"encoding/base64"
	"errors"
	"fmt"
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
