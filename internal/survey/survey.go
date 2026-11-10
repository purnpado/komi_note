package survey

// Store는 설문 웹서버가 필요한 최소 저장소 인터페이스입니다.
type Store interface {
	GetSurvey(id string) (Survey, error)
	SetSurveyStatus(id, status string) error
	SubmitSurvey(id, studentID, respondentName string, answers map[string]string, multiAnswers map[string][]string) error
	// SurveyParticipants는 학생 설문의 참여 대상(담임 반 또는 고른 수업 반)을 돌려준다.
	SurveyParticipants(id string) ([]Participant, error)
	// GetSurveyImage는 문항 그림·보기 그림의 종류(MIME)와 내용을 돌려준다.
	GetSurveyImage(id string) (string, []byte, error)
}

// Participant는 설문 참여 대상 학생 한 명이다. ID는 담임 반이면 학생 ID, 수업 반이면 "course|명렬ID|번호|이름"이다.
type Participant struct {
	ID     string `json:"id"`
	Number string `json:"number"`
	Name   string `json:"name"`
}

// ParticipantStatus는 교사 화면에만 보이는 회차 참여 현황이다(전자칠판·학생 화면에는 보내지 않음).
type ParticipantStatus struct {
	ID        string `json:"id"`
	Number    string `json:"number"`
	Name      string `json:"name"`
	Joined    bool   `json:"joined"`
	Responded bool   `json:"responded"`
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
	Description          string           `json:"description,omitempty"`
	TargetRosterID       string           `json:"targetRosterId,omitempty"`
	Questions            []SurveyQuestion `json:"questions"`
	Responses            []SurveyResponse `json:"responses"`
	CreatedAt            string           `json:"createdAt"`
	UpdatedAt            string           `json:"updatedAt"`
}

// SurveyQuestion은 설문 문항 정의입니다.
// 예전 설문은 새 칸이 비어 있어도 그대로 동작한다(Optional이 false면 꼭 답해야 하는 문항).
type SurveyQuestion struct {
	ID            string   `json:"id"`
	Text          string   `json:"text"`
	Type          string   `json:"type"`
	Options       []string `json:"options"`
	Description   string   `json:"description,omitempty"`
	Optional      bool     `json:"optional,omitempty"`
	AllowOther    bool     `json:"allowOther,omitempty"`
	MaxChoices    int      `json:"maxChoices,omitempty"`
	ScaleSteps    int      `json:"scaleSteps,omitempty"`
	ScaleMinLabel string   `json:"scaleMinLabel,omitempty"`
	ScaleMaxLabel string   `json:"scaleMaxLabel,omitempty"`
	// ImageID는 문항 그림(교사 보관함의 암호화 파일 번호), OptionImages는 보기와 같은 순서의 보기 그림(없으면 "").
	ImageID      string   `json:"imageId,omitempty"`
	OptionImages []string `json:"optionImages,omitempty"`
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
	// Participants는 교사 화면의 접속 초기화용 현황이다(학생 설문만).
	Participants []ParticipantStatus `json:"participants,omitempty"`
}
