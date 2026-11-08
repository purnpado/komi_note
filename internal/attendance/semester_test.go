package attendance

import (
	"strings"
	"testing"
)

func TestValidateAttendanceDateSemesterRules(t *testing.T) {
	onlyFirst := [][2]string{{"2026-03-02", "2026-07-20"}, {"", ""}}
	both := [][2]string{{"2026-03-02", "2026-07-20"}, {"2026-08-17", "2027-01-08"}}
	cases := []struct {
		name    string
		date    string
		periods [][2]string
		wantErr string
	}{
		{"학기 미입력이면 평일 허용", "2026-11-06", [][2]string{{"", ""}, {"", ""}}, ""},
		{"2학기 미입력이면 1학기 뒤 날짜 허용", "2026-11-06", onlyFirst, ""},
		{"1학기 안", "2026-05-04", onlyFirst, ""},
		{"1학기 시작 전", "2026-02-27", onlyFirst, "1학기 시작일(3월 2일) 전"},
		{"방학 기간", "2026-08-03", both, "방학(7월 21일~8월 16일)"},
		{"2학기 안", "2026-11-06", both, ""},
		{"2학기 종료 뒤", "2027-01-11", both, "2학기 종료일(1월 8일) 뒤"},
		{"주말", "2026-11-08", both, "주말"},
	}
	for _, tc := range cases {
		_, err := ValidateAttendanceDate(tc.date, tc.periods)
		if tc.wantErr == "" && err != nil {
			t.Errorf("%s: 허용되어야 하는데 %v", tc.name, err)
		}
		if tc.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tc.wantErr)) {
			t.Errorf("%s: %q 오류가 필요한데 %v", tc.name, tc.wantErr, err)
		}
	}
}
