package seating

import (
	"TeacherNote/internal/system"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/skip2/go-qrcode"
)

// 학생 휴대폰 입장(번호+이름 확인·실패 제한·닉네임)과 QR·화면 응답입니다.

func (s *SeatingServer) loginAPI(x *seatingSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", 405)
			return
		}
		var q struct {
			Number string `json:"number"`
			Name   string `json:"name"`
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
		// 학생 확인은 번호+이름으로 한다(사용자 결정 2026-11-08, 생년월일은 쓰지 않음). "01"·"1번"도 1번으로 본다.
		number := normalizeSeatingNumber(q.Number)
		var id string
		for _, st := range students {
			if number != "" && fmt.Sprint(st.Number) == number && normalizeSeatingName(st.Name) == normalizeSeatingName(q.Name) {
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
			http.Error(w, "번호 또는 이름을 확인해 주세요", 401)
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
		// 이미 다른 기기로 들어온 학생이면 막는다. 같은 기기(쿠키 일치)는 다시 들어온 것으로 본다.
		if existing := x.deviceTokens[id]; existing != "" {
			if cookie, cookieErr := r.Cookie("kkomi-seat"); cookieErr != nil || cookie.Value != existing {
				s.mu.Unlock()
				http.Error(w, "이미 다른 기기에서 들어와 있습니다. 본인이 아니라면 선생님께 접속 초기화를 부탁하세요", http.StatusConflict)
				return
			}
		}
		token := x.deviceTokens[id]
		if token == "" {
			tokenBytes, tokenErr := system.RandomBytes(18)
			if tokenErr != nil {
				s.mu.Unlock()
				http.Error(w, "다시 시도해 주세요", http.StatusInternalServerError)
				return
			}
			token = base64.RawURLEncoding.EncodeToString(tokenBytes)
			x.deviceTokens[id] = token
			x.deviceStudents[token] = id
		}
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
		http.SetCookie(w, &http.Cookie{Name: "kkomi-seat", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
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

// normalizeSeatingNumber는 "01"·"1번"·" 1 "을 "1"로 맞춘다.
func normalizeSeatingNumber(value string) string {
	all := strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}
		return -1
	}, value)
	trimmed := strings.TrimLeft(all, "0")
	if trimmed == "" && all != "" {
		return "0"
	}
	return trimmed
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
