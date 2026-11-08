package assessment

import (
	"strings"

	"TeacherNote/internal/students"
)

// Store는 수행평가 서버가 필요한 최소 저장소 인터페이스입니다.
type Store interface {
	GetAssessment(id string) (Assessment, error)
	AddAssessmentHistory(id, historyType, studentID, domainID, detail string) error
	SubmitAssessmentObjection(id, domainID, studentID, content string) error
	ListStudents() ([]students.Student, error)
}

// Assessment는 수업용 수행평가 전체와 최소 수업 명렬을 함께 보관합니다.
type Assessment struct {
	ID         string                `json:"id"`
	Title      string                `json:"title"`
	Subject    string                `json:"subject"`
	ClassName  string                `json:"className"`
	SchoolYear string                `json:"schoolYear,omitempty"`
	Semester   string                `json:"semester,omitempty"`
	Grade      string                `json:"grade,omitempty"`
	Classroom  string                `json:"classroom,omitempty"`
	Students   []AssessmentStudent   `json:"students"`
	Domains    []AssessmentDomain    `json:"domains"`
	Scores     []AssessmentScore     `json:"scores"`
	Objections []AssessmentObjection `json:"objections"`
	History    []AssessmentHistory   `json:"history"`
	CreatedAt  string                `json:"createdAt"`
	UpdatedAt  string                `json:"updatedAt"`
}

// AssessmentStudent에는 수업에 필요한 최소 식별값만 둡니다.
type AssessmentStudent struct {
	ID     string `json:"id"`
	Number string `json:"number"`
	Name   string `json:"name"`
	Status string `json:"status"`
}

type AssessmentDomain struct {
	ID       string                `json:"id"`
	Name     string                `json:"name"`
	MaxScore float64               `json:"maxScore"`
	Criteria []AssessmentCriterion `json:"criteria"`
}

type AssessmentCriterion struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	MaxScore float64 `json:"maxScore"`
	Note     string  `json:"note"`
}

type AssessmentScore struct {
	StudentID string                  `json:"studentId"`
	Domains   []AssessmentDomainScore `json:"domains"`
	Note      string                  `json:"note"`
	Deduction string                  `json:"deduction"`
	UpdatedAt string                  `json:"updatedAt"`
}

type AssessmentDomainScore struct {
	DomainID      string                     `json:"domainId"`
	ImportedScore *float64                   `json:"importedScore"`
	Criteria      []AssessmentCriterionScore `json:"criteria"`
}

type AssessmentCriterionScore struct {
	CriterionID string   `json:"criterionId"`
	Score       *float64 `json:"score"`
	Reason      string   `json:"reason"`
}

type AssessmentObjection struct {
	ID          string `json:"id"`
	StudentID   string `json:"studentId"`
	DomainID    string `json:"domainId"`
	Content     string `json:"content"`
	Status      string `json:"status"`
	Answer      string `json:"answer"`
	SubmittedAt string `json:"submittedAt"`
	AnsweredAt  string `json:"answeredAt"`
}

type AssessmentHistory struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	StudentID string `json:"studentId"`
	DomainID  string `json:"domainId,omitempty"`
	Detail    string `json:"detail"`
	CreatedAt string `json:"createdAt"`
}

// AssessmentImportPreview는 나이스 파일 저장 전 교사가 확인하는 최소 미리보기입니다.
type AssessmentImportPreview struct {
	FileName        string     `json:"fileName"`
	Subject         string     `json:"subject"`
	ClassName       string     `json:"className"`
	StudentCount    int        `json:"studentCount"`
	Domains         []string   `json:"domains"`
	SampleStudents  []string   `json:"sampleStudents"`
	TargetID        string     `json:"targetId,omitempty"`
	TargetTitle     string     `json:"targetTitle,omitempty"`
	HasTargetScores bool       `json:"hasTargetScores,omitempty"`
	Warnings        []string   `json:"warnings"`
	Assessment      Assessment `json:"-"`
}

// AssessmentSessionInfo는 전자칠판 QR과 교사용 진행 현황에만 쓰는 공개 최소 정보입니다.
type AssessmentSessionInfo struct {
	AssessmentID   string `json:"assessmentId"`
	DomainID       string `json:"domainId"`
	DomainName     string `json:"domainName"`
	Title          string `json:"title"`
	Running        bool   `json:"running"`
	Paused         bool   `json:"paused,omitempty"`
	Closed         bool   `json:"closed,omitempty"`
	StudentURL     string `json:"studentUrl"`
	BoardURL       string `json:"boardUrl"`
	ShortCode      string `json:"shortCode"`
	QRCodeDataURL  string `json:"qrCodeDataUrl"`
	VerifiedCount  int    `json:"verifiedCount"`
	CompletedCount int    `json:"completedCount"`
	ObjectionCount int    `json:"objectionCount"`
	TotalStudents  int    `json:"totalStudents,omitempty"`
	Notice         string `json:"notice"`
	Mode           string `json:"mode"`
	AnswerOnly     bool   `json:"answerOnly,omitempty"`
}

// isLegacyAssessmentImportedCriterion은 이전 버전에서 나이스 원본 총점을
// 임시 세부 기준으로 저장하던 형식을 식별합니다. 이는 실제 세부 기준이 아니므로
// 화면 공개와 합계 계산에서 제외하고 ImportedScore로만 보관합니다.
func isLegacyAssessmentImportedCriterion(domain AssessmentDomain, criterion AssessmentCriterion) bool {
	return strings.TrimSpace(criterion.Name) == "영역 점수" && criterion.MaxScore == domain.MaxScore
}

func assessmentImportedScore(domain AssessmentDomain, score AssessmentDomainScore) *float64 {
	if score.ImportedScore != nil {
		return score.ImportedScore
	}
	for _, criterion := range domain.Criteria {
		if !isLegacyAssessmentImportedCriterion(domain, criterion) {
			continue
		}
		for _, value := range score.Criteria {
			if value.CriterionID == criterion.ID {
				return value.Score
			}
		}
	}
	return nil
}

