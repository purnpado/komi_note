package groupsession

import (
	"encoding/base64"
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
// 학생 확인은 우리 반·수업 반 모두 번호+이름으로 하며 생년월일은 쓰지 않습니다(사용자 결정 2026-11-08).
type Participant struct {
	Key    string
	Number string
	Name   string
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
	// Mode: preference(지망 배정) · draft(모둠장 투표 + 블라인드 지명) · leaderPreference(모둠장 투표 + 지망)
	Mode        string `json:"mode"`
	VoteSeconds int    `json:"voteSeconds"`
	TurnSeconds int    `json:"turnSeconds"`
	// LeaderPublic이면 확정한 모둠장 실명을 바로 공개합니다(기본은 비공개: 배정 완료 뒤 이름 공개 때 함께).
	LeaderPublic bool `json:"leaderPublic"`
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
	// 모둠장이 있는 방식. VoteCounts·Suggested·Pots는 교사 화면 전용(전자칠판·학생에게 보내지 않음).
	Mode          string      `json:"mode"`
	VoteSeconds   int         `json:"voteSeconds"`
	TurnSeconds   int         `json:"turnSeconds"`
	Voted         int         `json:"voted"`
	VoteCounts    []VoteCount `json:"voteCounts"`
	Suggested     []string    `json:"suggested"`
	Leaders       []string    `json:"leaders"`
	Pots          [][]string  `json:"pots"`
	DraftRound    int         `json:"draftRound"`
	TurnGroup     int         `json:"turnGroup"`
	CardsLeft     int         `json:"cardsLeft"`
	TurnRemaining int         `json:"turnRemaining"`
	Picks         []Pick      `json:"picks"`
	LeaderPublic  bool        `json:"leaderPublic"`
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
	// 모둠장이 있는 방식
	votes         map[string][]string
	suggested     []string
	leaders       []string
	pots          [][]string
	remainingPots [][]string
	draftBase     []int
	draftRound    int
	draftTurn     int
	turnDeadline  time.Time
	draftMembers  [][]string
	picks         []Pick
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
	if req.Mode != ModeDraft && req.Mode != ModeLeaderPreference {
		req.Mode = ModePreference
	}
	if req.VoteSeconds < 30 || req.VoteSeconds > 900 {
		req.VoteSeconds = 120
	}
	if req.TurnSeconds < 10 || req.TurnSeconds > 120 {
		req.TurnSeconds = 30
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
		separate:   cfg.Separate, together: cfg.Together, phase: PhaseEntry, loginAttempts: map[string]loginAttempt{}, votes: map[string][]string{},
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
	mux.HandleFunc("/api/"+x.token+"/vote", s.voteAPI(x))
	mux.HandleFunc("/api/"+x.token+"/pick", s.pickAPI(x))
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
	if x.paused {
		return
	}
	now := s.now()
	if x.phase == PhaseSubmit && !x.deadline.IsZero() && !now.Before(x.deadline) {
		s.allocateLocked(x)
	}
	if x.phase == PhaseVote && !x.deadline.IsZero() && !now.Before(x.deadline) {
		s.closeVoteLocked(x)
	}
	// 지명 차례 시간이 지나면 무작위 카드를 대신 뒤집는다(밀린 차례가 여럿이면 차례대로).
	for guard := 0; x.phase == PhaseDraft && !x.turnDeadline.IsZero() && !now.Before(x.turnDeadline) && guard < 100; guard++ {
		deadline := x.turnDeadline
		if _, err := s.pickLocked(x, 0, true); err != nil {
			break
		}
		if x.phase == PhaseDraft {
			x.turnDeadline = deadline.Add(time.Duration(x.request.TurnSeconds) * time.Second)
		}
	}
}

func (s *Server) allocateLocked(x *session) {
	keys := make([]string, 0, len(x.participants))
	prefs := map[string][]int{}
	fixed := map[string]int{}
	for group, leader := range x.leaders {
		fixed[leader] = group
	}
	for _, p := range x.participants {
		keys = append(keys, p.Key)
		if _, isLeader := fixed[p.Key]; !isLeader && len(p.prefs) > 0 {
			prefs[p.Key] = p.prefs
		}
	}
	x.assigned, x.rounds = Allocate(AllocateInput{Students: keys, Capacities: x.capacities, PrefIndex: prefs, Separate: x.separate, Together: x.together, Rounds: x.request.PreferenceLimit, Fixed: fixed})
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
		Mode: x.request.Mode, VoteSeconds: x.request.VoteSeconds, TurnSeconds: x.request.TurnSeconds,
		Voted: len(x.votes), VoteCounts: x.voteCountsLocked(), Suggested: append([]string{}, x.suggested...),
		Leaders: append([]string{}, x.leaders...), Pots: [][]string{}, DraftRound: x.draftRound, TurnGroup: x.currentTurnGroupLocked(),
		Picks: append([]Pick{}, x.picks...), LeaderPublic: x.request.LeaderPublic,
	}
	for _, pot := range x.pots {
		info.Pots = append(info.Pots, append([]string{}, pot...))
	}
	if x.phase == PhaseDraft && x.draftRound < len(x.remainingPots) {
		info.CardsLeft = len(x.remainingPots[x.draftRound])
		reference := s.now()
		if x.paused {
			reference = x.pausedAt
		}
		if remaining := int(x.turnDeadline.Sub(reference).Seconds() + 0.999); remaining > 0 {
			info.TurnRemaining = remaining
		}
	}
	if (x.phase == PhaseSubmit || x.phase == PhaseVote) && !x.deadline.IsZero() {
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
	if x.draftMembers != nil {
		// 블라인드 지명: 지금까지 뽑힌 순서대로(모둠장이 맨 앞)
		for index, name := range x.request.GroupNames {
			group := ResultGroup{Name: name, Members: []ResultMember{}}
			for _, key := range x.draftMembers[index] {
				if p := x.byKey[key]; p != nil {
					group.Members = append(group.Members, ResultMember{Key: p.Key, Number: p.Number, Name: p.Name, Nickname: p.nickname})
				}
			}
			info.Result = append(info.Result, group)
		}
	} else if x.rounds != nil {
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
