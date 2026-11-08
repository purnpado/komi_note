package seating

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"

	qrcode "github.com/skip2/go-qrcode"

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
}

type seatingSession struct {
	planID            string
	token             string
	boardToken        string
	shortCode         string
	listener          net.Listener
	server            *http.Server
	joined            map[string]string
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
	if students, listErr := s.store.ListStudents(); listErr == nil {
		rosterCount = len(students)
	}
	activeSeats := orderedPlanSeats(plan)
	if rosterCount > 0 && len(activeSeats) > rosterCount {
		activeSeats = activeSeats[:rosterCount]
	}
	available, seatLabels, seatLayout := seatingLayout(activeSeats)
	session := &seatingSession{planID: planID, token: base64.RawURLEncoding.EncodeToString(b), boardToken: base64.RawURLEncoding.EncodeToString(boardBytes), shortCode: code, listener: listener, joined: map[string]string{}, rosterCount: rosterCount, phase: "입장 대기", drawMethod: plan.DrawMethod, competitionMethod: plan.CompetitionMethod, available: available, seatLabels: seatLabels, seatLayout: seatLayout, placementMode: plan.PlacementMode, layoutMode: plan.LayoutMode, deskPosition: plan.DeskPosition, assigned: map[string]string{}, fixed: map[string]string{}, preferences: map[string][]string{}, rpsChoices: map[string]string{}, ladderStarts: map[string]int{}, ladderSeatByStudent: map[string]string{}, ladderRungs: []ladderRung{}, ladderChoices: map[string][]int{}, loginAttempts: map[string]seatingLoginAttempt{}}
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
func (s *SeatingServer) CloseEntry(planID string) (SeatingSessionInfo, error) {
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
	if x.drawMethod == "희망 경쟁배정" {
		x.phase = "희망 자리 제출 준비"
	} else {
		x.phase = "입장 마감"
	}
	return s.infoLocked(x)
}

// StartRandomArrowAssignment은 입장한 학생의 익명 순서를 섞어 화살 배정을 시작합니다.
// 실제 학생 이름은 브라우저와 전자칠판으로 전송하지 않습니다.
func (s *SeatingServer) StartRandomArrowAssignment(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("먼저 QR 참여 회차를 열어 주세요")
	}
	if x.phase != "입장 마감" {
		return SeatingSessionInfo{}, errors.New("먼저 학생 입장을 마감해 주세요")
	}
	plan, err := s.store.GetSeatingPlan(planID)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	activeSeats := orderedPlanSeats(plan)
	if x.rosterCount > 0 && len(activeSeats) > x.rosterCount {
		activeSeats = activeSeats[:x.rosterCount]
	}
	available, seatLabels, seatLayout := seatingLayout(activeSeats)
	if len(available) < len(x.joined) {
		return SeatingSessionInfo{}, errors.New("빈 좌석 수가 입장 학생 수보다 적습니다")
	}
	ids := make([]string, 0, len(x.joined))
	for id := range x.joined {
		ids = append(ids, id)
	}
	order, err := ShuffleStudentIDs(ids)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	x.order, x.current, x.available, x.seatLabels, x.seatLayout, x.placementMode, x.layoutMode, x.assigned, x.fixed, x.lastShot, x.lastShotSeatID = order, 0, available, seatLabels, seatLayout, plan.PlacementMode, plan.LayoutMode, map[string]string{}, s.fixedSeatsLocked(plan), "", ""
	x.shufflePreview = append([]string(nil), order...)
	x.orderShuffleEndsAt = time.Now().Add(5 * time.Second)
	x.phase = "순서 섞기"
	return s.infoLocked(x)
}

// OpenPreferenceSubmission은 희망 경쟁배정의 학생 지망 입력을 엽니다.
func (s *SeatingServer) OpenPreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "희망 자리 제출 준비" && x.phase != "다음 차 지망 제출 준비" {
		return SeatingSessionInfo{}, errors.New("입장 마감 뒤에 희망 자리 제출을 열 수 있습니다")
	}
	x.preferenceLimit = RemainingPreferenceCount(len(x.available))
	if x.preferenceLimit < 1 {
		return SeatingSessionInfo{}, errors.New("선택할 빈 자리가 없습니다")
	}
	x.preferenceCycle++
	x.phase = "희망 자리 제출"
	return s.infoLocked(x)
}

// ClosePreferenceSubmission은 학생 지망 접수를 마감하고 좌석별 경쟁률을 계산합니다.
func (s *SeatingServer) ClosePreferenceSubmission(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "희망 자리 제출" {
		return SeatingSessionInfo{}, errors.New("먼저 희망 자리 제출을 열어 주세요")
	}
	if err := s.preparePreferenceRoundLocked(x, 1); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

// AdvancePreferenceRound은 교사 확인 뒤 다음 지망 차수를 연다.
func (s *SeatingServer) AdvancePreferenceRound(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != preferenceCompletionPhase(x.preferencePriority) {
		return SeatingSessionInfo{}, errors.New("현재 라운드 결과를 확인한 뒤 진행할 수 있습니다")
	}
	if x.preferencePriority >= x.preferenceLimit {
		if s.allJoinedStudentsAssignedLocked(x) || len(x.available) == 0 {
			x.phase = "배정 완료"
			return s.infoLocked(x)
		}
		x.preferences = map[string][]string{}
		x.preferencePriority = 0
		x.preferenceLimit = RemainingPreferenceCount(len(x.available))
		x.phase = "다음 차 지망 제출 준비"
		return s.infoLocked(x)
	}
	if err := s.preparePreferenceRoundLocked(x, x.preferencePriority+1); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

// preparePreferenceRoundLocked는 한 지망 차수의 단독 확정과 복수 후보 경쟁 대기열을 만든다.
// 이전 차수에서 탈락한 학생만 남은 빈자리의 다음 지망으로 자연스럽게 넘어간다.
func (s *SeatingServer) preparePreferenceRoundLocked(x *seatingSession, priority int) error {
	if priority <= x.preferenceLimit {
		preferences := make([]SeatingPreference, 0, len(x.preferences))
		for studentID, seatIDs := range x.preferences {
			preferences = append(preferences, SeatingPreference{StudentID: studentID, SeatIDs: seatIDs})
		}
		assigned, occupied := map[string]bool{}, map[string]bool{}
		for studentID := range x.assigned {
			assigned[studentID] = true
		}
		for seatID := range x.seatLayout {
			if !x.available[seatID] {
				occupied[seatID] = true
			}
		}
		items := BuildSeatingContests(preferences, assigned, occupied, priority)
		singles, contests := SplitSeatingContests(items)
		for _, single := range singles {
			studentID, seatID := single.StudentIDs[0], single.SeatID
			if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
				return err
			}
			x.assigned[studentID] = seatID
			delete(x.available, seatID)
			s.recordPreferenceConfirmationLocked(x, studentID, seatID, priority)
		}
		x.preferencePriority = priority
		x.contests = contests
		x.contestIndex = 0
		if len(contests) > 0 {
			x.phase = "경쟁률 공개"
		} else if s.allJoinedStudentsAssignedLocked(x) {
			x.phase = "배정 완료"
		} else {
			x.phase = preferenceCompletionPhase(priority)
		}
		return nil
	}
	x.contests = nil
	x.contestIndex = 0
	x.phase = "배정 완료"
	return nil
}

func (s *SeatingServer) allJoinedStudentsAssignedLocked(x *seatingSession) bool {
	if len(x.joined) == 0 {
		return false
	}
	for studentID := range x.joined {
		if x.assigned[studentID] == "" {
			return false
		}
	}
	return true
}

func preferenceCompletionPhase(priority int) string {
	return fmt.Sprintf("%d지망 처리 완료", priority)
}

func (s *SeatingServer) recordPreferenceConfirmationLocked(x *seatingSession, studentID, seatID string, priority int) {
	for _, item := range x.confirmed {
		if item.StudentID == studentID || item.SeatID == seatID {
			return
		}
	}
	x.confirmed = append(x.confirmed, seatingConfirmation{StudentID: studentID, SeatID: seatID, Priority: priority})
}

// StartSeatingRPSCompetition은 기존 Wails 바인딩 호환을 유지하면서
// 현재 배치 설정의 가위바위보 또는 사다리타기 경쟁을 시작한다.
func (s *SeatingServer) StartSeatingRPSCompetition(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "희망 경쟁배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 희망 경쟁 회차가 없습니다")
	}
	if x.phase != "경쟁률 공개" {
		return SeatingSessionInfo{}, errors.New("경쟁률 공개 뒤에 자리별 경쟁을 시작할 수 있습니다")
	}
	if len(x.contests) == 0 {
		return SeatingSessionInfo{}, errors.New("진행할 복수 후보 경쟁이 없습니다")
	}
	x.contestIndex = 0
	if err := s.openRPSTournamentLocked(x); err != nil {
		return SeatingSessionInfo{}, err
	}
	return s.infoLocked(x)
}

// Recover는 저장 오류로 멈춘 회차를 교사가 안전하게 처리하도록 합니다.
// action은 재시도, 건너뛰기, 회차 종료 중 하나만 허용합니다.
func (s *SeatingServer) Recover(planID, action string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
	}
	if x.phase != "오류" {
		return SeatingSessionInfo{}, errors.New("오류 상태인 회차에서만 복구할 수 있습니다")
	}
	switch action {
	case "재시도":
		if x.recoveryStudentID == "" || x.recoverySeatID == "" {
			return SeatingSessionInfo{}, errors.New("다시 저장할 배정 정보가 없습니다. 현재 학생을 건너뛰거나 회차를 종료해 주세요")
		}
		if err := s.persistArrowAssignmentLocked(x, x.recoveryStudentID, x.recoverySeatID); err != nil {
			x.errorMessage = "좌석 저장을 다시 시도했지만 실패했습니다. 보관함 잠금 상태와 저장 공간을 확인해 주세요."
			return s.infoLocked(x)
		}
		s.completeRecoveredAssignmentLocked(x)
	case "건너뛰기":
		s.skipRecoveryLocked(x)
	case "회차 종료":
		x.ended = true
		x.errorMessage = "교사가 오류 복구 대신 이 회차를 종료했습니다. QR 참여와 타이머가 중단되었습니다."
		x.phase = "회차 종료"
	default:
		return SeatingSessionInfo{}, errors.New("지원하지 않는 오류 복구 방식입니다")
	}
	return s.infoLocked(x)
}

func (s *SeatingServer) beginAssignmentRecoveryLocked(x *seatingSession, kind, studentID, seatID string) {
	x.phase = "오류"
	x.errorMessage = "좌석 결과를 암호화 보관함에 저장하지 못했습니다. 재시도하거나 현재 학생을 건너뛸 수 있습니다."
	x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = kind, studentID, seatID
}

func (s *SeatingServer) clearRecoveryLocked(x *seatingSession) {
	x.errorMessage, x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = "", "", "", ""
}

func (s *SeatingServer) completeRecoveredAssignmentLocked(x *seatingSession) {
	studentID, seatID, kind := x.recoveryStudentID, x.recoverySeatID, x.recoveryKind
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	if kind == "가위바위보" || kind == "사다리타기" {
		s.recordPreferenceConfirmationLocked(x, studentID, seatID, x.preferencePriority)
	}
	x.pendingShot = nil
	x.turnEndsAt = time.Time{}
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	if kind == "가위바위보" {
		x.contestIndex++
		x.phase = "가위바위보 결과"
	} else if kind == "사다리타기" {
		x.contestIndex++
		x.phase = "사다리 결과"
	} else if x.current+1 >= len(x.order) {
		x.lastShot, x.lastShotSeatID, x.phase = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID, "최종 결과 확인"
	} else {
		x.lastShot, x.lastShotSeatID, x.phase = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID, "결과 확인"
	}
	s.clearRecoveryLocked(x)
}

func (s *SeatingServer) skipRecoveryLocked(x *seatingSession) {
	kind := x.recoveryKind
	x.pendingShot = nil
	x.turnEndsAt = time.Time{}
	x.resultEndsAt = time.Time{}
	if kind == "가위바위보" {
		x.contestIndex++
		x.phase = "가위바위보 결과"
		x.resultEndsAt = time.Now().Add(5 * time.Second)
	} else if kind == "사다리타기" {
		x.contestIndex++
		x.phase = "사다리 결과"
		x.resultEndsAt = time.Now().Add(5 * time.Second)
	} else if kind == "룰렛" {
		x.current++
		if x.current >= len(x.order) {
			x.phase = "배정 완료"
		} else {
			x.phase = "룰렛 시작 대기"
			x.turnStartsAt = time.Now().Add(5 * time.Second)
		}
	} else {
		x.phase = "회차 종료"
		x.ended = true
	}
	x.errorMessage = "교사가 현재 저장 오류 대상을 건너뛰었습니다."
	x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = "", "", ""
}

func (s *SeatingServer) openRPSTournamentLocked(x *seatingSession) error {
	contest := s.currentContestLocked(x)
	if contest == nil {
		return errors.New("진행할 경쟁 좌석을 찾지 못했습니다")
	}
	round, err := BuildRPSTournamentRound(contest.StudentIDs)
	if err != nil {
		return err
	}
	x.rpsHistory = nil
	x.rpsRound = round
	s.openRPSRoundLocked(x)
	return nil
}

func (s *SeatingServer) openRPSRoundLocked(x *seatingSession) {
	x.rpsChoices = map[string]string{}
	x.rpsResult = nil
	x.rpsEndsAt = time.Now().Add(10 * time.Second)
	x.phase = "가위바위보 선택"
}

func (s *SeatingServer) currentContestLocked(x *seatingSession) *SeatingContest {
	if x.contestIndex < 0 || x.contestIndex >= len(x.contests) {
		return nil
	}
	return &x.contests[x.contestIndex]
}

func (s *SeatingServer) advanceRPSLocked(x *seatingSession) {
	if x.phase != "가위바위보 선택" || time.Now().Before(x.rpsEndsAt) {
		return
	}
	contest := s.currentContestLocked(x)
	if contest == nil {
		return
	}
	drawIDs := map[string]bool{}
	for index := range x.rpsRound {
		match := &x.rpsRound[index]
		if match.WinnerID != "" {
			continue
		}
		match.LeftChoice, match.RightChoice = x.rpsChoices[match.LeftID], x.rpsChoices[match.RightID]
		result := ResolveRPSRound([]string{match.LeftID, match.RightID}, map[string]string{match.LeftID: match.LeftChoice, match.RightID: match.RightChoice})
		// 양쪽 모두 미입력인 경우 재대결을 반복하면 수업이 멈춘다.
		// 해당 대결 안에서만 암호학적 난수로 한 명을 정해 다음 단계로 보낸다.
		if len(result.Missing) == 2 {
			winner, err := NextArrowTarget([]string{match.LeftID, match.RightID}, "", nil)
			if err != nil {
				x.phase = "오류"
				return
			}
			match.WinnerID = winner
			match.LeftChoice, match.RightChoice = "미입력", "미입력"
			continue
		}
		if result.Draw {
			drawIDs[match.LeftID], drawIDs[match.RightID] = true, true
			continue
		}
		if len(result.Winners) == 1 {
			match.WinnerID = result.Winners[0]
		}
	}
	if len(drawIDs) > 0 {
		next := map[string]string{}
		for id := range drawIDs {
			next[id] = ""
		}
		x.rpsChoices = next
		x.rpsEndsAt = time.Now().Add(10 * time.Second)
		return
	}
	finished := append([]RPSMatch(nil), x.rpsRound...)
	x.rpsHistory = append(x.rpsHistory, finished)
	winners := make([]string, 0, len(finished))
	for _, match := range finished {
		if match.WinnerID != "" {
			winners = append(winners, match.WinnerID)
		}
	}
	if len(winners) == 1 {
		winner := winners[0]
		x.rpsResult = []string{winner}
		if err := s.persistArrowAssignmentLocked(x, winner, contest.SeatID); err != nil {
			s.beginAssignmentRecoveryLocked(x, "가위바위보", winner, contest.SeatID)
			return
		}
		x.assigned[winner] = contest.SeatID
		delete(x.available, contest.SeatID)
		s.recordPreferenceConfirmationLocked(x, winner, contest.SeatID, x.preferencePriority)
		x.contestIndex++
	} else if len(winners) > 1 {
		x.rpsResult = winners
	}
	x.phase = "가위바위보 결과"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) advanceRPSResultLocked(x *seatingSession) {
	if x.phase != "가위바위보 결과" || time.Now().Before(x.resultEndsAt) {
		return
	}
	if len(x.rpsResult) > 1 {
		x.rpsRound = BuildRPSNextRound(x.rpsResult)
		s.openRPSRoundLocked(x)
		return
	}
	if x.contestIndex >= len(x.contests) {
		if s.allJoinedStudentsAssignedLocked(x) {
			x.phase = "배정 완료"
		} else {
			x.phase = preferenceCompletionPhase(x.preferencePriority)
		}
		x.resultEndsAt = time.Time{}
		return
	}
	_ = s.openRPSTournamentLocked(x)
}

func (s *SeatingServer) openLadderContestLocked(x *seatingSession) error {
	if s.currentContestLocked(x) == nil {
		return errors.New("진행할 경쟁 좌석을 찾지 못했습니다")
	}
	x.ladderChoices = map[string][]int{}
	x.ladderResult = nil
	x.ladderSeatID = s.currentContestLocked(x).SeatID
	x.ladderEndsAt = time.Now().Add(10 * time.Second)
	x.phase = "사다리 출발점 선택"
	return nil
}

func (s *SeatingServer) advanceLadderLocked(x *seatingSession) {
	if x.phase != "사다리 출발점 선택" || time.Now().Before(x.ladderEndsAt) {
		return
	}
	contest := s.currentContestLocked(x)
	if contest == nil {
		return
	}
	result, err := ResolveLadderContest(contest.StudentIDs, x.ladderChoices)
	if err != nil {
		x.phase, x.errorMessage = "오류", "사다리 경쟁 결과를 만들지 못했습니다."
		return
	}
	x.ladderResult = &result
	if err := s.persistArrowAssignmentLocked(x, result.WinnerID, contest.SeatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "사다리타기", result.WinnerID, contest.SeatID)
		return
	}
	x.assigned[result.WinnerID] = contest.SeatID
	delete(x.available, contest.SeatID)
	s.recordPreferenceConfirmationLocked(x, result.WinnerID, contest.SeatID, x.preferencePriority)
	x.contestIndex++
	x.phase = "사다리 결과"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) advanceLadderResultLocked(x *seatingSession) {
	if x.phase != "사다리 결과" || time.Now().Before(x.resultEndsAt) {
		return
	}
	if x.contestIndex >= len(x.contests) {
		if s.allJoinedStudentsAssignedLocked(x) {
			x.phase = "배정 완료"
		} else {
			x.phase = preferenceCompletionPhase(x.preferencePriority)
		}
		x.resultEndsAt = time.Time{}
		return
	}
	_ = s.openLadderContestLocked(x)
}

func orderedPlanSeats(plan SeatingPlan) []SeatingSeat {
	seats := append([]SeatingSeat(nil), plan.Seats...)
	sort.Slice(seats, func(i, j int) bool {
		left, right := seats[i], seats[j]
		if plan.LayoutMode == "사용자 지정" {
			return left.Y < right.Y || (left.Y == right.Y && left.X < right.X)
		}
		return left.Row < right.Row || (left.Row == right.Row && left.Column < right.Column)
	})
	return seats
}

// StartRoulette은 교사가 확정된 학생 순서의 다음 룰렛을 시작합니다.
func (s *SeatingServer) StartRoulette(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("먼저 QR 참여 회차를 열어 주세요")
	}
	s.finishOrderShuffleLocked(x)
	if x.phase != "룰렛 시작 준비" {
		return SeatingSessionInfo{}, errors.New("먼저 순서 섞기를 완료해 주세요")
	}
	x.phase = "룰렛 시작 대기"
	x.turnStartsAt = time.Now().Add(5 * time.Second)
	x.turnEndsAt = time.Time{}
	return s.infoLocked(x)
}

// RevealRandomLadder는 모든 참가자의 출발점 선택을 마감하고, 교사 전용으로
// 사다리 경로를 공개한다. 고정 정보는 이 시점에도 공개 응답에 포함하지 않는다.
func (s *SeatingServer) RevealRandomLadder(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "랜덤 사다리 배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 랜덤 사다리 회차가 없습니다")
	}
	if x.phase != "사다리 출발점 선택" {
		return SeatingSessionInfo{}, errors.New("모든 학생의 출발점 선택을 마감한 뒤 공개할 수 있습니다")
	}
	if len(x.ladderStarts) != len(x.order) {
		return SeatingSessionInfo{}, errors.New("모든 참여 학생의 출발점 선택이 완료되어야 합니다")
	}
	seatIDs := x.ladderSeatIDs
	if len(seatIDs) == 0 {
		seatIDs = s.ladderSeatIDsLocked(x)
		x.ladderSeatIDs = append([]string(nil), seatIDs...)
	}
	if len(seatIDs) < len(x.order) {
		return SeatingSessionInfo{}, errors.New("배정할 좌석 수가 참여 학생 수보다 적습니다")
	}
	available := append([]string(nil), seatIDs...)
	used := map[string]bool{}
	x.ladderSeatByStudent = map[string]string{}
	for studentID, seatID := range x.fixed {
		if x.joined[studentID] == "" || !containsSeatID(available, seatID) || used[seatID] {
			continue
		}
		x.ladderSeatByStudent[studentID] = seatID
		used[seatID] = true
	}
	remainingSeats := make([]string, 0, len(available))
	for _, seatID := range available {
		if !used[seatID] {
			remainingSeats = append(remainingSeats, seatID)
		}
	}
	shuffled, err := ShuffleStudentIDs(remainingSeats)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	idx := 0
	for _, studentID := range x.order {
		if x.ladderSeatByStudent[studentID] != "" {
			continue
		}
		x.ladderSeatByStudent[studentID] = shuffled[idx]
		idx++
	}
	x.ladderRungs = ladderRungsForAssignments(x, seatIDs)
	x.ladderRevealed = true
	x.ladderCurrent = 0
	x.ladderAnimating = false
	x.phase = "사다리 공개"
	return s.infoLocked(x)
}

// AdvanceRandomLadder는 교사가 한 번 누를 때마다 다음 학생 한 명의 경로와
// 결과를 공개한다. 자동으로 다음 학생으로 넘어가지 않아 교사가 수업 흐름을 제어한다.
func (s *SeatingServer) AdvanceRandomLadder(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed || x.drawMethod != "랜덤 사다리 배정" {
		return SeatingSessionInfo{}, errors.New("진행 중인 랜덤 사다리 회차가 없습니다")
	}
	if x.phase != "사다리 공개" && x.phase != "사다리 결과 확인" {
		return SeatingSessionInfo{}, errors.New("사다리 공개 뒤에 한 명씩 진행할 수 있습니다")
	}
	if x.ladderCurrent >= len(x.order) {
		x.phase = "배정 완료"
		return s.infoLocked(x)
	}
	studentID := x.order[x.ladderCurrent]
	seatID := x.ladderSeatByStudent[studentID]
	if seatID == "" {
		return SeatingSessionInfo{}, errors.New("학생의 사다리 도착 좌석을 찾지 못했습니다")
	}
	if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "사다리", studentID, seatID)
		return s.infoLocked(x)
	}
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	x.lastShot, x.lastShotSeatID = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID
	x.ladderAnimating = true
	// 실제 세로·가로 이동 구간을 따라가는 사다리 연출과 같은 시간으로 유지한다.
	x.ladderEndsAt = time.Now().Add(6 * time.Second)
	x.phase = "사다리 연출"
	return s.infoLocked(x)
}

func containsSeatID(ids []string, wanted string) bool {
	for _, id := range ids {
		if id == wanted {
			return true
		}
	}
	return false
}

// ladderSeatIDsLocked는 고정 학생의 실제 좌석도 빠지지 않게 사다리 도착점 묶음을 만든다.
// 고정 여부는 이 목록의 번호만으로 외부에 드러나지 않으며, 학생은 모두 같은 절차를 거친다.
func (s *SeatingServer) ladderSeatIDsLocked(x *seatingSession) []string {
	need := len(x.order)
	if need == 0 {
		return nil
	}
	all := s.orderedSeatIDsLocked(x)
	selected := make([]string, 0, need)
	used := map[string]bool{}
	for _, studentID := range x.order {
		seatID := x.fixed[studentID]
		if seatID != "" && x.joined[studentID] != "" && x.available[seatID] && !used[seatID] {
			selected = append(selected, seatID)
			used[seatID] = true
		}
	}
	for _, seatID := range all {
		if len(selected) >= need {
			break
		}
		if x.available[seatID] && !used[seatID] {
			selected = append(selected, seatID)
			used[seatID] = true
		}
	}
	return selected
}

// ladderRungsForAssignments는 학생이 고른 출발점과 서버가 고정한 도착 좌석을
// 실제 사다리의 인접 가로선으로 변환한다. 원하는 도착 순열을 인접 교환으로
// 만들기 때문에 사다리 경로를 끝까지 따라가면 반드시 저장된 좌석에 도착한다.
func ladderRungsForAssignments(x *seatingSession, seatIDs []string) []ladderRung {
	laneCount := len(x.order)
	if laneCount < 2 {
		return nil
	}
	desired := make([]int, laneCount)
	for orderIndex, studentID := range x.order {
		start := x.ladderStarts[studentID]
		seatID := x.ladderSeatByStudent[studentID]
		end := -1
		for index, id := range seatIDs[:laneCount] {
			if id == seatID {
				end = index
				break
			}
		}
		if start < 1 || start > laneCount || end < 0 {
			return nil
		}
		desired[end] = start
		_ = orderIndex
	}
	lanes := make([]int, laneCount)
	for index := range lanes {
		lanes[index] = index + 1
	}
	rungs := make([]ladderRung, 0, laneCount*4)
	for end, start := range desired {
		position := end
		for position < laneCount && lanes[position] != start {
			position++
		}
		for position > end {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: position})
			lanes[position], lanes[position-1] = lanes[position-1], lanes[position]
			position--
		}
	}
	// 모든 인접 열을 앞뒤로 지나는 교차 묶음은 항등 순열이다. 따라서 저장된 도착 좌석을
	// 바꾸지 않으면서도 적은 인원에서 충분히 풍성한 사다리 연결선을 만들 수 있다.
	// 6명 이하는 세 묶음, 12명 이하는 두 묶음으로 수업용 게임판의 밀도를 보장한다.
	cycles := 1
	if laneCount <= 6 {
		cycles = 3
	} else if laneCount <= 12 {
		cycles = 2
	}
	for cycle := 0; cycle < cycles; cycle++ {
		for left := 1; left < laneCount; left++ {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: left})
		}
		for left := laneCount - 1; left >= 1; left-- {
			rungs = append(rungs, ladderRung{Level: len(rungs) + 1, Left: left})
		}
	}
	return rungs
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

// Info는 현재 회차의 입장 인원과 진행 상태를 교사 화면에 반환합니다.
func (s *SeatingServer) Info(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if x := s.sessions[planID]; x != nil && !x.closed {
		if x.ended {
			return s.infoLocked(x)
		}
		if x.paused {
			return s.infoLocked(x)
		}
		s.finishOrderShuffleLocked(x)
		s.advanceResultLocked(x)
		s.advanceRPSLocked(x)
		s.advanceRPSResultLocked(x)
		s.advanceLadderLocked(x)
		s.advanceLadderResultLocked(x)
		s.openStudentTurnIfNeededLocked(x)
		s.startAutomaticRouletteIfNeededLocked(x)
		s.finishPendingShotLocked(x)
		s.advanceResultLocked(x)
		s.advanceRPSLocked(x)
		s.advanceRPSResultLocked(x)
		s.advanceLadderLocked(x)
		s.advanceLadderResultLocked(x)
		s.openStudentTurnIfNeededLocked(x)
		return s.infoLocked(x)
	}
	return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
}

func (s *SeatingServer) infoLocked(x *seatingSession) (SeatingSessionInfo, error) {
	address := system.LocalAddress(x.listener.Addr().(*net.TCPAddr).Port)
	url := "http://" + address + "/s/" + x.shortCode
	png, err := qrcode.Encode(url, qrcode.Medium, 280)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	currentIndex := x.current
	if x.drawMethod == "랜덤 사다리 배정" {
		currentIndex = x.ladderCurrent
	}
	current := ""
	if currentIndex < len(x.order) {
		current = x.joined[x.order[currentIndex]]
	}
	notice := "QR을 스캔해 이름·생년월일을 확인하면 회차 닉네임이 배정됩니다."
	if x.phase == "희망 자리 제출 준비" {
		notice = "입장이 마감되었습니다. 교사가 희망 자리 제출을 열면 학생이 1~3지망을 제출합니다."
	} else if x.phase == "희망 자리 제출" {
		notice = fmt.Sprintf("학생이 남은 좌석 중 %d지망까지 제출합니다. 현재 %d명이 제출했습니다.", x.preferenceLimit, len(x.preferences))
	} else if x.phase == "경쟁률 공개" {
		notice = fmt.Sprintf("%d지망 경쟁률을 공개했습니다. 경쟁 좌석 %d곳을 확인해 주세요.", x.preferencePriority, len(x.contests))
	} else if x.phase == "가위바위보 선택" {
		notice = "현재 토너먼트 대결 후보가 10초 안에 가위·바위·보를 선택합니다."
	} else if x.phase == "가위바위보 결과" {
		notice = "토너먼트 대결 결과와 다음 진출자를 확인하는 중입니다."
	} else if x.phase == "사다리 출발점 선택" && x.drawMethod == "랜덤 사다리 배정" {
		notice = "배정 순서대로 학생이 남은 사다리 출발점 번호 하나를 선택합니다. 모두 선택하면 교사가 사다리를 공개합니다."
	} else if x.phase == "사다리 출발점 선택" {
		notice = "현재 경쟁 후보가 10초 안에 사다리 출발점 선호 순위를 선택합니다."
	} else if x.phase == "사다리 결과" {
		notice = "사다리 경로와 승자를 전자칠판에서 확인하는 중입니다."
	} else if x.phase == "사다리 공개" {
		notice = "출발점 선택이 마감되었습니다. 교사가 한 명씩 사다리타기를 진행합니다."
	} else if x.phase == "사다리 연출" {
		notice = "현재 학생의 사다리 경로를 전자칠판에 표시하고 있습니다."
	} else if x.phase == "사다리 결과 확인" {
		notice = "도착 좌석을 확인했습니다. 교사가 다음 학생 사다리타기를 시작할 수 있습니다."
	} else if x.phase == "자리 확인" {
		notice = "모든 참여 학생의 자리가 확정되었습니다. 전자칠판에서 최종 자리배치도를 확인해 주세요."
	} else if x.phase == "배정 완료" {
		notice = "제출된 지망의 경쟁이 모두 끝났습니다. 최종 결과를 확인해 주세요."
	} else if strings.HasSuffix(x.phase, "지망 처리 완료") {
		notice = fmt.Sprintf("%d차 배정의 %d지망 처리가 끝났습니다. 확정 결과를 확인한 뒤 다음 지망을 처리해 주세요.", x.preferenceCycle, x.preferencePriority)
	} else if x.phase == "다음 차 지망 제출 준비" {
		notice = fmt.Sprintf("%d차 배정의 1~%d지망 처리가 끝났습니다. 미배정 학생만 새 희망 자리를 제출합니다.", x.preferenceCycle, x.preferenceLimit)
	} else if x.phase == "순서 섞기" {
		notice = "5초 동안 입장 학생 순서를 섞은 뒤 최종 순서를 확정합니다."
	} else if x.phase == "룰렛 시작 준비" {
		notice = "교사가 룰렛 시작을 누르면 5초 뒤 첫 학생 차례가 열립니다."
	} else if x.phase == "룰렛 대기" {
		notice = "현재 학생이 5초 안에 룰렛을 돌립니다. 시간이 지나면 자동으로 시작합니다."
	} else if x.phase == "룰렛 시작 대기" {
		notice = "5초 뒤 다음 학생의 룰렛 차례를 엽니다."
	} else if x.phase == "룰렛 연출" {
		notice = "룰렛이 회전 중입니다. 멈추면 좌석을 저장합니다."
	} else if x.phase == "결과 확인" || x.phase == "최종 결과 확인" {
		notice = "확정된 자리 결과를 확인하는 중입니다. 잠시 뒤 다음 단계로 진행합니다."
	} else if x.phase == "오류" {
		notice = "저장 오류로 회차가 멈췄습니다. 교사가 복구 방식을 선택할 때까지 기다려 주세요."
	} else if x.phase == "회차 종료" {
		notice = "교사가 이 회차를 종료했습니다. 전자칠판 안내를 확인해 주세요."
	}
	currentSeat, candidates := "", []string{}
	if contest := s.currentContestLocked(x); contest != nil {
		currentSeat = x.seatLabels[contest.SeatID]
		for _, id := range contest.StudentIDs {
			candidates = append(candidates, x.joined[id])
		}
	}
	if x.paused {
		notice = "교사가 회차를 안전 일시정지했습니다. 교사 재개를 기다려 주세요."
	}
	return SeatingSessionInfo{PlanID: x.planID, Running: !x.ended, StudentURL: url, BoardURL: "http://" + address + "/board/" + x.boardToken, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), ParticipantCnt: len(x.joined), LadderSelectedCnt: len(x.ladderStarts), Phase: x.phase, CurrentNickname: current, Notice: notice, DrawMethod: x.drawMethod, CompetitionMethod: x.competitionMethod, PreferenceLimit: x.preferenceLimit, SubmittedCnt: len(x.preferences), ContestCnt: len(x.contests), CurrentPreferencePriority: x.preferencePriority, CurrentContestSeat: currentSeat, CurrentContestCandidates: candidates, Paused: x.paused, ErrorMessage: x.errorMessage}, nil
}

func (s *SeatingServer) fixedSeatsLocked(plan SeatingPlan) map[string]string {
	fixed := map[string]string{}
	if len(plan.FixedStudentIDs) == 0 {
		return fixed
	}
	plans, err := s.store.ListSeatingPlans()
	if err != nil {
		return fixed
	}
	wanted := map[string]bool{}
	for _, id := range plan.FixedStudentIDs {
		wanted[id] = true
	}
	currentSeats := orderedPlanSeats(plan)
	for _, previous := range plans {
		if previous.ID == plan.ID {
			continue
		}
		previousSeats := orderedPlanSeats(previous)
		for index, seat := range previousSeats {
			if wanted[seat.StudentID] && fixed[seat.StudentID] == "" {
				// 좌석 ID는 배치안마다 새로 생길 수 있으므로, 이전 배치의
				// 시각적 순서를 현재 배치의 같은 순서 좌석으로 안전하게 옮긴다.
				if index < len(currentSeats) {
					fixed[seat.StudentID] = currentSeats[index].ID
				}
			}
		}
	}
	return fixed
}
func (s *SeatingServer) loginAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", 405)
			return
		}
		var q struct {
			Name      string `json:"name"`
			BirthDate string `json:"birthDate"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&q) != nil {
			http.Error(w, "입력값을 확인해 주세요", 400)
			return
		}
		clientIP := seatingClientIP(r)
		s.mu.Lock()
		if x.paused {
			s.mu.Unlock()
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "입장 대기" {
			s.mu.Unlock()
			http.Error(w, "마감된 회차입니다", http.StatusForbidden)
			return
		}
		if blockedUntil := x.loginAttempts[clientIP].blockedUntil; time.Now().Before(blockedUntil) {
			s.mu.Unlock()
			http.Error(w, "인증을 여러 번 시도했습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
			return
		}
		s.mu.Unlock()
		students, err := s.store.ListStudents()
		if err != nil {
			http.Error(w, "보관함이 잠겨 있습니다", 423)
			return
		}
		birth := normalizeSeatingBirth(q.BirthDate)
		var id string
		for _, st := range students {
			storedBirth := normalizeSeatingBirth(st.BirthDate)
			if normalizeSeatingName(st.Name) == normalizeSeatingName(q.Name) && storedBirth == birth {
				id = st.ID
				break
			}
		}
		if id == "" {
			s.mu.Lock()
			blocked := recordSeatingLoginFailureLocked(x, clientIP, time.Now())
			s.mu.Unlock()
			if blocked {
				http.Error(w, "인증을 여러 번 시도했습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
				return
			}
			http.Error(w, "이름 또는 생년월일을 확인해 주세요", 401)
			return
		}
		s.mu.Lock()
		if x.paused {
			s.mu.Unlock()
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "입장 대기" {
			s.mu.Unlock()
			http.Error(w, "마감된 회차입니다", 403)
			return
		}
		delete(x.loginAttempts, clientIP)
		nick := x.joined[id]
		if nick == "" {
			nick, err = randomSeatingNickname(x.joined)
			if err != nil {
				s.mu.Unlock()
				http.Error(w, "닉네임을 준비하지 못했습니다", http.StatusInternalServerError)
				return
			}
			x.joined[id] = nick
			x.joinedOrder = append(x.joinedOrder, id)
		}
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "kkomi-seat", Value: id, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		system.WriteJSON(w, map[string]any{"ok": true, "nickname": nick})
	}
}

func seatingClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	return r.RemoteAddr
}

func recordSeatingLoginFailureLocked(x *seatingSession, clientIP string, now time.Time) bool {
	if x.loginAttempts == nil {
		x.loginAttempts = map[string]seatingLoginAttempt{}
	}
	attempt := x.loginAttempts[clientIP]
	if !attempt.blockedUntil.IsZero() && !now.Before(attempt.blockedUntil) {
		attempt = seatingLoginAttempt{}
	}
	attempt.failures++
	if attempt.failures >= 5 {
		attempt.failures = 0
		attempt.blockedUntil = now.Add(30 * time.Second)
		x.loginAttempts[clientIP] = attempt
		return true
	}
	x.loginAttempts[clientIP] = attempt
	return false
}

func normalizeSeatingName(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
}

func normalizeSeatingBirth(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, value)
}

func randomSeatingNickname(joined map[string]string) (string, error) {
	left := []string{"별빛", "구름", "새싹", "바람", "햇살", "무지개", "달빛", "반짝"}
	right := []string{"토끼", "여우", "고래", "다람쥐", "펭귄", "나비", "부엉이", "고양이"}
	used := map[string]bool{}
	for _, nickname := range joined {
		used[nickname] = true
	}
	for attempt := 0; attempt < 64; attempt++ {
		b, err := system.RandomBytes(2)
		if err != nil {
			return "", err
		}
		nickname := left[int(b[0])%len(left)] + right[int(b[1])%len(right)]
		if !used[nickname] {
			return nickname, nil
		}
	}
	return "", errors.New("사용 가능한 닉네임이 없습니다")
}

// stateAPI는 학생·전자칠판 상태를 같은 읽기 모델로 만들되, 최종 실명은
// 전자칠판 전용 토큰으로 접근한 경우에만 포함한다.
func (s *SeatingServer) stateAPI(x *seatingSession, finalNameAccess ...bool) http.HandlerFunc {
	includeFinalNames := len(finalNameAccess) > 0 && finalNameAccess[0]
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !x.paused && !x.ended {
			s.finishOrderShuffleLocked(x)
			s.finishRandomLadderAnimationLocked(x)
			s.advanceResultLocked(x)
			s.advanceRPSLocked(x)
			s.advanceRPSResultLocked(x)
			s.openStudentTurnIfNeededLocked(x)
			s.startAutomaticRouletteIfNeededLocked(x)
			s.finishPendingShotLocked(x)
			s.advanceResultLocked(x)
			s.openStudentTurnIfNeededLocked(x)
		}
		studentID := ""
		if cookie, err := r.Cookie("kkomi-seat"); err == nil {
			studentID = cookie.Value
		}
		seats := make([]map[string]any, 0, len(x.available))
		for id := range x.available {
			seat := x.seatLayout[id]
			seats = append(seats, map[string]any{"id": id, "label": x.seatLabels[id], "row": seat.Row, "column": seat.Column})
		}
		sort.Slice(seats, func(i, j int) bool {
			return seats[i]["row"].(int) < seats[j]["row"].(int) || (seats[i]["row"].(int) == seats[j]["row"].(int) && seats[i]["column"].(int) < seats[j]["column"].(int))
		})
		currentIndex := x.current
		if x.drawMethod == "랜덤 사다리 배정" {
			currentIndex = x.ladderCurrent
		}
		current := ""
		if currentIndex < len(x.order) {
			current = x.joined[x.order[currentIndex]]
		}
		endsAt := ""
		if x.pendingShot != nil {
			endsAt = x.pendingShot.endsAt.UTC().Format(time.RFC3339Nano)
		} else if !x.resultEndsAt.IsZero() {
			endsAt = x.resultEndsAt.UTC().Format(time.RFC3339Nano)
		}
		displayOrder := x.order
		if x.phase == "순서 섞기" && len(x.shufflePreview) > 0 {
			if shuffled, err := ShuffleStudentIDs(x.shufflePreview); err == nil {
				x.shufflePreview = shuffled
			}
			displayOrder = x.shufflePreview
		}
		remaining := make([]string, 0, len(displayOrder))
		for index := x.current; index < len(displayOrder); index++ {
			remaining = append(remaining, x.joined[displayOrder[index]])
		}
		joined := make([]string, 0, len(x.joinedOrder))
		for _, id := range x.joinedOrder {
			joined = append(joined, x.joined[id])
		}
		orderNicknames := make([]string, 0, len(displayOrder))
		for _, id := range displayOrder {
			orderNicknames = append(orderNicknames, x.joined[id])
		}
		layout := s.layoutSnapshotLocked(x)
		if (x.phase == "배정 완료" || x.phase == "자리 확인") && includeFinalNames {
			finalNames := s.finalNamesBySeatLocked(x)
			for _, seat := range layout {
				seat["finalName"] = finalNames[seat["id"].(string)]
			}
		}
		mySeatID := x.assigned[studentID]
		mySeatLabel := x.seatLabels[mySeatID]
		turnEndsAt := ""
		if !x.turnEndsAt.IsZero() {
			turnEndsAt = x.turnEndsAt.UTC().Format(time.RFC3339Nano)
		}
		turnStartsAt := ""
		if !x.turnStartsAt.IsZero() {
			turnStartsAt = x.turnStartsAt.UTC().Format(time.RFC3339Nano)
		}
		spinSeatID := ""
		spinStartedAt := ""
		if x.pendingShot != nil {
			spinSeatID = x.pendingShot.targetID
			spinStartedAt = x.pendingShot.startedAt.UTC().Format(time.RFC3339Nano)
		}
		demand := map[string]int{}
		for _, picks := range x.preferences {
			for _, seatID := range picks {
				// 이미 확정된 좌석은 새 접수의 희망·경쟁률로 다시 표시하지 않는다.
				if x.available[seatID] {
					demand[seatID]++
				}
			}
		}
		contests := make([]map[string]any, 0, len(x.contests))
		for index, contest := range x.contests {
			contests = append(contests, map[string]any{"seatId": contest.SeatID, "seatLabel": x.seatLabels[contest.SeatID], "priority": contest.Priority, "candidateCount": len(contest.StudentIDs), "current": index == x.contestIndex})
		}
		confirmed := make([]map[string]any, 0, len(x.confirmed))
		for _, item := range x.confirmed {
			confirmed = append(confirmed, map[string]any{"seatId": item.SeatID, "seatLabel": x.seatLabels[item.SeatID], "nickname": x.joined[item.StudentID], "priority": item.Priority})
		}
		if x.drawMethod == "랜덤 사다리 배정" {
			for _, studentID := range x.order {
				if seatID := x.assigned[studentID]; seatID != "" {
					confirmed = append(confirmed, map[string]any{"seatId": seatID, "seatLabel": x.seatLabels[seatID], "nickname": x.joined[studentID]})
				}
			}
		}
		if x.drawMethod == "랜덤 룰렛 배정" {
			for _, studentID := range x.order {
				if seatID := x.assigned[studentID]; seatID != "" {
					confirmed = append(confirmed, map[string]any{"seatId": seatID, "seatLabel": x.seatLabels[seatID], "nickname": x.joined[studentID]})
				}
			}
		}
		rpsMatches := make([]map[string]any, 0, len(x.rpsRound))
		for _, match := range x.rpsRound {
			rpsMatches = append(rpsMatches, map[string]any{"left": x.joined[match.LeftID], "right": x.joined[match.RightID], "leftChoice": match.LeftChoice, "rightChoice": match.RightChoice, "winner": x.joined[match.WinnerID], "bye": match.Bye})
		}
		rpsRounds := make([][]map[string]any, 0, len(x.rpsHistory)+1)
		for _, round := range x.rpsHistory {
			items := make([]map[string]any, 0, len(round))
			for _, match := range round {
				items = append(items, map[string]any{"left": x.joined[match.LeftID], "right": x.joined[match.RightID], "leftChoice": match.LeftChoice, "rightChoice": match.RightChoice, "winner": x.joined[match.WinnerID], "bye": match.Bye})
			}
			rpsRounds = append(rpsRounds, items)
		}
		if len(rpsMatches) > 0 && x.phase != "가위바위보 결과" {
			rpsRounds = append(rpsRounds, rpsMatches)
		}
		ladderPaths := make([]map[string]any, 0)
		ladderLaneCount, ladderWinningEnd := 0, 0
		ladderSeatLabels := []string{}
		if x.drawMethod == "랜덤 사다리 배정" {
			ladderLaneCount = len(x.order)
			for _, seatID := range x.ladderSeatIDs {
				ladderSeatLabels = append(ladderSeatLabels, x.seatLabels[seatID])
			}
			for _, studentID := range x.order {
				start := x.ladderStarts[studentID]
				path := map[string]any{"start": start, "nickname": "", "end": 0, "revealed": x.ladderRevealed}
				if x.ladderRevealed {
					path["nickname"] = x.joined[studentID]
				}
				if x.ladderRevealed {
					for i, seatID := range x.ladderSeatIDs {
						if seatID == x.ladderSeatByStudent[studentID] {
							path["end"] = i + 1
							break
						}
					}
				}
				path["active"] = x.ladderAnimating && x.ladderCurrent < len(x.order) && x.order[x.ladderCurrent] == studentID
				path["complete"] = x.assigned[studentID] != ""
				ladderPaths = append(ladderPaths, path)
			}
		}
		if current := s.currentContestLocked(x); current != nil {
			ladderLaneCount = len(current.StudentIDs)
		}
		if x.ladderResult != nil {
			ladderLaneCount, ladderWinningEnd = x.ladderResult.LaneCount, x.ladderResult.WinningEnd
			for studentID, start := range x.ladderResult.StartByStudent {
				ladderPaths = append(ladderPaths, map[string]any{
					"nickname": x.joined[studentID],
					"start":    start,
					"end":      x.ladderResult.EndByStudent[studentID],
					"winner":   studentID == x.ladderResult.WinnerID,
				})
			}
			sort.Slice(ladderPaths, func(i, j int) bool { return ladderPaths[i]["start"].(int) < ladderPaths[j]["start"].(int) })
		}
		currentContest := s.currentContestLocked(x)
		currentSeat, candidates := "", []string{}
		if currentContest != nil {
			currentSeat = x.seatLabels[currentContest.SeatID]
			for _, id := range currentContest.StudentIDs {
				candidates = append(candidates, x.joined[id])
			}
		}
		if (x.phase == "사다리 출발점 선택" || x.phase == "사다리 결과") && x.ladderSeatID != "" {
			currentSeat = x.seatLabels[x.ladderSeatID]
		}
		// 이미 확정된 학생 기기는 자신의 확정 좌석 안내만 받는다.
		// 다음 라운드의 빈 좌석 목록·배치도는 전자칠판과 미배정 학생에게만 제공한다.
		// seatMap은 학생 휴대폰의 "내 자리" 미니 배치도용 좌석 위치만 담는다(이름·빈자리 정보 없음).
		seatMap := make([]map[string]any, 0, len(layout))
		for _, seat := range layout {
			seatMap = append(seatMap, map[string]any{"id": seat["id"], "label": seat["label"], "seatNumber": seat["seatNumber"], "row": seat["row"], "column": seat["column"], "x": seat["x"], "y": seat["y"]})
		}
		if studentID != "" && mySeatID != "" {
			seats = []map[string]any{}
			layout = []map[string]any{}
			demand = map[string]int{}
		}
		canSubmitPreferences := studentID != "" && mySeatID == "" && x.phase == "희망 자리 제출"
		myLadderStart := x.ladderStarts[studentID]
		finalOrderNicknames := make([]string, 0, len(x.order))
		for _, id := range x.order {
			finalOrderNicknames = append(finalOrderNicknames, x.joined[id])
		}
		system.WriteJSON(w, map[string]any{"running": !x.closed, "seatMap": seatMap, "participants": len(x.joined), "rosterCount": x.rosterCount, "phase": x.phase, "drawMethod": x.drawMethod, "competitionMethod": x.competitionMethod, "deskPosition": x.deskPosition, "nickname": x.joined[studentID], "currentNickname": current, "yourTurn": x.phase == "룰렛 대기" && x.current < len(x.order) && x.order[x.current] == studentID, "availableSeats": seats, "rouletteSeats": s.rouletteSnapshotLocked(x), "layout": layout, "placementMode": x.placementMode, "layoutMode": x.layoutMode, "remainingNicknames": remaining, "joinedNicknames": joined, "orderNicknames": orderNicknames, "finalOrderNicknames": finalOrderNicknames, "currentOrderIndex": currentIndex, "orderShuffling": x.phase == "순서 섞기", "orderEndsAt": x.orderShuffleEndsAt.UTC().Format(time.RFC3339Nano), "turnStartsAt": turnStartsAt, "turnEndsAt": turnEndsAt, "mySeatId": mySeatID, "mySeatLabel": mySeatLabel, "canSubmitPreferences": canSubmitPreferences, "lastShot": x.lastShot, "lastShotSeatId": x.lastShotSeatID, "spinning": x.pendingShot != nil, "spinSeatId": spinSeatID, "spinStartedAt": spinStartedAt, "endsAt": endsAt, "resultHolding": x.phase == "결과 확인" || x.phase == "최종 결과 확인", "completed": x.phase == "배정 완료" || x.phase == "자리 확인", "finalScreen": x.phase == "자리 확인", "preferenceLimit": x.preferenceLimit, "preferenceCycle": x.preferenceCycle, "preferencePriority": x.preferencePriority, "preferenceSubmitted": len(x.preferences), "myPreferences": x.preferences[studentID], "seatDemand": demand, "contests": contests, "confirmedAssignments": confirmed, "rpsEndsAt": x.rpsEndsAt.UTC().Format(time.RFC3339Nano), "rpsMatches": rpsMatches, "rpsRounds": rpsRounds, "rpsSeatLabel": currentSeat, "rpsCandidates": candidates, "myRPSChoice": x.rpsChoices[studentID], "ladderEndsAt": x.ladderEndsAt.UTC().Format(time.RFC3339Nano), "ladderLaneCount": ladderLaneCount, "ladderSeatLabels": ladderSeatLabels, "ladderPaths": ladderPaths, "ladderRungs": x.ladderRungs, "ladderWinningEnd": ladderWinningEnd, "myLadderChoices": x.ladderChoices[studentID], "myLadderStart": myLadderStart, "ladderRevealed": x.ladderRevealed, "ladderAnimating": x.ladderAnimating})
	}
}

func (s *SeatingServer) rpsAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("kkomi-seat")
		if err != nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		var body struct {
			Choice string `json:"choice"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		if body.Choice != "가위" && body.Choice != "바위" && body.Choice != "보" {
			http.Error(w, "가위·바위·보 중 하나를 선택해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if x.paused {
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "가위바위보 선택" || time.Now().After(x.rpsEndsAt) {
			http.Error(w, "현재 가위바위보 선택 시간이 아닙니다", http.StatusForbidden)
			return
		}
		eligible := false
		for _, match := range x.rpsRound {
			if match.WinnerID == "" && (match.LeftID == cookie.Value || match.RightID == cookie.Value) {
				eligible = true
				break
			}
		}
		if !eligible {
			http.Error(w, "현재 대결 후보가 아닙니다", http.StatusForbidden)
			return
		}
		x.rpsChoices[cookie.Value] = body.Choice
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

func (s *SeatingServer) ladderAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("kkomi-seat")
		if err != nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		var body struct {
			Starts []int `json:"starts"`
			Start  int   `json:"start"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&body) != nil {
			http.Error(w, "출발점 입력을 확인해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if x.paused {
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.drawMethod == "랜덤 사다리 배정" {
			if x.closed || x.phase != "사다리 출발점 선택" {
				http.Error(w, "현재 사다리 출발점 선택 시간이 아닙니다", http.StatusForbidden)
				return
			}
			if x.ladderStarts[cookie.Value] != 0 {
				http.Error(w, "출발점 번호를 이미 확정했습니다", http.StatusConflict)
				return
			}
			if x.ladderCurrent >= len(x.order) || x.order[x.ladderCurrent] != cookie.Value {
				http.Error(w, "현재 출발점 선택 차례가 아닙니다", http.StatusForbidden)
				return
			}
			lane := body.Start
			if lane < 1 || lane > len(x.order) {
				http.Error(w, "유효한 출발점 번호를 선택해 주세요", http.StatusBadRequest)
				return
			}
			for _, selected := range x.ladderStarts {
				if selected == lane {
					http.Error(w, "다른 학생이 선택한 출발점입니다", http.StatusConflict)
					return
				}
			}
			x.ladderStarts[cookie.Value] = lane
			for x.ladderCurrent < len(x.order) && x.ladderStarts[x.order[x.ladderCurrent]] != 0 {
				x.ladderCurrent++
			}
			system.WriteJSON(w, map[string]any{"ok": true, "start": lane})
			return
		}
		if x.closed || x.phase != "사다리 출발점 선택" || time.Now().After(x.ladderEndsAt) {
			http.Error(w, "현재 사다리 출발점 선택 시간이 아닙니다", http.StatusForbidden)
			return
		}
		contest := s.currentContestLocked(x)
		eligible := false
		laneCount := 0
		if contest != nil {
			laneCount = len(contest.StudentIDs)
			for _, studentID := range contest.StudentIDs {
				if studentID == cookie.Value {
					eligible = true
					break
				}
			}
		}
		if !eligible {
			http.Error(w, "현재 사다리 경쟁 후보가 아닙니다", http.StatusForbidden)
			return
		}
		if len(body.Starts) < 1 || len(body.Starts) > 3 {
			http.Error(w, "출발점은 1~3순위로 선택해 주세요", http.StatusBadRequest)
			return
		}
		seen := map[int]bool{}
		for _, lane := range body.Starts {
			if lane < 1 || lane > laneCount || seen[lane] {
				http.Error(w, "서로 다른 유효한 출발점을 선택해 주세요", http.StatusBadRequest)
				return
			}
			seen[lane] = true
		}
		x.ladderChoices[cookie.Value] = append([]int(nil), body.Starts...)
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

func (s *SeatingServer) preferenceAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("kkomi-seat")
		if err != nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		var body struct {
			SeatIDs []string `json:"seatIds"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&body) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if x.paused {
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "희망 자리 제출" || x.joined[cookie.Value] == "" {
			http.Error(w, "현재 희망 자리 제출 시간이 아닙니다", http.StatusForbidden)
			return
		}
		if err := validatePreferenceSubmissionLocked(x, cookie.Value, body.SeatIDs); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		x.preferences[cookie.Value] = append([]string(nil), body.SeatIDs...)
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

// validatePreferenceSubmissionLocked는 화면 우회 요청도 같은 기준으로 막는다.
func validatePreferenceSubmissionLocked(x *seatingSession, studentID string, seatIDs []string) error {
	if x.assigned[studentID] != "" {
		return errors.New("이미 자리가 확정되어 다음 희망을 제출할 수 없습니다")
	}
	if len(seatIDs) < 1 || len(seatIDs) > x.preferenceLimit {
		return fmt.Errorf("1~%d지망까지 선택할 수 있습니다", x.preferenceLimit)
	}
	seen := map[string]bool{}
	for _, id := range seatIDs {
		if seen[id] {
			return errors.New("희망 좌석 번호를 중복해 입력할 수 없습니다")
		}
		if !x.available[id] {
			return errors.New("존재하지 않거나 선택할 수 없는 좌석 번호입니다")
		}
		seen[id] = true
	}
	return nil
}

func (s *SeatingServer) finalNamesBySeatLocked(x *seatingSession) map[string]string {
	result := map[string]string{}
	students, err := s.store.ListStudents()
	if err != nil {
		return result
	}
	names := map[string]string{}
	for _, student := range students {
		names[student.ID] = student.Name
	}
	for studentID, seatID := range x.assigned {
		result[seatID] = names[studentID]
	}
	return result
}

func (s *SeatingServer) rouletteSnapshotLocked(x *seatingSession) []map[string]any {
	all := s.layoutSnapshotLocked(x)
	result := make([]map[string]any, 0, len(x.available))
	for _, seat := range all {
		if x.available[seat["id"].(string)] {
			result = append(result, seat)
		}
	}
	return result
}

func (s *SeatingServer) finishOrderShuffleLocked(x *seatingSession) {
	if x.phase == "순서 섞기" && !x.orderShuffleEndsAt.IsZero() && !time.Now().Before(x.orderShuffleEndsAt) {
		if x.drawMethod == "랜덤 사다리 배정" {
			x.ladderStarts = map[string]int{}
			x.ladderSeatByStudent = map[string]string{}
			x.ladderSeatIDs = s.ladderSeatIDsLocked(x)
			x.ladderRungs = []ladderRung{}
			x.ladderOrder = append([]string(nil), x.order...)
			x.ladderCurrent, x.ladderRevealed, x.ladderAnimating = 0, false, false
			x.phase = "사다리 출발점 선택"
		} else {
			x.phase = "룰렛 시작 준비"
		}
		x.shufflePreview = nil
		x.turnEndsAt = time.Time{}
	}
}

func (s *SeatingServer) finishRandomLadderAnimationLocked(x *seatingSession) {
	if x.drawMethod != "랜덤 사다리 배정" || x.phase != "사다리 연출" || x.ladderEndsAt.IsZero() || time.Now().Before(x.ladderEndsAt) {
		return
	}
	x.ladderAnimating = false
	x.ladderCurrent++
	x.ladderEndsAt = time.Time{}
	if x.ladderCurrent >= len(x.order) {
		x.phase = "자리 확인"
	} else {
		x.phase = "사다리 결과 확인"
	}
}

func (s *SeatingServer) openStudentTurnIfNeededLocked(x *seatingSession) {
	if x.phase != "룰렛 시작 대기" || x.turnStartsAt.IsZero() || time.Now().Before(x.turnStartsAt) {
		return
	}
	x.phase = "룰렛 대기"
	x.turnStartsAt = time.Time{}
	x.turnEndsAt = time.Now().Add(5 * time.Second)
}

func (s *SeatingServer) startAutomaticRouletteIfNeededLocked(x *seatingSession) {
	if x.phase != "룰렛 대기" || x.turnEndsAt.IsZero() || time.Now().Before(x.turnEndsAt) {
		return
	}
	_ = s.queueArrowShotLocked(x)
}

func (s *SeatingServer) layoutSnapshotLocked(x *seatingSession) []map[string]any {
	ids := s.orderedSeatIDsLocked(x)
	reverse := map[string]string{}
	for studentID, seatID := range x.assigned {
		reverse[seatID] = x.joined[studentID]
	}
	result := make([]map[string]any, 0, len(ids))
	for index, id := range ids {
		seat := x.seatLayout[id]
		result = append(result, map[string]any{"id": id, "seatNumber": index + 1, "label": fmt.Sprintf("%d번", index+1), "rawLabel": fmt.Sprintf("%d번", index+1), "row": seat.Row, "column": seat.Column, "x": seat.X, "y": seat.Y, "displayOrder": index, "available": x.available[id], "nickname": reverse[id]})
	}
	return result
}

func (s *SeatingServer) orderedSeatIDsLocked(x *seatingSession) []string {
	ids := make([]string, 0, len(x.seatLayout))
	for id := range x.seatLayout {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		left, right := x.seatLayout[ids[i]], x.seatLayout[ids[j]]
		if x.layoutMode == "사용자 지정" {
			return left.Y < right.Y || (left.Y == right.Y && left.X < right.X)
		}
		return left.Row < right.Row || (left.Row == right.Row && left.Column < right.Column)
	})
	return ids
}

// qrAPI는 콘텐츠 보안 정책에 막히지 않는 같은 서버의 PNG QR 이미지를 제공합니다.
func (s *SeatingServer) qrAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		studentURL := "http://" + system.LocalAddress(x.listener.Addr().(*net.TCPAddr).Port) + "/s/" + x.shortCode
		png, err := qrcode.Encode(studentURL, qrcode.Medium, 320)
		if err != nil {
			http.Error(w, "QR 코드를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}
}

func (s *SeatingServer) queueArrowShotLocked(x *seatingSession) error {
	if x.current >= len(x.order) {
		return errors.New("배정할 학생이 없습니다")
	}
	studentID := x.order[x.current]
	target := ""
	if fixed := x.fixed[studentID]; fixed != "" && x.available[fixed] {
		target = fixed
	}
	if target == "" {
		candidates := make([]string, 0, len(x.available))
		for id := range x.available {
			reserved := false
			for owner, fixed := range x.fixed {
				if owner != studentID && x.joined[owner] != "" && id == fixed {
					reserved = true
					break
				}
			}
			if !reserved {
				candidates = append(candidates, id)
			}
		}
		shuffled, err := ShuffleStudentIDs(candidates)
		if err != nil || len(shuffled) == 0 {
			return errors.New("배정할 좌석을 준비하지 못했습니다")
		}
		target = shuffled[0]
	}
	b, err := system.RandomBytes(1)
	if err != nil {
		return errors.New("룰렛 시간을 준비하지 못했습니다")
	}
	startedAt := time.Now()
	x.pendingShot = &pendingArrowShot{studentID: studentID, targetID: target, startedAt: startedAt, endsAt: startedAt.Add(time.Duration(3+int(b[0])%3) * time.Second)}
	x.phase = "룰렛 연출"
	return nil
}

func (s *SeatingServer) arrowAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		cookie, err := r.Cookie("kkomi-seat")
		if err != nil {
			http.Error(w, "먼저 입장해 주세요", http.StatusUnauthorized)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if x.paused {
			http.Error(w, "교사가 회차를 안전 일시정지했습니다", http.StatusLocked)
			return
		}
		if x.closed || x.phase != "룰렛 대기" || x.current >= len(x.order) || x.order[x.current] != cookie.Value {
			http.Error(w, "현재 학생의 룰렛 차례가 아닙니다", http.StatusForbidden)
			return
		}
		if err := s.queueArrowShotLocked(x); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		system.WriteJSON(w, map[string]any{"ok": true, "spinning": true})
	}
}

func (s *SeatingServer) finishPendingShotLocked(x *seatingSession) {
	if x.pendingShot == nil || time.Now().Before(x.pendingShot.endsAt) {
		return
	}
	pending := x.pendingShot
	if s.persistArrowAssignmentLocked(x, pending.studentID, pending.targetID) != nil {
		s.beginAssignmentRecoveryLocked(x, "룰렛", pending.studentID, pending.targetID)
		return
	}
	label := x.seatLabels[pending.targetID]
	if label == "" {
		label = pending.targetID
	}
	x.assigned[pending.studentID], x.lastShot, x.lastShotSeatID = pending.targetID, x.joined[pending.studentID]+" → "+label, pending.targetID
	x.pendingShot = nil
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	if x.current+1 >= len(x.order) {
		x.phase = "최종 결과 확인"
	} else {
		x.phase = "결과 확인"
	}
	x.turnEndsAt = time.Time{}
}

// advanceResultLocked는 정지한 룰렛 결과를 최소 5초 보여 준 뒤에만
// 당첨 칸을 원판에서 빼고 다음 학생 차례로 넘긴다.
func (s *SeatingServer) advanceResultLocked(x *seatingSession) {
	if (x.phase != "결과 확인" && x.phase != "최종 결과 확인") || x.resultEndsAt.IsZero() || time.Now().Before(x.resultEndsAt) {
		return
	}
	delete(x.available, x.lastShotSeatID)
	x.current++
	x.resultEndsAt = time.Time{}
	if x.current >= len(x.order) {
		x.phase = "자리 확인"
		x.turnStartsAt = time.Time{}
		return
	}
	if s.confirmLastRouletteAssignmentLocked(x) {
		return
	}
	x.phase = "룰렛 시작 대기"
	x.turnStartsAt = time.Now().Add(5 * time.Second)
}

// confirmLastRouletteAssignmentLocked는 마지막 학생에게 남은 유일한 좌석을 바로 확정합니다.
// 마지막 학생에게는 룰렛 버튼·대기 시간을 열지 않으며, 저장 실패 시 기존 복구 흐름을 사용합니다.
func (s *SeatingServer) confirmLastRouletteAssignmentLocked(x *seatingSession) bool {
	if x.drawMethod != "랜덤 룰렛 배정" || x.current+1 != len(x.order) || len(x.available) != 1 {
		return false
	}
	studentID := x.order[x.current]
	seatID := ""
	for id := range x.available {
		seatID = id
	}
	if seatID == "" {
		return false
	}
	if err := s.persistArrowAssignmentLocked(x, studentID, seatID); err != nil {
		s.beginAssignmentRecoveryLocked(x, "룰렛", studentID, seatID)
		return true
	}
	label := x.seatLabels[seatID]
	if label == "" {
		label = seatID
	}
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	x.lastShot = x.joined[studentID] + " → " + label + " · 마지막 자리 자동 확정"
	x.lastShotSeatID = seatID
	x.phase = "최종 결과 확인"
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	x.turnStartsAt, x.turnEndsAt = time.Time{}, time.Time{}
	return true
}

func (s *SeatingServer) persistArrowAssignmentLocked(x *seatingSession, studentID, seatID string) error {
	plan, err := s.store.GetSeatingPlan(x.planID)
	if err != nil {
		return err
	}
	for index := range plan.Seats {
		if plan.Seats[index].ID == seatID {
			plan.Seats[index].StudentID = studentID
			_, saveErr := s.store.SaveSeatingPlan(plan)
			return saveErr
		}
	}
	return errors.New("선택한 좌석을 찾지 못했습니다")
}

// studentPage와 boardPage는 세 배정 방식이 함께 쓰는 학생·전자칠판 화면을 제공한다.
// 화면은 상태 API의 단계(phase)와 배정 방식(drawMethod)을 보고 알맞은 장면을 그린다.
func (s *SeatingServer) studentPage(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeSeatingPublicHTML(w, renderSeatingStudentPage(seatingPublicPageDataFor(x)))
	}
}

func (s *SeatingServer) boardPage(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeSeatingPublicHTML(w, renderSeatingBoardPage(seatingPublicPageDataFor(x)))
	}
}
