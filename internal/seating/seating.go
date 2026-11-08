package seating

import (
	"strings"

	"TeacherNote/internal/students"
)

// Store는 자리배정 서버가 필요한 최소 저장소 인터페이스입니다.
type Store interface {
	GetSeatingPlan(id string) (SeatingPlan, error)
	ListSeatingPlans() ([]SeatingPlan, error)
	SaveSeatingPlan(plan SeatingPlan) (SeatingPlan, error)
	ListStudents() ([]students.Student, error)
}

// SeatingSeat는 자리 배치도 안의 한 좌석과 배정 학생을 나타냅니다.
type SeatingSeat struct {
	ID        string `json:"id"`
	Row       int    `json:"row"`
	Column    int    `json:"column"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Label     string `json:"label"`
	StudentID string `json:"studentId"`
}

// SeatingPlan은 수동 자리뽑기와 QR 참여형 희망 경쟁의 설정·결과를 암호화 보관합니다.
type SeatingPlan struct {
	ID                     string        `json:"id"`
	Title                  string        `json:"title"`
	CreatedAt              string        `json:"createdAt"`
	Rows                   int           `json:"rows"`
	Columns                int           `json:"columns"`
	LayoutMode             string        `json:"layoutMode"`
	DeskPosition           string        `json:"deskPosition"`
	PlacementMode          string        `json:"placementMode"`
	DrawMethod             string        `json:"drawMethod"`
	CompetitionMethod      string        `json:"competitionMethod"`
	PreventPreviousSeat    bool          `json:"preventPreviousSeat"`
	PreventPreviousPartner bool          `json:"preventPreviousPartner"`
	FixedStudentIDs        []string      `json:"fixedStudentIds"`
	ParticipationMode      string        `json:"participationMode"`
	SessionState           string        `json:"sessionState"`
	CurrentRound           int           `json:"currentRound"`
	Seats                  []SeatingSeat `json:"seats"`
}

// LadderResult는 한 좌석 경쟁에서만 사용하는 사다리타기 공개 결과입니다.
type LadderResult struct {
	LaneCount      int
	WinningEnd     int
	WinnerID       string
	StartByStudent map[string]int
	EndByStudent   map[string]int
}

// NormaliseSeatingPlan은 자리 배치 설정의 기본값을 보정하고 안전 범위를 유지합니다.
func NormaliseSeatingPlan(plan SeatingPlan) SeatingPlan {
	plan.Title = strings.TrimSpace(plan.Title)
	if plan.Title == "" {
		plan.Title = "자리 배치"
	}
	if plan.Rows < 1 {
		plan.Rows = 4
	}
	if plan.Rows > 40 {
		plan.Rows = 40
	}
	if plan.Columns < 1 {
		plan.Columns = 6
	}
	if plan.Columns > 40 {
		plan.Columns = 40
	}
	if plan.LayoutMode != "사용자 지정" {
		plan.LayoutMode = "격자형"
	}
	for index := range plan.Seats {
		seat := &plan.Seats[index]
		if seat.X < 0 || seat.X > 1000 {
			seat.X = 0
		}
		if seat.Y < 0 || seat.Y > 1000 {
			seat.Y = 0
		}
		if plan.LayoutMode == "격자형" {
			seat.X = (seat.Column - 1) * 100
			seat.Y = (seat.Row - 1) * 100
		}
	}
	if strings.TrimSpace(plan.DeskPosition) == "" {
		plan.DeskPosition = "앞쪽 중앙"
	}
	if strings.TrimSpace(plan.PlacementMode) == "" {
		plan.PlacementMode = "행 기준"
	}
	if strings.TrimSpace(plan.DrawMethod) == "" {
		plan.DrawMethod = "랜덤 룰렛 배정"
	}
	if plan.DrawMethod != "랜덤 룰렛 배정" && plan.DrawMethod != "랜덤 사다리 배정" && plan.DrawMethod != "희망 경쟁배정" {
		plan.DrawMethod = "랜덤 룰렛 배정"
	}
	if plan.CompetitionMethod != "가위바위보" {
		plan.CompetitionMethod = "가위바위보"
	}
	if strings.TrimSpace(plan.ParticipationMode) == "" {
		plan.ParticipationMode = "교사 직접 배치"
	}
	if strings.TrimSpace(plan.SessionState) == "" {
		plan.SessionState = "설정 중"
	}
	if plan.CurrentRound < 1 {
		plan.CurrentRound = 1
	}
	if plan.CurrentRound > 99 {
		plan.CurrentRound = 99
	}
	seen := map[string]bool{}
	fixed := make([]string, 0, len(plan.FixedStudentIDs))
	for _, id := range plan.FixedStudentIDs {
		id = strings.TrimSpace(id)
		if id != "" && !seen[id] {
			fixed = append(fixed, id)
			seen[id] = true
		}
	}
	plan.FixedStudentIDs = fixed
	return plan
}

