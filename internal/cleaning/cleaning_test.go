package cleaning

import "testing"

func TestNormaliseCleaningPlanKeepsManualWarningsPossible(t *testing.T) {
	plan := NormaliseCleaningPlan(CleaningPlan{
		PeriodType: "무작위",
		Zones: []CleaningZone{
			{ID: "floor", Name: " 교실 바닥 ", RequiredCount: 0},
			{ID: "floor", Name: "중복 구역", RequiredCount: 2},
		},
		Assignments: []CleaningAssignment{
			{StudentID: "one", ZoneID: "floor"},
			{StudentID: "one", ZoneID: "floor"},
			{StudentID: "two", ZoneID: "missing"},
		},
	})
	if plan.PeriodType != "주간" {
		t.Fatalf("기본 기간 = %q, 주간을 기대합니다", plan.PeriodType)
	}
	if len(plan.Zones) != 1 || plan.Zones[0].RequiredCount != 1 {
		t.Fatalf("청소구역 정규화 결과가 올바르지 않습니다: %#v", plan.Zones)
	}
	if len(plan.Assignments) != 2 {
		t.Fatalf("수동 배치의 중복 경고용 항목은 보존하고 없는 구역은 제거해야 합니다: %#v", plan.Assignments)
	}
}

