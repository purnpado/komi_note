package survey

import (
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// 학생 확인은 다른 교실 QR 기능처럼 번호+이름으로 하고, 먼저 들어온 기기만 쓴다.
const (
	loginMaxFailures = 5
	loginBlock       = 30 * time.Second
	deviceCookie     = "kkomi-survey"
)

type loginAttempt struct {
	failures     int
	blockedUntil time.Time
}

// NormalizeNumber는 "01", "1번", " 1 "을 모두 "1"로 맞춘다.
func NormalizeNumber(value string) string {
	value = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(value), "번"))
	if number, err := strconv.Atoi(value); err == nil && number >= 0 {
		return strconv.Itoa(number)
	}
	return value
}

// NormalizeName은 이름 사이의 띄어쓰기 차이를 무시한다.
func NormalizeName(value string) string { return strings.Join(strings.Fields(value), "") }

// CourseParticipantID는 수업 명렬 학생을 가리키는 설문용 번호다.
func CourseParticipantID(rosterID, number, name string) string {
	return "course|" + rosterID + "|" + NormalizeNumber(number) + "|" + strings.TrimSpace(name)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func findParticipant(participants []Participant, number, name string) (Participant, bool) {
	wantNumber, wantName := NormalizeNumber(number), NormalizeName(name)
	if wantNumber == "" || wantName == "" {
		return Participant{}, false
	}
	for _, participant := range participants {
		if NormalizeNumber(participant.Number) == wantNumber && NormalizeName(participant.Name) == wantName {
			return participant, true
		}
	}
	return Participant{}, false
}

// recordLoginFailureLocked는 실패를 세고 5번째 실패면 30초 동안 막는다.
func recordLoginFailureLocked(session *surveySession, ip string, now time.Time) bool {
	attempt := session.loginAttempts[ip]
	attempt.failures++
	blocked := false
	if attempt.failures >= loginMaxFailures {
		attempt.failures = 0
		attempt.blockedUntil = now.Add(loginBlock)
		blocked = true
	}
	session.loginAttempts[ip] = attempt
	return blocked
}

// participantFromRequestLocked는 기기 쿠키로 이 회차에 들어온 참여자를 찾는다.
func participantFromRequestLocked(r *http.Request, session *surveySession) string {
	cookie, err := r.Cookie(deviceCookie)
	if err != nil || cookie.Value == "" {
		return ""
	}
	for participantID, token := range session.activeByUser {
		if token == cookie.Value {
			return participantID
		}
	}
	return ""
}
