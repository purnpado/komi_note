package assessment

import "testing"

func TestParseAssessmentFilename(t *testing.T) {
	cases := []struct{ name, year, semester, grade, subject, classroom string }{
		{"수행평가 파일일괄등록 - 2026학년도 2학기 주간 1학년 기술·가정_전체_1강의실.xlsx", "2026", "2", "1", "기술·가정", "1강의실"},
		{"수행평가.xlsx", "", "", "", "", ""},
		{"수행평가 2026학년도 2학기 주간 4학년 기술_전체_1강의실.xlsx", "", "", "", "", ""},
	}
	for _, tc := range cases {
		got := ParseAssessmentFilename(tc.name)
		if got.SchoolYear != tc.year || got.Semester != tc.semester || got.Grade != tc.grade || got.Subject != tc.subject || got.Classroom != tc.classroom {
			t.Errorf("파일명 %q 인식 결과가 다릅니다: %#v", tc.name, got)
		}
	}
}
