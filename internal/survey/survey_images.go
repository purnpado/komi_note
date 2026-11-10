package survey

import (
	"net/http"
	"strings"
)

// imageAPI는 설문 그림을 보낸다. 그 설문 문항이 쓰는 그림만, 그리고
// 학생은 참여 인증 뒤 문항이 열렸을 때, 전자칠판은 결과 공개가 켜졌을 때만 받을 수 있다.
func (s *SurveyServer) imageAPI(session *surveySession) http.HandlerFunc {
	prefix := "/api/" + session.token + "/image/"
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "GET만 사용할 수 있습니다", http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, prefix)
		if !ValidImageID(id) {
			http.NotFound(w, r)
			return
		}
		item, err := s.store.GetSurvey(session.surveyID)
		if err != nil || !usesImage(item.Questions, id) {
			http.NotFound(w, r)
			return
		}
		s.mu.Lock()
		allowed := (session.started && participantFromRequestLocked(r, session) != "") || (session.publicResults && session.closed)
		s.mu.Unlock()
		if !allowed {
			http.Error(w, "아직 볼 수 없습니다", http.StatusForbidden)
			return
		}
		mime, contents, err := s.store.GetSurveyImage(id)
		if err != nil {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=600")
		_, _ = w.Write(contents)
	}
}

func usesImage(questions []SurveyQuestion, id string) bool {
	for _, candidate := range ImageIDs(questions) {
		if candidate == id {
			return true
		}
	}
	return false
}
