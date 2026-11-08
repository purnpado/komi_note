package groupsession

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode"

	qrcode "github.com/skip2/go-qrcode"

	"TeacherNote/internal/system"
)

// 회차 단계
const (
	PhaseEntry      = "입장"
	PhaseSubmit     = "지망 제출"
	PhaseReveal     = "배정 공개"
	PhaseAssigned   = "배정 완료"
	PhaseNamesShown = "실명 공개"
)

// Participant는 회차에 참여할 학생(빠진 학생 제외)입니다. app.go가 보관함에서 만들어 넘깁니다.
// BirthDate는 담임 학급 학생 확인용으로 메모리에서만 쓰고 학생·전자칠판에 보내지 않습니다.
type Participant struct {
	Key       string
	Number    string
	Name      string
	BirthDate string
}

// StartRequest는 교사 화면이 보내는 회차 설정입니다.
type StartRequest struct {
	SourceKind      string   `json:"sourceKind"`
	SourceID        string   `json:"sourceId"`
	SourceLabel     string   `json:"sourceLabel"`
	GroupNames      []string `json:"groupNames"`
	PreferenceLimit int      `json:"preferenceLimit"`
	SubmitSeconds   int      `json:"submitSeconds"`
	ExcludedKeys    []string `json:"excludedKeys"`
}

// Config는 app.go가 보관함 자료를 붙여 회차 서버에 넘기는 값입니다.
type Config struct {
	Request      StartRequest
	Participants []Participant
	Separate     []Pair
	Together     []Pair
}

// ParticipantInfo는 교사 화면에만 보내는 참여 현황입니다(지망 내용은 보내지 않음).
type ParticipantInfo struct {
	Key       string `json:"key"`
	Number    string `json:"number"`
	Name      string `json:"name"`
	Nickname  string `json:"nickname"`
	Joined    bool   `json:"joined"`
	Submitted bool   `json:"submitted"`
}

// ResultMember·ResultGroup은 배정 결과입니다(교사 화면용).
type ResultMember struct {
	Key      string `json:"key"`
	Number   string `json:"number"`
	Name     string `json:"name"`
	Nickname string `json:"nickname"`
}

type ResultGroup struct {
	Name    string         `json:"name"`
	Members []ResultMember `json:"members"`
}

// Info는 교사 화면(진행·전자칠판 보기)에 보내는 회차 상태입니다.
type Info struct {
	Running          bool              `json:"running"`
	Phase            string            `json:"phase"`
	SourceKind       string            `json:"sourceKind"`
	SourceID         string            `json:"sourceId"`
	SourceLabel      string            `json:"sourceLabel"`
	StudentURL       string            `json:"studentUrl"`
	QRCodeDataURL    string            `json:"qrCodeDataUrl"`
	GroupNames       []string          `json:"groupNames"`
	Capacities       []int             `json:"capacities"`
	PreferenceLimit  int               `json:"preferenceLimit"`
	SubmitSeconds    int               `json:"submitSeconds"`
	RemainingSeconds int               `json:"remainingSeconds"`
	Paused           bool              `json:"paused"`
	Total            int               `json:"total"`
	Joined           int               `json:"joined"`
	Submitted        int               `json:"submitted"`
	Participants     []ParticipantInfo `json:"participants"`
	Rounds           []Round           `json:"rounds"`
	Revealed         int               `json:"revealed"`
	NamesRevealed    bool              `json:"namesRevealed"`
	Result           []ResultGroup     `json:"result"`
}

type participant struct {
	Participant
	nickname string
	token    string
	prefs    []int
}

type loginAttempt struct {
	failures     int
	blockedUntil time.Time
}

type session struct {
	listener      net.Listener
	server        *http.Server
	code          string
	token         string
	request       StartRequest
	participants  []*participant
	byKey         map[string]*participant
	byToken       map[string]*participant
	capacities    []int
	separate      []Pair
	together      []Pair
	phase         string
	deadline      time.Time
	paused        bool
	pausedAt      time.Time
	rounds        []Round
	assigned      map[string]int
	revealed      int
	loginAttempts map[string]loginAttempt
}

// Server는 한 번에 하나의 모둠 참여 회차를 운영합니다.
type Server struct {
	mu      sync.Mutex
	current *session
	now     func() time.Time
}

func NewServer() *Server { return &Server{now: time.Now} }

func normaliseName(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
}

func digits(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, value)
}

// normaliseNumber는 "01"·"1번"을 "1"로 맞춥니다.
func normaliseNumber(value string) string {
	all := digits(value)
	trimmed := strings.TrimLeft(all, "0")
	if trimmed == "" && all != "" {
		return "0"
	}
	return trimmed
}

func randomToken(length int) (string, error) {
	b, err := system.RandomBytes(length)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

var nicknameLeft = []string{"별빛", "구름", "새싹", "바람", "햇살", "무지개", "달빛", "반짝", "파도", "솔잎", "노을", "이슬"}
var nicknameRight = []string{"토끼", "여우", "고래", "다람쥐", "펭귄", "나비", "부엉이", "고양이", "수달", "판다", "돌고래", "참새"}

func (x *session) newNickname() string {
	used := map[string]bool{}
	for _, p := range x.participants {
		used[p.nickname] = true
	}
	for attempt := 0; attempt < 200; attempt++ {
		name := nicknameLeft[randomIntn(len(nicknameLeft))] + nicknameRight[randomIntn(len(nicknameRight))]
		if !used[name] {
			return name
		}
	}
	for i := 1; ; i++ {
		name := fmt.Sprintf("모둠친구%d", i)
		if !used[name] {
			return name
		}
	}
}

// Start는 새 회차를 엽니다. 진행 중인 회차가 있으면 거부합니다(교사가 먼저 끝내야 함).
func (s *Server) Start(cfg Config) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current != nil {
		return Info{}, errors.New("이미 진행 중인 모둠 참여 회차가 있습니다. 먼저 회차를 끝내 주세요")
	}
	req := cfg.Request
	if req.SourceKind != "homeroom" && req.SourceKind != "course" {
		return Info{}, errors.New("모둠을 만들 반을 골라 주세요")
	}
	names := []string{}
	for index, name := range req.GroupNames {
		name = strings.TrimSpace(name)
		if name == "" {
			name = fmt.Sprintf("%d모둠", index+1)
		}
		if len([]rune(name)) > 30 {
			name = string([]rune(name)[:30])
		}
		names = append(names, name)
	}
	if len(names) < 2 || len(names) > 20 {
		return Info{}, errors.New("모둠은 2~20개로 정해 주세요")
	}
	if len(cfg.Participants) < len(names) {
		return Info{}, errors.New("학생 수가 모둠 수보다 적습니다")
	}
	if req.PreferenceLimit < 1 || req.PreferenceLimit > 3 {
		req.PreferenceLimit = 3
	}
	if req.PreferenceLimit > len(names) {
		req.PreferenceLimit = len(names)
	}
	if req.SubmitSeconds < 30 || req.SubmitSeconds > 900 {
		req.SubmitSeconds = 180
	}
	req.GroupNames = names
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return Info{}, fmt.Errorf("모둠 참여 서버를 열지 못했습니다: %w", err)
	}
	token, err := randomToken(18)
	if err != nil {
		_ = listener.Close()
		return Info{}, err
	}
	codeBytes, err := system.RandomBytes(4)
	if err != nil {
		_ = listener.Close()
		return Info{}, err
	}
	x := &session{
		listener: listener, code: fmt.Sprintf("%X", codeBytes), token: token, request: req,
		byKey: map[string]*participant{}, byToken: map[string]*participant{},
		capacities: Capacities(len(cfg.Participants), len(names)),
		separate:   cfg.Separate, together: cfg.Together, phase: PhaseEntry, loginAttempts: map[string]loginAttempt{},
	}
	for _, p := range cfg.Participants {
		if p.Key == "" || x.byKey[p.Key] != nil {
			continue
		}
		item := &participant{Participant: p}
		x.participants = append(x.participants, item)
		x.byKey[p.Key] = item
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/g/"+x.code, s.studentPage(x))
	mux.HandleFunc("/api/"+x.token+"/login", s.loginAPI(x))
	mux.HandleFunc("/api/"+x.token+"/state", s.stateAPI(x))
	mux.HandleFunc("/api/"+x.token+"/preferences", s.preferenceAPI(x))
	x.server = &http.Server{Handler: system.SecurityHeaders(mux), ReadHeaderTimeout: 5 * time.Second}
	s.current = x
	go func() { _ = x.server.Serve(listener) }()
	return s.infoLocked(x)
}

func (x *session) studentURL() string {
	return "http://" + system.LocalAddress(x.listener.Addr().(*net.TCPAddr).Port) + "/g/" + x.code
}

// tickLocked는 지망 제출 마감 시각이 지났으면 자동으로 마감·배정합니다.
func (s *Server) tickLocked(x *session) {
	if x.phase == PhaseSubmit && !x.paused && !x.deadline.IsZero() && !s.now().Before(x.deadline) {
		s.allocateLocked(x)
	}
}

func (s *Server) allocateLocked(x *session) {
	keys := make([]string, 0, len(x.participants))
	prefs := map[string][]int{}
	for _, p := range x.participants {
		keys = append(keys, p.Key)
		if len(p.prefs) > 0 {
			prefs[p.Key] = p.prefs
		}
	}
	x.assigned, x.rounds = Allocate(AllocateInput{Students: keys, Capacities: x.capacities, PrefIndex: prefs, Separate: x.separate, Together: x.together, Rounds: x.request.PreferenceLimit})
	x.phase = PhaseReveal
	x.revealed = 0
	x.deadline = time.Time{}
}

func (s *Server) active() (*session, error) {
	if s.current == nil {
		return nil, errors.New("진행 중인 모둠 참여 회차가 없습니다")
	}
	return s.current, nil
}

// Info는 교사 화면용 회차 상태를 돌려줍니다. 회차가 없으면 Running=false.
func (s *Server) Info() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return Info{Running: false}, nil
	}
	s.tickLocked(s.current)
	return s.infoLocked(s.current)
}

func (s *Server) infoLocked(x *session) (Info, error) {
	url := x.studentURL()
	png, err := qrcode.Encode(url, qrcode.Medium, 300)
	if err != nil {
		return Info{}, err
	}
	info := Info{
		Running: true, Phase: x.phase, SourceKind: x.request.SourceKind, SourceID: x.request.SourceID, SourceLabel: x.request.SourceLabel,
		StudentURL: url, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png),
		GroupNames: append([]string{}, x.request.GroupNames...), Capacities: append([]int{}, x.capacities...),
		PreferenceLimit: x.request.PreferenceLimit, SubmitSeconds: x.request.SubmitSeconds, Paused: x.paused,
		Total: len(x.participants), Participants: []ParticipantInfo{}, Rounds: []Round{}, Revealed: x.revealed,
		NamesRevealed: x.phase == PhaseNamesShown, Result: []ResultGroup{},
	}
	if x.phase == PhaseSubmit && !x.deadline.IsZero() {
		reference := s.now()
		if x.paused {
			reference = x.pausedAt
		}
		if remaining := int(x.deadline.Sub(reference).Seconds() + 0.999); remaining > 0 {
			info.RemainingSeconds = remaining
		}
	}
	for _, p := range x.participants {
		joined := p.nickname != ""
		if joined {
			info.Joined++
		}
		if len(p.prefs) > 0 {
			info.Submitted++
		}
		info.Participants = append(info.Participants, ParticipantInfo{Key: p.Key, Number: p.Number, Name: p.Name, Nickname: p.nickname, Joined: joined, Submitted: len(p.prefs) > 0})
	}
	if x.rounds != nil {
		info.Rounds = x.rounds
		for index, name := range x.request.GroupNames {
			group := ResultGroup{Name: name, Members: []ResultMember{}}
			for _, p := range x.participants {
				if g, ok := x.assigned[p.Key]; ok && g == index {
					group.Members = append(group.Members, ResultMember{Key: p.Key, Number: p.Number, Name: p.Name, Nickname: p.nickname})
				}
			}
			info.Result = append(info.Result, group)
		}
	}
	return info, nil
}

// OpenPreferences는 입장을 마감하지 않고 지망 제출을 엽니다(늦게 온 학생도 제출 시간 안에 들어올 수 있음).
func (s *Server) OpenPreferences(seconds int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseEntry {
		return Info{}, errors.New("입장 단계에서만 지망 제출을 시작할 수 있습니다")
	}
	if seconds >= 30 && seconds <= 900 {
		x.request.SubmitSeconds = seconds
	}
	x.phase = PhaseSubmit
	x.deadline = s.now().Add(time.Duration(x.request.SubmitSeconds) * time.Second)
	return s.infoLocked(x)
}

// Extend는 지망 제출 시간을 늘립니다(최대 15분 남도록).
func (s *Server) Extend(seconds int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.phase != PhaseSubmit {
		return Info{}, errors.New("지망 제출 중에만 시간을 늘릴 수 있습니다")
	}
	if seconds < 10 || seconds > 600 {
		seconds = 60
	}
	x.deadline = x.deadline.Add(time.Duration(seconds) * time.Second)
	if limit := s.now().Add(15 * time.Minute); x.deadline.After(limit) {
		x.deadline = limit
	}
	return s.infoLocked(x)
}

// ClosePreferences는 지망 제출을 바로 마감하고 배정합니다.
func (s *Server) ClosePreferences() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.phase != PhaseSubmit {
		return Info{}, errors.New("지망 제출 중이 아닙니다")
	}
	s.allocateLocked(x)
	return s.infoLocked(x)
}

// RevealNext는 다음 라운드 결과를 전자칠판에 공개합니다. 모두 공개하면 배정 완료.
func (s *Server) RevealNext() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseReveal {
		return Info{}, errors.New("공개할 배정 결과가 없습니다")
	}
	x.revealed++
	if x.revealed >= len(x.rounds) {
		x.revealed = len(x.rounds)
		x.phase = PhaseAssigned
	}
	return s.infoLocked(x)
}

// RevealNames는 모든 배정이 끝난 뒤 실명을 공개합니다.
func (s *Server) RevealNames() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseAssigned && x.phase != PhaseNamesShown {
		return Info{}, errors.New("모든 학생 배정이 끝난 뒤에 이름을 공개할 수 있습니다")
	}
	x.phase = PhaseNamesShown
	return s.infoLocked(x)
}

// ResetStudent는 학생 기기 연결을 풀어 다른 기기(본인)로 다시 들어오게 합니다. 닉네임·지망은 유지합니다.
func (s *Server) ResetStudent(key string) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	p := x.byKey[key]
	if p == nil {
		return Info{}, errors.New("학생을 찾지 못했습니다")
	}
	if p.token != "" {
		delete(x.byToken, p.token)
		p.token = ""
	}
	return s.infoLocked(x)
}

// Stop은 회차를 닫고 메모리의 지망·닉네임·접속 정보를 모두 지웁니다.
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current == nil {
		return
	}
	_ = s.current.server.Close()
	_ = s.current.listener.Close()
	s.current = nil
}

// 자동 잠금 연동(다른 QR 회차와 같은 규칙)
func (s *Server) HasActiveSession() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current != nil
}

func (s *Server) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.current != nil && s.current.paused
}

func (s *Server) PauseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.current != nil && !s.current.paused {
		s.current.paused = true
		s.current.pausedAt = s.now()
	}
}

func (s *Server) ResumeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if x := s.current; x != nil && x.paused {
		if !x.deadline.IsZero() {
			x.deadline = x.deadline.Add(s.now().Sub(x.pausedAt))
		}
		x.paused = false
		x.pausedAt = time.Time{}
	}
}

// ---- 학생 휴대폰 API ----

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

const cookieName = "kkomi-group"

func (s *Server) studentPage(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		page := strings.NewReplacer("__TOKEN__", x.token).Replace(studentPageHTML)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(page))
	}
}

func (s *Server) participantFor(x *session, r *http.Request) *participant {
	cookie, err := r.Cookie(cookieName)
	if err != nil || cookie.Value == "" {
		return nil
	}
	return x.byToken[cookie.Value]
}

func (s *Server) loginAPI(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var q struct {
			Number    string `json:"number"`
			Name      string `json:"name"`
			BirthDate string `json:"birthDate"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&q) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		ip := clientIP(r)
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.current != x {
			http.Error(w, "끝난 회차입니다", http.StatusGone)
			return
		}
		s.tickLocked(x)
		if x.paused {
			http.Error(w, "선생님이 회차를 잠시 멈췄습니다", http.StatusLocked)
			return
		}
		if x.phase != PhaseEntry && x.phase != PhaseSubmit {
			http.Error(w, "입장이 마감되었습니다", http.StatusForbidden)
			return
		}
		now := s.now()
		if until := x.loginAttempts[ip].blockedUntil; now.Before(until) {
			http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
			return
		}
		var found *participant
		for _, p := range x.participants {
			if normaliseName(p.Name) != normaliseName(q.Name) {
				continue
			}
			if x.request.SourceKind == "homeroom" {
				if digits(p.BirthDate) != "" && digits(p.BirthDate) == digits(q.BirthDate) {
					found = p
					break
				}
			} else if normaliseNumber(p.Number) != "" && normaliseNumber(p.Number) == normaliseNumber(q.Number) {
				found = p
				break
			}
		}
		if found == nil {
			attempt := x.loginAttempts[ip]
			if !attempt.blockedUntil.IsZero() && !now.Before(attempt.blockedUntil) {
				attempt = loginAttempt{}
			}
			attempt.failures++
			if attempt.failures >= 5 {
				attempt = loginAttempt{blockedUntil: now.Add(30 * time.Second)}
				x.loginAttempts[ip] = attempt
				http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
				return
			}
			x.loginAttempts[ip] = attempt
			if x.request.SourceKind == "homeroom" {
				http.Error(w, "이름 또는 생년월일을 확인해 주세요", http.StatusUnauthorized)
			} else {
				http.Error(w, "번호 또는 이름을 확인해 주세요", http.StatusUnauthorized)
			}
			return
		}
		delete(x.loginAttempts, ip)
		if found.token != "" {
			if current := s.participantFor(x, r); current == found {
				writeJSON(w, map[string]any{"ok": true, "nickname": found.nickname})
				return
			}
			http.Error(w, "이미 다른 기기에서 들어와 있습니다. 본인이 아니라면 선생님께 접속 초기화를 부탁하세요", http.StatusConflict)
			return
		}
		token, err := randomToken(18)
		if err != nil {
			http.Error(w, "다시 시도해 주세요", http.StatusInternalServerError)
			return
		}
		if found.nickname == "" {
			found.nickname = x.newNickname()
		}
		found.token = token
		x.byToken[token] = found
		http.SetCookie(w, &http.Cookie{Name: cookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		writeJSON(w, map[string]any{"ok": true, "nickname": found.nickname})
	}
}

func writeJSON(w http.ResponseWriter, value any) { system.WriteJSON(w, value) }

type studentGroup struct {
	Name     string `json:"name"`
	Capacity int    `json:"capacity"`
}

type studentResult struct {
	Group   string   `json:"group"`
	Members []string `json:"members"`
}

func (s *Server) stateAPI(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.current != x {
			writeJSON(w, map[string]any{"phase": "끝", "ended": true})
			return
		}
		s.tickLocked(x)
		p := s.participantFor(x, r)
		state := map[string]any{"phase": x.phase, "kind": x.request.SourceKind, "paused": x.paused, "loginOpen": x.phase == PhaseEntry || x.phase == PhaseSubmit}
		if p == nil {
			writeJSON(w, state)
			return
		}
		groups := make([]studentGroup, len(x.request.GroupNames))
		for i, name := range x.request.GroupNames {
			groups[i] = studentGroup{Name: name, Capacity: x.capacities[i]}
		}
		state["nickname"] = p.nickname
		state["groups"] = groups
		state["preferenceLimit"] = x.request.PreferenceLimit
		state["preferences"] = append([]int{}, p.prefs...)
		if x.phase == PhaseSubmit && !x.deadline.IsZero() {
			reference := s.now()
			if x.paused {
				reference = x.pausedAt
			}
			state["remainingSeconds"] = int(x.deadline.Sub(reference).Seconds() + 0.999)
		}
		// 본인 결과는 모든 라운드 공개(배정 완료) 뒤에만 보여 준다. 실명은 교사가 공개한 뒤에만.
		if x.phase == PhaseAssigned || x.phase == PhaseNamesShown {
			if g, ok := x.assigned[p.Key]; ok {
				result := studentResult{Group: x.request.GroupNames[g], Members: []string{}}
				for _, other := range x.participants {
					if x.assigned[other.Key] == g {
						label := other.nickname
						if x.phase == PhaseNamesShown || label == "" {
							if x.phase == PhaseNamesShown {
								label = strings.TrimSpace(other.Name)
							} else {
								label = "아직 입장하지 않은 친구"
							}
						}
						if other == p {
							label += " (나)"
						}
						result.Members = append(result.Members, label)
					}
				}
				state["result"] = result
			}
		}
		writeJSON(w, state)
	}
}

func (s *Server) preferenceAPI(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var q struct {
			Groups []int `json:"groups"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&q) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.current != x {
			http.Error(w, "끝난 회차입니다", http.StatusGone)
			return
		}
		s.tickLocked(x)
		p := s.participantFor(x, r)
		if p == nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		if x.paused {
			http.Error(w, "선생님이 회차를 잠시 멈췄습니다", http.StatusLocked)
			return
		}
		if x.phase != PhaseSubmit {
			http.Error(w, "지금은 지망을 낼 수 없습니다", http.StatusForbidden)
			return
		}
		if len(q.Groups) < 1 || len(q.Groups) > x.request.PreferenceLimit {
			http.Error(w, fmt.Sprintf("1~%d지망까지 골라 주세요", x.request.PreferenceLimit), http.StatusBadRequest)
			return
		}
		seen := map[int]bool{}
		for _, g := range q.Groups {
			if g < 0 || g >= len(x.request.GroupNames) || seen[g] {
				http.Error(w, "같은 모둠을 두 번 고를 수 없습니다", http.StatusBadRequest)
				return
			}
			seen[g] = true
		}
		p.prefs = append([]int{}, q.Groups...)
		writeJSON(w, map[string]any{"ok": true})
	}
}
