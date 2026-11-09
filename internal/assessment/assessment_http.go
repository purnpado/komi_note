package assessment

import (
	"TeacherNote/internal/system"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

// 학생 휴대폰·전자칠판이 부르는 수행평가 QR 회차 응답(화면·로그인·상태·확인 완료·이의)입니다.

func (s *AssessmentServer) studentIDFromRequest(r *http.Request, session *assessmentSession) string {
	cookie, err := r.Cookie("kkomi-assessment-session")
	if err != nil {
		return ""
	}
	for studentID, token := range session.activeByUser {
		if token == cookie.Value {
			return studentID
		}
	}
	return ""
}

func (s *AssessmentServer) studentPage(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 준비하지 못했습니다", http.StatusServiceUnavailable)
			return
		}
		domain, ok := assessmentDomain(item, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		// 다른 학생의 로그인·확인 완료가 activeByUser를 동시에 바꾸므로 잠금 안에서 조회합니다.
		// 잠금 없이 map을 읽으면 Go 런타임이 프로그램 전체를 강제 종료할 수 있습니다.
		s.mu.Lock()
		authenticated := s.studentIDFromRequest(r, session) != ""
		s.mu.Unlock()
		_ = assessmentStudentTemplate.Execute(w, map[string]any{"Title": assessmentDisplayTitle(item), "DomainName": domain.Name, "Token": session.token, "Authenticated": authenticated, "AnswerOnly": session.mode == "answer"})
	}
}

func (s *AssessmentServer) boardPage(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 준비하지 못했습니다", http.StatusServiceUnavailable)
			return
		}
		domain, ok := assessmentDomain(item, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		address := system.LocalAddress(session.listener.Addr().(*net.TCPAddr).Port)
		_ = assessmentBoardTemplate.Execute(w, map[string]any{"Title": assessmentDisplayTitle(item), "DomainName": domain.Name, "Token": session.token, "StudentURL": "http://" + address + "/a/" + session.shortCode})
	}
}

func (s *AssessmentServer) stateAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		paused, closed := session.paused, session.closed
		studentID := s.studentIDFromRequest(r, session)
		completed := session.completed[studentID]
		s.mu.Unlock()
		if closed {
			system.WriteJSON(w, map[string]any{"closed": true})
			return
		}
		if paused {
			system.WriteJSON(w, map[string]any{"paused": true})
			return
		}
		if studentID == "" {
			system.WriteJSON(w, map[string]any{"authenticated": false})
			return
		}
		if completed {
			system.WriteJSON(w, map[string]any{"authenticated": true, "completed": true})
			return
		}
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		student, score, ok := assessmentStudentScore(item, studentID)
		if !ok {
			http.Error(w, "학생 정보를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		domain, ok := assessmentPublicDomain(item, score, session.domainID)
		if !ok {
			http.Error(w, "평가 영역을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		if session.mode == "answer" {
			system.WriteJSON(w, map[string]any{"authenticated": true, "answerOnly": true, "title": assessmentDisplayTitle(item), "student": map[string]string{"number": student.Number, "name": student.Name}, "objections": assessmentAnsweredObjections(item, studentID, session.domainID)})
			return
		}
		system.WriteJSON(w, map[string]any{"authenticated": true, "title": assessmentDisplayTitle(item), "student": map[string]string{"number": student.Number, "name": student.Name}, "domain": domain, "hasOpenObjection": assessmentHasOpenObjection(item, studentID, session.domainID)})
	}
}

// boardStateAPI는 전자칠판에 학생 성적 없이 접속 현황만 제공합니다.
func (s *AssessmentServer) boardStateAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		closed, paused := session.closed, session.paused
		verified, completed := len(session.verified), len(session.completed)
		s.mu.Unlock()
		system.WriteJSON(w, map[string]any{"closed": closed, "paused": paused, "verifiedCount": verified, "completedCount": completed})
	}
}

func (s *AssessmentServer) qrAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		s.mu.Lock()
		closed := session.closed
		address := system.LocalAddress(session.listener.Addr().(*net.TCPAddr).Port)
		shortCode := session.shortCode
		s.mu.Unlock()
		if closed {
			http.Error(w, "확인 회차가 종료되었습니다", http.StatusGone)
			return
		}
		png, err := qrcode.Encode("http://"+address+"/a/"+shortCode, qrcode.Medium, 420)
		if err != nil {
			http.Error(w, "QR 코드를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}
}

func (s *AssessmentServer) loginAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			Number string `json:"number"`
			Name   string `json:"name"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 2048)).Decode(&request) != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		clientIP := assessmentClientIP(r)
		s.mu.Lock()
		blockedUntil := session.loginAttempts[clientIP].blockedUntil
		s.mu.Unlock()
		if time.Now().Before(blockedUntil) {
			http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
			return
		}
		item, err := s.store.GetAssessment(session.assessmentID)
		if err != nil {
			http.Error(w, "수행평가를 찾지 못했습니다", http.StatusNotFound)
			return
		}
		studentID := ""
		wantNumber, wantName := normalizeAssessmentNumber(request.Number), normalizeAssessmentName(request.Name)
		for _, student := range item.Students {
			if wantNumber != "" && normalizeAssessmentNumber(student.Number) == wantNumber && normalizeAssessmentName(student.Name) == wantName {
				studentID = student.ID
				break
			}
		}
		if studentID == "" {
			s.mu.Lock()
			blocked := recordAssessmentLoginFailureLocked(session, clientIP, time.Now())
			s.mu.Unlock()
			if blocked {
				http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
				return
			}
			http.Error(w, "번호 또는 이름을 확인해 주세요", http.StatusUnauthorized)
			return
		}
		if session.mode == "answer" && len(assessmentAnsweredObjections(item, studentID, session.domainID)) == 0 {
			http.Error(w, "확인할 답변이 없습니다", http.StatusForbidden)
			return
		}
		s.mu.Lock()
		if session.closed || session.paused {
			s.mu.Unlock()
			http.Error(w, "현재 확인 회차에 참여할 수 없습니다", http.StatusLocked)
			return
		}
		for _, other := range s.sessions {
			if other.assessmentID != session.assessmentID || other.closed {
				continue
			}
			if _, active := other.activeByUser[studentID]; active {
				s.mu.Unlock()
				http.Error(w, "이미 다른 기기에서 이 번호·이름으로 확인 중입니다. 본인이 아니라면 선생님께 접속 초기화를 요청하세요", http.StatusConflict)
				return
			}
		}
		if session.completed[studentID] {
			s.mu.Unlock()
			http.Error(w, "이 번호·이름은 이미 확인을 마쳤습니다. 본인이 확인하지 않았다면 선생님께 접속 초기화를 요청하세요", http.StatusConflict)
			return
		}
		token, err := assessmentToken()
		if err != nil {
			s.mu.Unlock()
			http.Error(w, "접속 정보를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		session.activeByUser[studentID] = token
		session.verified[studentID] = true
		delete(session.loginAttempts, clientIP)
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: "학생인증", AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

func (s *AssessmentServer) completeAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		studentID := s.studentIDFromRequest(r, session)
		if studentID == "" {
			s.mu.Unlock()
			http.Error(w, "확인 인증이 필요합니다", http.StatusUnauthorized)
			return
		}
		delete(session.activeByUser, studentID)
		session.completed[studentID] = true
		s.mu.Unlock()
		historyType, detail, eventType := "확인완료", "학생이 영역별 점수를 확인했습니다", "확인완료"
		if session.mode == "answer" {
			historyType, detail, eventType = "답변확인완료", "학생이 이의 답변을 확인했습니다", "답변확인완료"
		}
		if err := s.store.AddAssessmentHistory(session.assessmentID, historyType, studentID, session.domainID, detail); err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: eventType, AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true, "completed": true})
	}
}

func (s *AssessmentServer) objectionAPI(session *assessmentSession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		if session.mode != "score" {
			http.Error(w, "답변 재확인 회차에서는 이의를 제출할 수 없습니다", http.StatusMethodNotAllowed)
			return
		}
		var request struct {
			Content string `json:"content"`
		}
		if json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&request) != nil {
			http.Error(w, "이의 내용을 확인해 주세요", http.StatusBadRequest)
			return
		}
		request.Content = strings.TrimSpace(request.Content)
		if request.Content == "" {
			http.Error(w, "이의 내용을 입력해 주세요", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		studentID := s.studentIDFromRequest(r, session)
		if studentID == "" {
			s.mu.Unlock()
			http.Error(w, "확인 인증이 필요합니다", http.StatusUnauthorized)
			return
		}
		s.mu.Unlock()
		if err := s.store.SubmitAssessmentObjection(session.assessmentID, session.domainID, studentID, request.Content); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		s.mu.Lock()
		delete(session.activeByUser, studentID)
		session.completed[studentID] = true
		s.mu.Unlock()
		http.SetCookie(w, &http.Cookie{Name: "kkomi-assessment-session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode})
		s.events.Publish(AssessmentEvent{Type: "이의제출", AssessmentID: session.assessmentID, DomainID: session.domainID, StudentID: studentID})
		system.WriteJSON(w, map[string]any{"ok": true, "completed": true})
	}
}
