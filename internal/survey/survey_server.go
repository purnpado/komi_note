package survey

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sort"
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
	paused        bool
	// activeByUser는 참여자 → 기기 토큰. 먼저 들어온 기기만 쓰고 교사가 초기화할 수 있다.
	activeByUser  map[string]string
	responded     map[string]bool
	loginAttempts map[string]loginAttempt
}

// SurveyServer는 꼬미노트 실행 중에만 열리는 교실 내부 참여 서버입니다.
type SurveyServer struct {
	store    Store
	mu       sync.Mutex
	sessions map[string]*surveySession
	// OnResponse는 학생 응답이 저장된 뒤 불린다(앱이 변경 알림을 보낼 때 씀).
	OnResponse func(surveyID string)
}

func NewSurveyServer(store Store) *SurveyServer {
	return &SurveyServer{store: store, sessions: map[string]*surveySession{}}
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

func (s *SurveyServer) setPausedAll(paused bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed {
			x.paused = paused
		}
	}
}

// PauseAll은 화면 잠금 때 학생 접속·응답을 잠시 멈춘다.
func (s *SurveyServer) PauseAll() { s.setPausedAll(true) }

// ResumeAll은 잠금 해제 뒤 회차를 다시 연다.
func (s *SurveyServer) ResumeAll() { s.setPausedAll(false) }

func (s *SurveyServer) newShortCodeLocked() (string, error) {
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

func randomToken(size int) (string, error) {
	bytes, err := system.RandomBytes(size)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func (s *SurveyServer) Start(surveyID string) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if active := s.sessions[surveyID]; active != nil {
		return s.infoLocked(active)
	}
	item, err := s.store.GetSurvey(surveyID)
	if err != nil {
		return SurveySessionInfo{}, err
	}
	if item.Audience != "교직원" {
		participants, err := s.store.SurveyParticipants(surveyID)
		if err != nil {
			return SurveySessionInfo{}, err
		}
		if len(participants) == 0 {
			return SurveySessionInfo{}, errors.New("참여할 학생 명렬이 없습니다. 학생 명렬 또는 수업 명렬을 먼저 확인해 주세요")
		}
	}
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return SurveySessionInfo{}, fmt.Errorf("교실 참여 서버를 열지 못했습니다: %w", err)
	}
	token, err := randomToken(18)
	if err != nil {
		_ = listener.Close()
		return SurveySessionInfo{}, err
	}
	shortCode, err := s.newShortCodeLocked()
	if err != nil {
		_ = listener.Close()
		return SurveySessionInfo{}, err
	}
	session := &surveySession{surveyID: surveyID, token: token, shortCode: shortCode, listener: listener, activeByUser: map[string]string{}, responded: map[string]bool{}, loginAttempts: map[string]loginAttempt{}}
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

// Stop은 설문을 마감한다. 결과 공개를 위해 전자칠판 주소는 닫지 않고, 학생 응답만 막는다.
func (s *SurveyServer) Stop(surveyID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return nil
	}
	if session.closed {
		_ = session.listener.Close()
		delete(s.sessions, surveyID)
		return nil
	}
	session.closed = true
	return s.store.SetSurveyStatus(surveyID, "마감")
}

func (s *SurveyServer) SetPublicResults(surveyID string, enabled bool) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil {
		return SurveySessionInfo{}, errors.New("열려 있는 참여 회차가 없습니다")
	}
	if enabled && !session.closed {
		return SurveySessionInfo{}, errors.New("결과는 설문을 마감한 뒤에 공개할 수 있습니다")
	}
	session.publicResults = enabled
	return s.infoLocked(session)
}

// ResetStudentAccess는 한 참여자의 기기 연결을 풀어 본인이 다른 기기로 다시 들어올 수 있게 한다.
// 이미 낸 응답은 지우지 않는다.
func (s *SurveyServer) ResetStudentAccess(surveyID, participantID string) (SurveySessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	session := s.sessions[surveyID]
	if session == nil || session.closed {
		return SurveySessionInfo{}, errors.New("열려 있는 참여 회차가 없습니다")
	}
	delete(session.activeByUser, participantID)
	return s.infoLocked(session)
}

// Discard는 설문을 지울 때 회차를 바로 닫는다.
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
		return SurveySessionInfo{SurveyID: item.ID, Title: item.Title, Running: false, Closed: item.Status == "마감", ResponseCnt: len(item.Responses)}, nil
	}
	return s.infoLocked(session)
}

func (s *SurveyServer) studentURL(session *surveySession) string {
	port := session.listener.Addr().(*net.TCPAddr).Port
	return "http://" + system.LocalAddress(port) + "/s/" + session.shortCode
}

func (s *SurveyServer) infoLocked(session *surveySession) (SurveySessionInfo, error) {
	item, err := s.store.GetSurvey(session.surveyID)
	if err != nil {
		return SurveySessionInfo{}, err
	}
	port := session.listener.Addr().(*net.TCPAddr).Port
	address := system.LocalAddress(port)
	studentURL := s.studentURL(session)
	png, err := qrcode.Encode(studentURL, qrcode.Medium, 240)
	if err != nil {
		return SurveySessionInfo{}, err
	}
	var statuses []ParticipantStatus
	expected := item.ExpectedParticipants
	if item.Audience != "교직원" {
		participants, _ := s.store.SurveyParticipants(session.surveyID)
		if expected == 0 {
			expected = len(participants)
		}
		statuses = participantStatuses(participants, item, session)
	}
	notice := "학생 화면에서 인증 뒤 교사가 시작할 때까지 대기합니다."
	switch {
	case session.closed:
		notice = "설문이 마감되었습니다. 전자칠판에 결과를 공개할 수 있습니다."
	case session.paused:
		notice = "화면이 잠겨 학생 접속을 잠시 멈췄습니다."
	case session.started:
		notice = "현재 설문이 진행 중입니다."
	}
	return SurveySessionInfo{SurveyID: item.ID, Title: item.Title, Running: true, Started: session.started, Closed: session.closed, PublicResults: session.publicResults, StudentURL: studentURL, ShortCode: session.shortCode, BoardURL: "http://" + address + "/board/" + session.token, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), ParticipantCnt: len(session.activeByUser), ExpectedParticipants: expected, ResponseCnt: len(item.Responses), Notice: notice, Participants: statuses}, nil
}

func participantStatuses(participants []Participant, item Survey, session *surveySession) []ParticipantStatus {
	answered := map[string]bool{}
	for _, response := range item.Responses {
		answered[response.StudentID] = true
	}
	result := make([]ParticipantStatus, 0, len(participants))
	for _, participant := range participants {
		_, joined := session.activeByUser[participant.ID]
		result = append(result, ParticipantStatus{ID: participant.ID, Number: participant.Number, Name: participant.Name, Joined: joined, Responded: answered[participant.ID] || session.responded[participant.ID]})
	}
	sort.SliceStable(result, func(i, j int) bool { return lessNumber(result[i].Number, result[j].Number) })
	return result
}

func lessNumber(a, b string) bool {
	na, nb := NormalizeNumber(a), NormalizeNumber(b)
	if len(na) != len(nb) {
		return len(na) < len(nb)
	}
	return na < nb
}
