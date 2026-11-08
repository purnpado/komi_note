package groupsession

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"
)

// 모둠장이 있는 방식의 단계
const (
	PhaseVote    = "모둠장 투표"
	PhaseLeaders = "모둠장 확정"
	PhasePots    = "포트 나누기"
	PhaseDraft   = "블라인드 지명"
)

// 회차 방식
const (
	ModePreference       = "preference"       // 지망 배정
	ModeDraft            = "draft"            // 모둠장 투표 + 블라인드 지명
	ModeLeaderPreference = "leaderPreference" // 모둠장 투표 + 나머지 학생 지망 배정
)

const voteLimit = 2

// Pick은 블라인드 지명 한 번의 기록입니다.
type Pick struct {
	Round int    `json:"round"`
	Group int    `json:"group"`
	Key   string `json:"key"`
	Card  int    `json:"card"`
	Auto  bool   `json:"auto"`
}

// VoteCount는 모둠장 투표 결과(교사 화면 전용)입니다.
type VoteCount struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

func (x *session) hasLeaders() bool {
	return x.request.Mode == ModeDraft || x.request.Mode == ModeLeaderPreference
}

func (x *session) leaderGroup(key string) int {
	for group, leader := range x.leaders {
		if leader == key {
			return group
		}
	}
	return -1
}

// voteCountsLocked는 득표 순(같으면 번호 순) 결과입니다.
func (x *session) voteCountsLocked() []VoteCount {
	counts := map[string]int{}
	for _, list := range x.votes {
		for _, key := range list {
			counts[key]++
		}
	}
	result := []VoteCount{}
	for _, p := range x.participants {
		if counts[p.Key] > 0 {
			result = append(result, VoteCount{Key: p.Key, Count: counts[p.Key]})
		}
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].Count > result[j].Count })
	return result
}

// suggestLeadersLocked는 득표가 많은 학생을 모둠 수만큼 추천합니다. 같은 표는 무작위, 모자라면 입장한 학생 중 무작위.
func (x *session) suggestLeadersLocked() []string {
	counts := map[string]int{}
	for _, list := range x.votes {
		for _, key := range list {
			counts[key]++
		}
	}
	keys := []string{}
	for _, p := range x.participants {
		keys = append(keys, p.Key)
	}
	keys = shuffled(keys)
	joined := map[string]bool{}
	for _, p := range x.participants {
		joined[p.Key] = p.nickname != ""
	}
	sort.SliceStable(keys, func(i, j int) bool {
		if counts[keys[i]] != counts[keys[j]] {
			return counts[keys[i]] > counts[keys[j]]
		}
		return joined[keys[i]] && !joined[keys[j]]
	})
	// '함께 넣기' 짝은 둘 다 모둠장이 되면 같은 모둠에 있을 수 없으므로 한 명만 추천한다.
	size := len(x.request.GroupNames)
	chosen := []string{}
	for _, key := range keys {
		if len(chosen) >= size {
			break
		}
		if x.togetherConflict(append(chosen, key)) == "" {
			chosen = append(chosen, key)
		}
	}
	return chosen
}

// togetherConflict는 모둠장 후보 중 '함께 넣기' 짝이 둘 다 들어 있으면 그 두 학생 이름을 돌려줍니다.
func (x *session) togetherConflict(leaders []string) string {
	in := map[string]bool{}
	for _, key := range leaders {
		in[key] = true
	}
	for _, pair := range x.together {
		if in[pair.A] && in[pair.B] && x.byKey[pair.A] != nil && x.byKey[pair.B] != nil {
			return fmt.Sprintf("%s번 %s·%s번 %s", x.byKey[pair.A].Number, x.byKey[pair.A].Name, x.byKey[pair.B].Number, x.byKey[pair.B].Name)
		}
	}
	return ""
}

// OpenVote는 모둠장 투표를 시작합니다(모둠장이 있는 방식, 입장 단계에서).
func (s *Server) OpenVote(seconds int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if !x.hasLeaders() {
		return Info{}, errors.New("모둠장 투표가 없는 방식입니다")
	}
	if x.phase != PhaseEntry {
		return Info{}, errors.New("입장 단계에서만 모둠장 투표를 시작할 수 있습니다")
	}
	if seconds >= 30 && seconds <= 900 {
		x.request.VoteSeconds = seconds
	}
	x.phase = PhaseVote
	x.deadline = s.now().Add(time.Duration(x.request.VoteSeconds) * time.Second)
	return s.infoLocked(x)
}

// CloseVote는 투표를 마감하고 교사의 모둠장 확정 단계로 넘어갑니다.
func (s *Server) CloseVote() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.phase != PhaseVote {
		return Info{}, errors.New("모둠장 투표 중이 아닙니다")
	}
	s.closeVoteLocked(x)
	return s.infoLocked(x)
}

func (s *Server) closeVoteLocked(x *session) {
	x.phase = PhaseLeaders
	x.deadline = time.Time{}
	x.suggested = x.suggestLeadersLocked()
}

// ConfirmLeaders는 교사가 모둠마다 모둠장을 확정합니다. 블라인드 지명이면 포트 나누기(무작위 초안)로,
// 모둠장+지망이면 나머지 학생의 지망 제출로 넘어갑니다.
func (s *Server) ConfirmLeaders(keys []string) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhaseLeaders {
		return Info{}, errors.New("모둠장 확정 단계가 아닙니다")
	}
	if len(keys) != len(x.request.GroupNames) {
		return Info{}, fmt.Errorf("모둠마다 한 명씩 모둠장 %d명을 골라 주세요", len(x.request.GroupNames))
	}
	seen := map[string]bool{}
	for _, key := range keys {
		if x.byKey[key] == nil {
			return Info{}, errors.New("명단에 없는 학생이 모둠장으로 골라졌습니다")
		}
		if seen[key] {
			return Info{}, errors.New("한 학생을 두 모둠의 모둠장으로 고를 수 없습니다")
		}
		seen[key] = true
	}
	if names := x.togetherConflict(keys); names != "" {
		return Info{}, fmt.Errorf("%s 학생은 '함께 넣기' 조건이 있어 둘 다 모둠장이 될 수 없습니다(모둠장은 서로 다른 모둠). 한 명을 바꾸거나 편성 조건을 고쳐 주세요", names)
	}
	x.leaders = append([]string{}, keys...)
	if x.request.Mode == ModeDraft {
		rest := []string{}
		for _, p := range x.participants {
			if !seen[p.Key] {
				rest = append(rest, p.Key)
			}
		}
		x.pots = chunk(shuffled(rest), len(keys))
		x.phase = PhasePots
		return s.infoLocked(x)
	}
	x.phase = PhaseSubmit
	x.deadline = s.now().Add(time.Duration(x.request.SubmitSeconds) * time.Second)
	return s.infoLocked(x)
}

func chunk(list []string, size int) [][]string {
	result := [][]string{}
	for start := 0; start < len(list); start += size {
		end := start + size
		if end > len(list) {
			end = len(list)
		}
		result = append(result, append([]string{}, list[start:end]...))
	}
	return result
}

// SetPots는 교사가 나눈 포트를 저장합니다. 모둠장이 아닌 학생이 모두 한 번씩 들어가야 하고, 포트 하나에는
// 모둠 수까지만 넣을 수 있습니다(같은 포트 학생은 한 모둠에 한 명씩).
func (s *Server) SetPots(pots [][]string) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhasePots {
		return Info{}, errors.New("포트 나누기 단계가 아닙니다")
	}
	size := len(x.request.GroupNames)
	leader := map[string]bool{}
	for _, key := range x.leaders {
		leader[key] = true
	}
	seen := map[string]bool{}
	clean := [][]string{}
	for index, pot := range pots {
		if len(pot) == 0 {
			continue
		}
		if len(pot) > size {
			return Info{}, fmt.Errorf("포트 %d에 %d명이 있습니다. 포트 하나에는 모둠 수(%d명)까지만 넣을 수 있습니다", index+1, len(pot), size)
		}
		for _, key := range pot {
			if x.byKey[key] == nil || leader[key] {
				return Info{}, errors.New("포트에는 모둠장이 아닌 명단 학생만 넣을 수 있습니다")
			}
			if seen[key] {
				return Info{}, fmt.Errorf("%s 학생이 두 포트에 들어 있습니다", x.byKey[key].Name)
			}
			seen[key] = true
		}
		clean = append(clean, append([]string{}, pot...))
	}
	for _, p := range x.participants {
		if !leader[p.Key] && !seen[p.Key] {
			return Info{}, fmt.Errorf("%s 학생이 어느 포트에도 없습니다", p.Name)
		}
	}
	x.pots = clean
	return s.infoLocked(x)
}

// StartDraft는 뱀 순서 블라인드 지명을 시작합니다. 첫 라운드 순서는 무작위입니다.
func (s *Server) StartDraft() (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	if x.phase != PhasePots || len(x.pots) == 0 {
		return Info{}, errors.New("포트를 나눈 뒤에 지명을 시작할 수 있습니다")
	}
	base := shuffledIndexes(len(x.request.GroupNames))
	x.draftBase = base
	x.draftMembers = make([][]string, len(x.request.GroupNames))
	for group, leader := range x.leaders {
		x.draftMembers[group] = []string{leader}
	}
	x.remainingPots = make([][]string, len(x.pots))
	for i, pot := range x.pots {
		x.remainingPots[i] = append([]string{}, pot...)
	}
	x.draftRound, x.draftTurn = 0, 0
	x.picks = []Pick{}
	x.phase = PhaseDraft
	x.turnDeadline = s.now().Add(time.Duration(x.request.TurnSeconds) * time.Second)
	return s.infoLocked(x)
}

// currentTurnGroupLocked는 지금 차례인 모둠(없으면 -1)입니다.
func (x *session) currentTurnGroupLocked() int {
	if x.phase != PhaseDraft || x.draftRound >= len(x.remainingPots) {
		return -1
	}
	order := SnakeOrder(x.draftBase, x.draftRound)
	if x.draftTurn >= len(order) {
		return -1
	}
	return order[x.draftTurn]
}

// pickLocked는 지금 차례 모둠이 카드 한 장을 뒤집습니다(card는 화면에 보인 카드 번호, 학생과 무관).
func (s *Server) pickLocked(x *session, card int, auto bool) (Pick, error) {
	group := x.currentTurnGroupLocked()
	if group < 0 {
		return Pick{}, errors.New("지금은 카드를 고를 차례가 아닙니다")
	}
	pot := x.remainingPots[x.draftRound]
	if card < 1 || card > len(pot) {
		card = randomIntn(len(pot)) + 1
	}
	order := SnakeOrder(x.draftBase, x.draftRound)
	later := append([]int{}, order[x.draftTurn+1:]...)
	key := PickFromPot(PickInput{Pot: pot, Group: group, Members: x.draftMembers, Separate: x.separate, Together: x.together, Later: later})
	for i, item := range pot {
		if item == key {
			x.remainingPots[x.draftRound] = append(pot[:i:i], pot[i+1:]...)
			break
		}
	}
	x.draftMembers[group] = append(x.draftMembers[group], key)
	pick := Pick{Round: x.draftRound, Group: group, Key: key, Card: card, Auto: auto}
	x.picks = append(x.picks, pick)
	// 다음 차례: 포트가 비면 다음 라운드(뱀 순서), 모든 포트가 끝나면 배정 완료
	x.draftTurn++
	if len(x.remainingPots[x.draftRound]) == 0 || x.draftTurn >= len(x.draftBase) {
		x.draftRound++
		x.draftTurn = 0
	}
	if x.draftRound >= len(x.remainingPots) {
		x.phase = PhaseAssigned
		x.turnDeadline = time.Time{}
		x.assigned = map[string]int{}
		for g, list := range x.draftMembers {
			for _, member := range list {
				x.assigned[member] = g
			}
		}
	} else {
		x.turnDeadline = s.now().Add(time.Duration(x.request.TurnSeconds) * time.Second)
	}
	return pick, nil
}

// DraftPick은 전자칠판(교사 PC)에서 모둠장이 카드를 누른 경우입니다. card가 0이면 무작위 카드.
func (s *Server) DraftPick(card int) (Info, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x, err := s.active()
	if err != nil {
		return Info{}, err
	}
	s.tickLocked(x)
	if x.paused {
		return Info{}, errors.New("회차가 일시정지되어 있습니다")
	}
	if _, err := s.pickLocked(x, card, card == 0); err != nil {
		return Info{}, err
	}
	return s.infoLocked(x)
}

// ---- 학생 휴대폰 API ----

func (s *Server) voteAPI(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var q struct {
			Candidates []int `json:"candidates"`
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
		if x.phase != PhaseVote {
			http.Error(w, "지금은 투표할 수 없습니다", http.StatusForbidden)
			return
		}
		if len(q.Candidates) < 1 || len(q.Candidates) > voteLimit {
			http.Error(w, fmt.Sprintf("1~%d명을 골라 주세요", voteLimit), http.StatusBadRequest)
			return
		}
		seen := map[int]bool{}
		keys := []string{}
		for _, index := range q.Candidates {
			if index < 0 || index >= len(x.participants) || seen[index] {
				http.Error(w, "같은 친구를 두 번 고를 수 없습니다", http.StatusBadRequest)
				return
			}
			seen[index] = true
			keys = append(keys, x.participants[index].Key)
		}
		x.votes[p.Key] = keys
		writeJSON(w, map[string]any{"ok": true})
	}
}

func (s *Server) pickAPI(x *session) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var q struct {
			Card int `json:"card"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024)).Decode(&q) != nil {
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
		group := x.currentTurnGroupLocked()
		if group < 0 || x.leaders[group] != p.Key {
			http.Error(w, "지금은 내 차례가 아닙니다", http.StatusForbidden)
			return
		}
		pick, err := s.pickLocked(x, q.Card, false)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		writeJSON(w, map[string]any{"ok": true, "nickname": x.byKey[pick.Key].nickname})
	}
}
