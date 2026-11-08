package assessment

import (
	"errors"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// 학생 번호·이름 확인과 교사의 접속 초기화를 모은다.
// 번호·이름이 한 기기에서 확인을 시작하면 다른 기기는 같은 번호·이름으로 들어올 수 없고,
// 잘못 들어온 경우 교사가 그 학생만 초기화해 다시 들어올 수 있게 한다.

type assessmentLoginAttempt struct {
	failures     int
	blockedUntil time.Time
}

const (
	assessmentLoginMaxFailures = 5
	assessmentLoginBlock       = 30 * time.Second
)

// normalizeAssessmentNumber는 "01", "1번", " 1 "을 모두 "1"로 맞춘다.
func normalizeAssessmentNumber(value string) string {
	value = strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(value), "번"))
	if number, err := strconv.Atoi(value); err == nil && number >= 0 {
		return strconv.Itoa(number)
	}
	return value
}

// NormalizeStudentNumber는 가져오기 등 다른 패키지에서 번호를 같은 기준으로 비교할 때 쓴다.
func NormalizeStudentNumber(value string) string { return normalizeAssessmentNumber(value) }

// normalizeAssessmentName은 이름 사이의 띄어쓰기 차이를 무시한다.
func normalizeAssessmentName(value string) string {
	return strings.Join(strings.Fields(value), "")
}

func assessmentClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func recordAssessmentLoginFailureLocked(session *assessmentSession, clientIP string, now time.Time) bool {
	attempt := session.loginAttempts[clientIP]
	attempt.failures++
	blocked := false
	if attempt.failures >= assessmentLoginMaxFailures {
		attempt.failures = 0
		attempt.blockedUntil = now.Add(assessmentLoginBlock)
		blocked = true
	}
	session.loginAttempts[clientIP] = attempt
	return blocked
}

func assessmentParticipants(item Assessment, session *assessmentSession) []AssessmentParticipant {
	result := []AssessmentParticipant{}
	for _, student := range item.Students {
		status := ""
		if session.completed[student.ID] {
			status = "확인 완료"
		} else if _, active := session.activeByUser[student.ID]; active {
			status = "확인 중"
		}
		if status != "" {
			result = append(result, AssessmentParticipant{StudentID: student.ID, Number: student.Number, Name: student.Name, Status: status})
		}
	}
	sort.SliceStable(result, func(i, j int) bool {
		left, leftErr := strconv.Atoi(result[i].Number)
		right, rightErr := strconv.Atoi(result[j].Number)
		if leftErr == nil && rightErr == nil {
			return left < right
		}
		return result[i].Number < result[j].Number
	})
	return result
}

// ResetStudentAccess는 한 학생의 확인 접속을 초기화해 본인이 다시 들어올 수 있게 한다.
// 같은 평가의 다른 열린 회차에 남은 접속도 함께 지운다. 확인·이의 이력은 그대로 두고 초기화 이력을 더한다.
func (s *AssessmentServer) ResetStudentAccess(assessmentID, domainID, mode, studentID string) (AssessmentSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if mode != "answer" {
		mode = "score"
	}
	session := s.sessions[assessmentSessionKey(assessmentID, domainID, mode)]
	if session == nil || session.closed {
		return AssessmentSessionInfo{}, errors.New("열린 확인 QR 회차가 없습니다")
	}
	item, err := s.store.GetAssessment(assessmentID)
	if err != nil {
		return AssessmentSessionInfo{}, err
	}
	known := false
	for _, student := range item.Students {
		if student.ID == studentID {
			known = true
			break
		}
	}
	if !known {
		return AssessmentSessionInfo{}, errors.New("수업 명렬에서 학생을 찾지 못했습니다")
	}
	for _, other := range s.sessions {
		if other.assessmentID == assessmentID && !other.closed {
			delete(other.activeByUser, studentID)
		}
	}
	delete(session.completed, studentID)
	delete(session.verified, studentID)
	_ = s.store.AddAssessmentHistory(assessmentID, "접속초기화", studentID, domainID, "교사가 학생 확인 접속을 초기화했습니다")
	s.events.Publish(AssessmentEvent{Type: "접속초기화", AssessmentID: assessmentID, DomainID: domainID, StudentID: studentID})
	return s.infoLocked(session)
}
