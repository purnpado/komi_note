package seating

import (
	"encoding/json"
	"testing"
)

func TestSeatingPlanNormalisation(t *testing.T) {
	plan := SeatingPlan{
		Rows:    0,
		Columns: 50,
		Seats: []SeatingSeat{
			{Row: 1, Column: 1},
			{Row: 2, Column: 2},
		},
	}

	norm := NormaliseSeatingPlan(plan)

	if norm.Rows != 4 {
		t.Fatalf("기본 행 수 보정 실패: %d", norm.Rows)
	}
	if norm.Columns != 40 {
		t.Fatalf("최대 열 수 제한 실패: %d", norm.Columns)
	}
	if norm.Seats[1].X != 100 || norm.Seats[1].Y != 100 {
		t.Fatalf("격자형 좌표 자동 계산 실패: %+v", norm.Seats[1])
	}

	data, err := json.Marshal(norm)
	if err != nil {
		t.Fatalf("SeatingPlan JSON 마샬링 실패: %v", err)
	}
	var parsed SeatingPlan
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("SeatingPlan JSON 언마샬링 실패: %v", err)
	}
	if parsed.Title != "자리 배치" {
		t.Fatalf("기본 제목 불일치: %s", parsed.Title)
	}
}

