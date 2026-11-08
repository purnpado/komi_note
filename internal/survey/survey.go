package survey

import "TeacherNote/internal/students"

// Store는 설문 웹서버가 필요한 최소 저장소 인터페이스입니다.
type Store interface {
	GetSurvey(id string) (Survey, error)
	SetSurveyStatus(id, status string) error
	SubmitSurvey(id, studentID, respondentName string, answers map[string]string, multiAnswers map[string][]string) error
	ListStudents() ([]students.Student, error)
}

// Survey는 학급 안에서만 운영하는 설문지와 암호화 응답 기록입니다.
type Survey struct {
	ID                   string           `json:"id"`
	Title                string           `json:"title"`
	Audience             string           `json:"audience"`
	Scope                string           `json:"scope"`
	StaffIdentityMode    string           `json:"staffIdentityMode"`
	Anonymous            bool             `json:"anonymous"`
	Status               string           `json:"status"`
	ExpectedParticipants int              `json:"expectedParticipants"`
	Questions            []SurveyQuestion `json:"questions"`
	Responses            []SurveyResponse `json:"responses"`
	CreatedAt            string           `json:"createdAt"`
	UpdatedAt            string           `json:"updatedAt"`
}

// SurveyQuestion은 설문 문항 정의입니다.
type SurveyQuestion struct {
	ID      string   `json:"id"`
	Text    string   `json:"text"`
	Type    string   `json:"type"`
	Options []string `json:"options"`
}

// SurveyResponse는 교사용 암호화 보관함에서만 학생별 응답을 확인할 수 있도록 보관합니다.
// 익명 설문이라도 전자칠판과 학생 화면에는 학생 이름을 절대 공개하지 않습니다.
type SurveyResponse struct {
	StudentID      string              `json:"studentId"`
	RespondentName string              `json:"respondentName"`
	Answers        map[string]string   `json:"answers"`
	MultiAnswers   map[string][]string `json:"multiAnswers"`
	SubmittedAt    string              `json:"submittedAt"`
}

// SurveySessionInfo는 실시간 설문 참여 세션 상태입니다.
type SurveySessionInfo struct {
	SurveyID             string `json:"surveyId"`
	Title                string `json:"title"`
	Running              bool   `json:"running"`
	Started              bool   `json:"started"`
	Closed               bool   `json:"closed"`
	PublicResults        bool   `json:"publicResults"`
	StudentURL           string `json:"studentUrl"`
	ShortCode            string `json:"shortCode"`
	BoardURL             string `json:"boardUrl"`
	QRCodeDataURL        string `json:"qrCodeDataUrl"`
	ParticipantCnt       int    `json:"participantCnt"`
	ExpectedParticipants int    `json:"expectedParticipants"`
	ResponseCnt          int    `json:"responseCnt"`
	Notice               string `json:"notice"`
}

