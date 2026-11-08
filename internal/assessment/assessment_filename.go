package assessment

import (
	"path/filepath"
	"regexp"
	"strings"
)

type AssessmentFilenameMetadata struct {
	SchoolYear string
	Semester   string
	Grade      string
	Subject    string
	Classroom  string
}

var assessmentFilenamePattern = regexp.MustCompile(`(?:^|[^0-9])([0-9]{4})\s*학년도\s*([12])\s*학기\s+.*?([1-3])\s*학년\s+(.+?)_전체_([^_]+)\.xlsx$`)

// ParseAssessmentFilename은 보조 정보로만 사용하며 엑셀 내부 과목·반을 덮어쓰지 않습니다.
func ParseAssessmentFilename(name string) AssessmentFilenameMetadata {
	matches := assessmentFilenamePattern.FindStringSubmatch(filepath.Base(name))
	if len(matches) != 6 {
		return AssessmentFilenameMetadata{}
	}
	return AssessmentFilenameMetadata{
		SchoolYear: matches[1],
		Semester:   matches[2],
		Grade:      matches[3],
		Subject:    strings.TrimSpace(matches[4]),
		Classroom:  strings.TrimSpace(matches[5]),
	}
}
