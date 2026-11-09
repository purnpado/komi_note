package seating

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"TeacherNote/internal/system"
)

type SeatingSessionInfo struct {
	PlanID                    string   `json:"planId"`
	Running                   bool     `json:"running"`
	StudentURL                string   `json:"studentUrl"`
	BoardURL                  string   `json:"boardUrl"`
	QRCodeDataURL             string   `json:"qrCodeDataUrl"`
	ParticipantCnt            int      `json:"participantCnt"`
	LadderSelectedCnt         int      `json:"ladderSelectedCnt"`
	Phase                     string   `json:"phase"`
	CurrentNickname           string   `json:"currentNickname"`
	Notice                    string   `json:"notice"`
	DrawMethod                string   `json:"drawMethod"`
	PreferenceLimit           int      `json:"preferenceLimit"`
	SubmittedCnt              int      `json:"submittedCnt"`
	ContestCnt                int      `json:"contestCnt"`
	CompetitionMethod         string   `json:"competitionMethod"`
	CurrentPreferencePriority int      `json:"currentPreferencePriority"`
	CurrentContestSeat        string   `json:"currentContestSeat"`
	CurrentContestCandidates  []string `json:"currentContestCandidates"`
	Paused                    bool     `json:"paused"`
	ErrorMessage              string   `json:"errorMessage"`
	// RosterCnt는 입장해야 하는 재적 인원, PartialClosed는 결석·미참여 예외 마감 여부다.
	RosterCnt     int  `json:"rosterCnt"`
	PartialClosed bool `json:"partialClosed"`
	// NamesRevealed는 교사가 전자칠판에 실명 배치도를 공개했는지 나타낸다.
	NamesRevealed bool `json:"namesRevealed"`
}

type seatingSession struct {
	planID     string
	token      string
	boardToken string
	shortCode  string
	listener   net.Listener
	server     *http.Server
	joined     map[string]string
	// deviceTokens는 학생 ID → 이 회차에서 먼저 들어온 기기의 무작위 토큰, deviceStudents는 그 반대 방향이다.
	// 학생 쿠키에는 학생 ID 대신 이 토큰만 넣어, 다른 기기가 같은 학생으로 들어오지 못하게 한다.
	deviceTokens      map[string]string
	deviceStudents    map[string]string
	joinedOrder       []string
	rosterCount       int
	phase             string
	order             []string
	current           int
	available         map[string]bool
	seatLabels        map[string]string
	seatLayout        map[string]SeatingSeat
	placementMode     string
	layoutMode        string
	deskPosition      string
	drawMethod        string
	competitionMethod string
	assigned          map[string]string
	confirmed         []seatingConfirmation
	preferences       map[string][]string
	preferenceLimit   int
	// preferenceCycle은 새 지망 접수(최초·4라운드 이후)를 구분한다.
	// 학생 기기는 이 값이 바뀔 때만 미제출 입력값을 비운다.
	preferenceCycle     int
	contests            []SeatingContest
	contestIndex        int
	preferencePriority  int
	rpsChoices          map[string]string
	rpsEndsAt           time.Time
	rpsResult           []string
	rpsRound            []RPSMatch
	rpsHistory          [][]RPSMatch
	ladderStarts        map[string]int
	ladderSeatByStudent map[string]string
	ladderSeatIDs       []string
	ladderRungs         []ladderRung
	ladderOrder         []string
	ladderCurrent       int
	ladderRevealed      bool
	ladderAnimating     bool
	ladderEndsAt        time.Time
	// 아래 필드는 이전 좌석별 사다리 경쟁 회차의 복구 호환용이다.
	// 새 랜덤 사다리는 ladderStarts/ladderSeatByStudent만 사용한다.
	ladderChoices      map[string][]int
	ladderResult       *LadderResult
	ladderSeatID       string
	fixed              map[string]string
	lastShot           string
	lastShotSeatID     string
	pendingShot        *pendingArrowShot
	resultEndsAt       time.Time
	orderShuffleEndsAt time.Time
	turnStartsAt       time.Time
	turnEndsAt         time.Time
	shufflePreview     []string
	closed             bool
	paused             bool
	pausedAt           time.Time
	ended              bool
	errorMessage       string
	recoveryKind       string
	recoveryStudentID  string
	recoverySeatID     string
	loginAttempts      map[string]seatingLoginAttempt
	// partialClose는 재적 인원보다 적게 입장한 채 교사가 예외 마감했음을 뜻한다.
	partialClose bool
	// namesRevealed가 참일 때만 전자칠판 최종 화면에 실명을 보낸다.
	namesRevealed bool
	// history는 희망 경쟁에서 학생 본인에게만 보여 주는 익명 진행 기록이다.
	// 회차 메모리에만 있고 회차를 닫으면 함께 사라진다.
	history map[string][]string
}

// ladderRung은 인접한 두 세로줄을 잇는 고정 연결선이다. 공개 뒤에도 바뀌지 않아
// 학생 기기와 전자칠판이 같은 사다리와 결과를 보여 준다.
type ladderRung struct {
	Level int `json:"level"`
	Left  int `json:"left"`
}

// seatingConfirmation은 희망 경쟁 진행 중 전자칠판에 공개할 익명 확정 이력이다.
// 실명은 이 구조에 넣지 않으며, 최종 결과 화면에서만 보관함의 학생 정보를 조회한다.
type seatingConfirmation struct {
	StudentID string
	SeatID    string
	Priority  int
}

// seatingLoginAttempt는 QR 회차에만 존재한다. IP와 실패 이력은 vault.dat나 로그에 저장하지 않는다.
type seatingLoginAttempt struct {
	failures     int
	blockedUntil time.Time
}

type pendingArrowShot struct {
	studentID, targetID string
	startedAt           time.Time
	endsAt              time.Time
}

type SeatingServer struct {
	store    Store
	mu       sync.Mutex
	sessions map[string]*seatingSession
}

func (s *SeatingServer) HasActiveSession() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, session := range s.sessions {
		if session != nil && !session.closed && !session.ended {
			return true
		}
	}
	return false
}

func (s *SeatingServer) IsPaused() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed && !x.ended && x.paused {
			return true
		}
	}
	return false
}

func (s *SeatingServer) PauseAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.closed && !x.ended && !x.paused {
			x.paused = true
			x.pausedAt = time.Now()
		}
	}
}

func (s *SeatingServer) ResumeAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, x := range s.sessions {
		if x != nil && !x.ended && x.paused {
			d := time.Since(x.pausedAt)
			shiftSeatingTimers(x, d)
			x.paused = false
			x.pausedAt = time.Time{}
		}
	}
}

func shiftSeatingTimers(x *seatingSession, d time.Duration) {
	for _, p := range []*time.Time{&x.rpsEndsAt, &x.ladderEndsAt, &x.resultEndsAt, &x.orderShuffleEndsAt, &x.turnStartsAt, &x.turnEndsAt} {
		if !p.IsZero() {
			*p = p.Add(d)
		}
	}
	if x.pendingShot != nil {
		x.pendingShot.startedAt = x.pendingShot.startedAt.Add(d)
		x.pendingShot.endsAt = x.pendingShot.endsAt.Add(d)
	}
}

func NewSeatingServer(store Store) *SeatingServer {
	return &SeatingServer{store: store, sessions: map[string]*seatingSession{}}
}

func (s *SeatingServer) Start(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if active := s.sessions[planID]; active != nil {
		// 완료된 회차에서 새 배치안을 실행하면 이전 결과를 재사용하지 않고
		// 새 QR 회차를 발급합니다. 진행 중인 회차는 실수로 끊지 않도록 유지합니다.
		terminal := active.phase == "배정 완료" || active.phase == "자리 확인" || active.phase == "결과 확인" || active.phase == "최종 결과 확인" || active.phase == "회차 종료"
		if !terminal && !active.closed {
			return s.infoLocked(active)
		}
		active.closed = true
		_ = active.server.Close()
		_ = active.listener.Close()
		delete(s.sessions, planID)
	}
	plan, err := s.store.GetSeatingPlan(planID)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	listener, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		return SeatingSessionInfo{}, fmt.Errorf("자리배정 참여 서버를 열지 못했습니다: %w", err)
	}
	b, err := system.RandomBytes(18)
	if err != nil {
		_ = listener.Close()
		return SeatingSessionInfo{}, err
	}
	boardBytes, err := system.RandomBytes(18)
	if err != nil {
		_ = listener.Close()
		return SeatingSessionInfo{}, err
	}
	code := fmt.Sprintf("%X", b[:3])
	rosterCount := 0
	if list, listErr := s.store.ListStudents(); listErr == nil {
		rosterCount = len(list)
	}
	activeSeats := orderedPlanSeats(plan)
	if rosterCount > 0 && len(activeSeats) > rosterCount {
		activeSeats = activeSeats[:rosterCount]
	}
	available, seatLabels, seatLayout := seatingLayout(activeSeats)
	session := &seatingSession{planID: planID, token: base64.RawURLEncoding.EncodeToString(b), boardToken: base64.RawURLEncoding.EncodeToString(boardBytes), shortCode: code, listener: listener, joined: map[string]string{}, deviceTokens: map[string]string{}, deviceStudents: map[string]string{}, rosterCount: rosterCount, phase: "입장 대기", drawMethod: plan.DrawMethod, competitionMethod: plan.CompetitionMethod, available: available, seatLabels: seatLabels, seatLayout: seatLayout, placementMode: plan.PlacementMode, layoutMode: plan.LayoutMode, deskPosition: plan.DeskPosition, assigned: map[string]string{}, fixed: map[string]string{}, preferences: map[string][]string{}, rpsChoices: map[string]string{}, ladderStarts: map[string]int{}, ladderSeatByStudent: map[string]string{}, ladderRungs: []ladderRung{}, ladderChoices: map[string][]int{}, loginAttempts: map[string]seatingLoginAttempt{}, history: map[string][]string{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/assets/seating/rps-rock.webp", writeSeatingPublicAsset("image/webp", rpsRockWebP))
	mux.HandleFunc("/assets/seating/rps-paper.webp", writeSeatingPublicAsset("image/webp", rpsPaperWebP))
	mux.HandleFunc("/assets/seating/rps-scissors.webp", writeSeatingPublicAsset("image/webp", rpsScissorsWebP))
	mux.HandleFunc("/assets/seating/kkomi.png", writeSeatingPublicAsset("image/png", kkomiNoteIconPNG()))
	mux.HandleFunc("/s/"+code, s.studentPage(session))
	mux.HandleFunc("/board/"+session.boardToken, s.boardPage(session))
	mux.HandleFunc("/api/"+session.token+"/login", s.loginAPI(session))
	mux.HandleFunc("/api/"+session.token+"/state", s.stateAPI(session, false))
	mux.HandleFunc("/board-api/"+session.boardToken+"/state", s.stateAPI(session, true))
	mux.HandleFunc("/api/"+session.token+"/qr", s.qrAPI(session))
	mux.HandleFunc("/api/"+session.token+"/arrow", s.arrowAPI(session))
	mux.HandleFunc("/api/"+session.token+"/preferences", s.preferenceAPI(session))
	mux.HandleFunc("/api/"+session.token+"/rps", s.rpsAPI(session))
	mux.HandleFunc("/api/"+session.token+"/ladder", s.ladderAPI(session))
	session.server = &http.Server{Handler: system.SecurityHeaders(mux), ReadHeaderTimeout: 5 * time.Second}
	s.sessions[planID] = session
	go func() { _ = session.server.Serve(listener) }()
	return s.infoLocked(session)
}

func seatingLayout(activeSeats []SeatingSeat) (map[string]bool, map[string]string, map[string]SeatingSeat) {
	available := map[string]bool{}
	seatLabels := map[string]string{}
	seatLayout := map[string]SeatingSeat{}
	for index, seat := range activeSeats {
		seatLabels[seat.ID] = fmt.Sprintf("%d번", index+1)
		seatLayout[seat.ID] = seat
		if seat.StudentID == "" {
			available[seat.ID] = true
		}
	}
	return available, seatLabels, seatLayout
}

// CloseEntry는 새 학생 입장을 마감하고 현재 입장 인원을 확정합니다.
// 재적 인원이 모두 입장해야 마감할 수 있고, 결석·미참여가 있으면 allowPartial로
// 교사가 예외 마감을 명시적으로 확인해야 합니다.
func (s *SeatingServer) CloseEntry(planID string, allowPartial bool) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
	}
	if x.phase != "입장 대기" {
		return SeatingSessionInfo{}, errors.New("입장이 이미 마감되었거나 배정이 진행 중입니다")
	}
	if len(x.joined) == 0 {
		return SeatingSessionInfo{}, errors.New("입장한 학생이 없어 입장을 마감할 수 없습니다")
	}
	missing := x.rosterCount - len(x.joined)
	if missing > 0 && !allowPartial {
		return SeatingSessionInfo{}, fmt.Errorf("재적 %d명 중 %d명만 입장했습니다. 모두 입장한 뒤 마감하거나, 결석·미참여 예외 마감을 선택해 주세요", x.rosterCount, len(x.joined))
	}
	x.partialClose = missing > 0
	if x.drawMethod == "희망 경쟁배정" {
		x.phase = "희망 자리 제출 준비"
	} else {
		x.phase = "입장 마감"
	}
	return s.infoLocked(x)
}

// ResetStudentAccess는 학생의 기기 연결을 풀어 다른 기기(본인)로 다시 들어오게 한다. 닉네임과 진행 기록은 유지한다.
func (s *SeatingServer) ResetStudentAccess(planID, studentID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("진행 중인 자리배정 회차가 없습니다")
	}
	if token := x.deviceTokens[studentID]; token != "" {
		delete(x.deviceStudents, token)
		delete(x.deviceTokens, studentID)
	}
	return s.infoLocked(x)
}

// JoinedStudentIDs는 교사 화면의 접속 초기화 목록에 쓸, 입장한 학생 ID 목록이다(닉네임은 보내지 않는다).
func (s *SeatingServer) JoinedStudentIDs(planID string) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil {
		return []string{}
	}
	return append([]string{}, x.joinedOrder...)
}

func (s *SeatingServer) Stop(planID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if x := s.sessions[planID]; x != nil {
		x.closed = true
		_ = x.server.Close()
		_ = x.listener.Close()
		delete(s.sessions, planID)
	}
}
