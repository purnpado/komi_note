package students

import (
	"sort"
	"strings"
)

// Student는 암호화 보관함 안에서만 다루는 학생 기본 정보입니다.
type Student struct {
	ID                   string `json:"id"`
	Number               int    `json:"number"`
	StudentID            string `json:"studentId"`
	Name                 string `json:"name"`
	Gender               string `json:"gender"`
	BirthDate            string `json:"birthDate"`
	Address              string `json:"address"`
	StudentPhone         string `json:"studentPhone"`
	FatherName           string `json:"fatherName"`
	FatherPhone          string `json:"fatherPhone"`
	MotherName           string `json:"motherName"`
	MotherPhone          string `json:"motherPhone"`
	GuardianName         string `json:"guardianName"`
	GuardianRelationship string `json:"guardianRelationship"`
	GuardianPhone        string `json:"guardianPhone"`
	DocumentGuardian     string `json:"documentGuardian"`
	TransferInDate       string `json:"transferInDate"`
	CareerHope           string `json:"careerHope"`
	Note                 string `json:"note"`
	HasPhoto             bool   `json:"hasPhoto"`
}

// AcademicChange는 개인정보를 삭제한 뒤 남기는 최소 학적변동 이력입니다.
type AcademicChange struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Status        string `json:"status"`
	ProcessedDate string `json:"processedDate"`
	// StudentID·Number는 전출 전 출결 기록을 남겨 보여 주려고 2026-11-10부터 함께 남긴다(예전 기록은 비어 있음).
	StudentID string `json:"studentId,omitempty"`
	Number    int    `json:"number,omitempty"`
}

// RosterPreview는 가져오기 전 확인할 명렬표 미리보기입니다.
type RosterPreview struct {
	Headers  []string  `json:"headers"`
	Students []Student `json:"students"`
	Warnings []string  `json:"warnings"`
}

// RosterImportResult는 명렬표 저장 결과입니다.
type RosterImportResult struct {
	Added    int      `json:"added"`
	Updated  int      `json:"updated"`
	Total    int      `json:"total"`
	Warnings []string `json:"warnings"`
}

// GenderCount는 성별별 인원입니다.
type GenderCount struct {
	Gender string `json:"gender"`
	Count  int    `json:"count"`
}

// AgeGroup은 만 나이별 학생 명단입니다.
type AgeGroup struct {
	Age      int       `json:"age"`
	Count    int       `json:"count"`
	Students []Student `json:"students"`
}

// StudentStats는 지정 기준일의 학생 통계입니다.
type StudentStats struct {
	BaseDate     string        `json:"baseDate"`
	Total        int           `json:"total"`
	GenderCounts []GenderCount `json:"genderCounts"`
	AgeGroups    []AgeGroup    `json:"ageGroups"`
}

// SortStudents는 학생 목록을 번호 오름차순으로 정렬합니다.
func SortStudents(items []Student) {
	sort.Slice(items, func(i, j int) bool {
		return items[i].Number < items[j].Number
	})
}

// StudentNumber는 ID에 해당하는 학생의 번호를 반환합니다.
func StudentNumber(students []Student, id string) int {
	for _, student := range students {
		if student.ID == id {
			return student.Number
		}
	}
	return 0
}

// NormalizeBirthDate는 생년월일 문자열의 구분 기호를 제거하여 표준화합니다.
func NormalizeBirthDate(value string) string {
	return strings.NewReplacer("-", "", ".", "", "/", "", " ", "").Replace(strings.TrimSpace(value))
}
