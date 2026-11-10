package survey

import (
	_ "embed"
	"html/template"
	"net/http"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"

	"TeacherNote/internal/system"
)

//go:embed public/student.html
var studentPageHTML string

//go:embed public/board.html
var boardPageHTML string

var (
	studentPageTemplate = template.Must(template.New("survey-student").Parse(studentPageHTML))
	boardPageTemplate   = template.Must(template.New("survey-board").Parse(boardPageHTML))
)

func (s *SurveyServer) studentPage(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		_ = studentPageTemplate.Execute(w, map[string]any{"Title": item.Title, "Token": session.token})
	}
}

func (s *SurveyServer) boardPage(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		_ = boardPageTemplate.Execute(w, map[string]any{"Title": item.Title, "Token": session.token, "StudentURL": s.studentURL(session)})
	}
}

// publicQuestion은 학생 화면에 보내는 문항 정보다(응답·이름 없음).
func publicQuestions(questions []SurveyQuestion) []map[string]any {
	result := make([]map[string]any, 0, len(questions))
	for _, q := range questions {
		result = append(result, map[string]any{"id": q.ID, "text": q.Text, "type": q.Type, "options": q.Options, "description": q.Description, "optional": q.Optional, "allowOther": q.AllowOther, "maxChoices": q.MaxChoices, "scaleMinLabel": q.ScaleMinLabel, "scaleMaxLabel": q.ScaleMaxLabel, "imageId": q.ImageID, "optionImages": q.OptionImages})
	}
	return result
}

// publicResults는 마감 뒤 교사가 공개를 켰을 때만 보내는 이름 없는 집계다. 글로 쓴 답은 보내지 않는다.
func publicResults(item Survey) []map[string]any {
	result := []map[string]any{}
	for _, q := range item.Questions {
		if !IsChoice(q.Type) {
			result = append(result, map[string]any{"id": q.ID, "text": q.Text, "type": q.Type, "textOnly": true, "imageId": q.ImageID})
			continue
		}
		counts := ChoiceCounts(q, item.Responses)
		options := append([]string{}, q.Options...)
		if q.AllowOther {
			options = append(options, "기타")
		}
		row := map[string]any{"id": q.ID, "text": q.Text, "type": q.Type, "options": options, "counts": counts, "imageId": q.ImageID}
		if len(q.OptionImages) > 0 {
			images := append([]string{}, q.OptionImages...)
			if q.AllowOther {
				images = append(images, "")
			}
			row["optionImages"] = images
		}
		if q.Type == TypeScale {
			sum, n := 0, 0
			for index, option := range q.Options {
				sum += (index + 1) * counts[option]
				n += counts[option]
			}
			if n > 0 {
				row["average"] = float64(sum) / float64(n)
			}
		}
		result = append(result, row)
	}
	return result
}

func (s *SurveyServer) stateAPI(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		expected := item.ExpectedParticipants
		if expected == 0 && item.Audience != "교직원" {
			participants, _ := s.store.SurveyParticipants(session.surveyID)
			expected = len(participants)
		}
		s.mu.Lock()
		started, closed, public, paused, joined := session.started, session.closed, session.publicResults, session.paused, len(session.activeByUser)
		participantID := participantFromRequestLocked(r, session)
		responded := participantID != "" && session.responded[participantID]
		s.mu.Unlock()
		identity := "student"
		if item.Audience == "교직원" {
			identity = "staff-anonymous"
			if item.StaffIdentityMode == "이름 입력" {
				identity = "staff-name"
			}
		}
		state := map[string]any{
			"title": item.Title, "description": item.Description, "identity": identity,
			"started": started, "closed": closed, "paused": paused, "publicResults": public && closed,
			"participants": joined, "expectedParticipants": expected, "responses": len(item.Responses),
			"authenticated": participantID != "", "responded": responded,
		}
		if started && participantID != "" {
			state["questions"] = publicQuestions(item.Questions)
		}
		if public && closed {
			state["results"] = publicResults(item)
		}
		system.WriteJSON(w, state)
	}
}

func (s *SurveyServer) qrAPI(session *surveySession) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		png, err := qrcode.Encode(s.studentURL(session), qrcode.Medium, 320)
		if err != nil {
			http.Error(w, "QR을 생성하지 못했습니다", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		_, _ = w.Write(png)
	}
}

func (s *SurveyServer) loginAPI(session *surveySession) http.HandlerFunc {
	type loginRequest struct {
		Number string `json:"number"`
		Name   string `json:"name"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		var request loginRequest
		if err := system.DecodeJSONBody(r, &request); err != nil {
			http.Error(w, "입력값을 확인해 주세요", http.StatusBadRequest)
			return
		}
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		ip := clientIP(r)
		s.mu.Lock()
		blockedUntil := session.loginAttempts[ip].blockedUntil
		s.mu.Unlock()
		if time.Now().Before(blockedUntil) {
			http.Error(w, "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests)
			return
		}
		participantID, message, status := s.identify(item, session, request.Number, request.Name, ip)
		if participantID == "" {
			http.Error(w, message, status)
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if session.closed || session.paused {
			http.Error(w, "지금은 참여할 수 없습니다. 선생님 안내를 기다려 주세요", http.StatusLocked)
			return
		}
		if _, active := session.activeByUser[participantID]; active {
			http.Error(w, "이미 다른 기기에서 이 번호·이름으로 참여 중입니다. 본인이 아니라면 선생님께 접속 초기화를 요청하세요", http.StatusConflict)
			return
		}
		if session.responded[participantID] || hasResponse(item, participantID) {
			http.Error(w, "이미 응답을 제출했습니다. 본인이 내지 않았다면 선생님께 말씀해 주세요", http.StatusConflict)
			return
		}
		token, err := randomToken(18)
		if err != nil {
			http.Error(w, "접속 정보를 만들지 못했습니다", http.StatusInternalServerError)
			return
		}
		session.activeByUser[participantID] = token
		delete(session.loginAttempts, ip)
		http.SetCookie(w, &http.Cookie{Name: deviceCookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}

// identify는 설문 대상에 맞게 참여자를 확인한다. 실패하면 빈 번호와 안내 문구를 돌려준다.
func (s *SurveyServer) identify(item Survey, session *surveySession, number, name, ip string) (string, string, int) {
	if item.Audience == "교직원" {
		if item.StaffIdentityMode != "이름 입력" {
			token, err := randomToken(12)
			if err != nil {
				return "", "접속 정보를 만들지 못했습니다", http.StatusInternalServerError
			}
			return "staff-anon-" + token, "", 0
		}
		staffName := strings.TrimSpace(name)
		if staffName == "" || len([]rune(staffName)) > 30 {
			return "", "이름을 입력해 주세요", http.StatusBadRequest
		}
		return "staff|" + NormalizeName(staffName) + "|" + staffName, "", 0
	}
	participants, err := s.store.SurveyParticipants(session.surveyID)
	if err != nil {
		return "", "학생 명렬을 확인하지 못했습니다", http.StatusInternalServerError
	}
	if participant, ok := findParticipant(participants, number, name); ok {
		return participant.ID, "", 0
	}
	s.mu.Lock()
	blocked := recordLoginFailureLocked(session, ip, time.Now())
	s.mu.Unlock()
	if blocked {
		return "", "여러 번 틀렸습니다. 30초 뒤 다시 시도해 주세요", http.StatusTooManyRequests
	}
	return "", "번호 또는 이름을 확인해 주세요", http.StatusUnauthorized
}

func hasResponse(item Survey, participantID string) bool {
	for _, response := range item.Responses {
		if response.StudentID == participantID {
			return true
		}
	}
	return false
}

// respondentLabel은 교사 화면에 보일 응답자 이름이다. 익명 학생 설문은 비워 둔다.
func respondentLabel(item Survey, participantID string) string {
	if strings.HasPrefix(participantID, "staff|") {
		parts := strings.SplitN(participantID, "|", 3)
		return parts[len(parts)-1]
	}
	if item.Anonymous || strings.HasPrefix(participantID, "staff-anon-") {
		return ""
	}
	return participantID
}

func (s *SurveyServer) answerAPI(session *surveySession) http.HandlerFunc {
	type answerRequest struct {
		Answers      map[string]string   `json:"answers"`
		MultiAnswers map[string][]string `json:"multiAnswers"`
	}
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		s.mu.Lock()
		participantID := participantFromRequestLocked(r, session)
		open := session.started && !session.closed && !session.paused
		already := session.responded[participantID]
		s.mu.Unlock()
		if participantID == "" {
			http.Error(w, "먼저 참여 확인을 해 주세요", http.StatusUnauthorized)
			return
		}
		if !open {
			http.Error(w, "지금은 응답을 받을 수 없습니다", http.StatusLocked)
			return
		}
		if already {
			http.Error(w, "이미 응답을 제출했습니다", http.StatusConflict)
			return
		}
		var request answerRequest
		if err := system.DecodeJSONBody(r, &request); err != nil {
			http.Error(w, "답변 형식이 올바르지 않습니다", http.StatusBadRequest)
			return
		}
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil {
			http.Error(w, "설문을 찾지 못했습니다", http.StatusNotFound)
			return
		}
		if err := s.store.SubmitSurvey(session.surveyID, participantID, respondentLabel(item, participantID), request.Answers, request.MultiAnswers); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		session.responded[participantID] = true
		s.mu.Unlock()
		if s.OnResponse != nil {
			s.OnResponse(session.surveyID)
		}
		system.WriteJSON(w, map[string]any{"ok": true})
	}
}
