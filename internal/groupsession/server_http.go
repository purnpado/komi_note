package groupsession

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
)

// 학생 휴대폰이 부르는 화면·로그인·상태·지망 제출 응답입니다.

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
			Number string `json:"number"`
			Name   string `json:"name"`
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
		if x.phase != PhaseEntry && x.phase != PhaseSubmit && x.phase != PhaseVote {
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
			if normaliseName(p.Name) == normaliseName(q.Name) && normaliseNumber(p.Number) != "" && normaliseNumber(p.Number) == normaliseNumber(q.Number) {
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
			http.Error(w, "번호 또는 이름을 확인해 주세요", http.StatusUnauthorized)
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
	Leader   string `json:"leader,omitempty"` // 모둠장 공개를 고른 경우에만
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
		state := map[string]any{"phase": x.phase, "kind": x.request.SourceKind, "mode": x.request.Mode, "paused": x.paused, "loginOpen": x.phase == PhaseEntry || x.phase == PhaseSubmit || x.phase == PhaseVote}
		if p == nil {
			writeJSON(w, state)
			return
		}
		groups := make([]studentGroup, len(x.request.GroupNames))
		for i, name := range x.request.GroupNames {
			groups[i] = studentGroup{Name: name, Capacity: x.capacities[i]}
			if x.request.LeaderPublic && i < len(x.leaders) {
				if leader := x.byKey[x.leaders[i]]; leader != nil {
					groups[i].Leader = strings.TrimSpace(leader.Number) + "번 " + strings.TrimSpace(leader.Name)
				}
			}
		}
		state["nickname"] = p.nickname
		state["groups"] = groups
		state["preferenceLimit"] = x.request.PreferenceLimit
		state["preferences"] = append([]int{}, p.prefs...)
		// 모둠장 정보는 본인에게만 알려 준다(다른 학생·전자칠판에는 배정 완료 뒤 실명 공개 때까지 숨김).
		if group := x.leaderGroup(p.Key); group >= 0 {
			state["isLeader"] = true
			state["leaderGroup"] = x.request.GroupNames[group]
		}
		if x.phase == PhaseVote {
			candidates := make([]map[string]any, len(x.participants))
			for i, other := range x.participants {
				candidates[i] = map[string]any{"id": i, "label": strings.TrimSpace(other.Number) + "번 " + strings.TrimSpace(other.Name)}
			}
			mine := []int{}
			for _, key := range x.votes[p.Key] {
				for i, other := range x.participants {
					if other.Key == key {
						mine = append(mine, i)
					}
				}
			}
			state["candidates"] = candidates
			state["myVotes"] = mine
			state["voteLimit"] = voteLimit
		}
		if x.phase == PhaseDraft {
			group := x.currentTurnGroupLocked()
			state["myTurn"] = group >= 0 && x.leaders[group] == p.Key
			state["round"] = x.draftRound + 1
			state["rounds"] = len(x.remainingPots)
			if x.draftRound < len(x.remainingPots) {
				state["cardsLeft"] = len(x.remainingPots[x.draftRound])
			}
			reference := s.now()
			if x.paused {
				reference = x.pausedAt
			}
			state["turnRemaining"] = int(x.turnDeadline.Sub(reference).Seconds() + 0.999)
			if leaderGroup := x.leaderGroup(p.Key); leaderGroup >= 0 {
				mine := []string{}
				for _, key := range x.draftMembers[leaderGroup][1:] {
					label := x.byKey[key].nickname
					if label == "" {
						label = "아직 입장하지 않은 친구"
					}
					mine = append(mine, label)
				}
				state["myPicks"] = mine
			}
		}
		if (x.phase == PhaseSubmit || x.phase == PhaseVote) && !x.deadline.IsZero() {
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
						publicLeader := x.request.LeaderPublic && x.leaderGroup(other.Key) >= 0
						if publicLeader && x.phase != PhaseNamesShown {
							label = strings.TrimSpace(other.Name) + " (모둠장)"
						} else if x.phase == PhaseNamesShown || label == "" {
							if x.phase == PhaseNamesShown {
								label = strings.TrimSpace(other.Name)
							} else {
								label = "아직 입장하지 않은 친구"
							}
						}
						if x.phase == PhaseNamesShown && x.leaderGroup(other.Key) >= 0 {
							label += " (모둠장)"
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
		if x.leaderGroup(p.Key) >= 0 {
			http.Error(w, "모둠장은 지망을 내지 않아요. 친구들이 고르는 동안 기다려 주세요", http.StatusForbidden)
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
