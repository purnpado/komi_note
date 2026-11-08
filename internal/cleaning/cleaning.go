package cleaning

import (
	"strings"
)

// CleaningZone은 교사가 관리하는 청소 담당 구역입니다.
type CleaningZone struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	RequiredCount int    `json:"requiredCount"`
	Day           string `json:"day"`
	Note          string `json:"note"`
}

// CleaningAssignment은 한 학생의 청소구역 배정입니다.
type CleaningAssignment struct {
	StudentID string `json:"studentId"`
	ZoneID    string `json:"zoneId"`
	Note      string `json:"note"`
}

// CleaningPlan은 기간별 청소구역 편성표와 교사용 이력을 암호화 보관합니다.
type CleaningPlan struct {
	ID          string               `json:"id"`
	Title       string               `json:"title"`
	PeriodType  string               `json:"periodType"`
	StartDate   string               `json:"startDate"`
	EndDate     string               `json:"endDate"`
	CreatedAt   string               `json:"createdAt"`
	Zones       []CleaningZone       `json:"zones"`
	Assignments []CleaningAssignment `json:"assignments"`
}

// NormaliseCleaningPlan은 청소구역과 배정 항목의 입력값을 정리하고 유효성을 검증합니다.
func NormaliseCleaningPlan(plan CleaningPlan) CleaningPlan {
	plan.Title = strings.TrimSpace(plan.Title)
	if plan.Title == "" {
		plan.Title = "청소구역 편성표"
	}
	if plan.PeriodType != "격주" && plan.PeriodType != "월간" && plan.PeriodType != "직접 지정" {
		plan.PeriodType = "주간"
	}
	zones := make([]CleaningZone, 0, len(plan.Zones))
	seenZones := map[string]bool{}
	for _, zone := range plan.Zones {
		zone.ID = strings.TrimSpace(zone.ID)
		zone.Name = strings.TrimSpace(zone.Name)
		if zone.ID == "" || zone.Name == "" || seenZones[zone.ID] {
			continue
		}
		if zone.RequiredCount < 1 {
			zone.RequiredCount = 1
		}
		if zone.RequiredCount > 99 {
			zone.RequiredCount = 99
		}
		zone.Day = strings.TrimSpace(zone.Day)
		zone.Note = strings.TrimSpace(zone.Note)
		zones = append(zones, zone)
		seenZones[zone.ID] = true
	}
	plan.Zones = zones
	assignments := make([]CleaningAssignment, 0, len(plan.Assignments))
	for _, assignment := range plan.Assignments {
		assignment.StudentID = strings.TrimSpace(assignment.StudentID)
		assignment.ZoneID = strings.TrimSpace(assignment.ZoneID)
		assignment.Note = strings.TrimSpace(assignment.Note)
		if assignment.StudentID == "" || !seenZones[assignment.ZoneID] {
			continue
		}
		assignments = append(assignments, assignment)
	}
	plan.Assignments = assignments
	return plan
}

