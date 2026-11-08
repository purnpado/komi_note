package vault

import (
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"TeacherNote/internal/students"
)

// Student는 암호화 보관함 안에서만 다루는 학생 기본 정보입니다.
type Student = students.Student

// AcademicChange는 개인정보를 삭제한 뒤 남기는 최소 학적변동 이력입니다.
type AcademicChange = students.AcademicChange

// RosterPreview는 가져오기 전 확인할 명렬표 미리보기입니다.
type RosterPreview = students.RosterPreview

// RosterImportResult는 명렬표 저장 결과입니다.
type RosterImportResult = students.RosterImportResult

// GenderCount는 성별별 인원입니다.
type GenderCount = students.GenderCount

// AgeGroup은 만 나이별 학생 명단입니다.
type AgeGroup = students.AgeGroup

// StudentStats는 지정 기준일의 학생 통계입니다.
type StudentStats = students.StudentStats

func (s *VaultStore) PreviewRoster(path string) (RosterPreview, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RosterPreview{}, errors.New("먼저 보관함을 열어 주세요")
	}
	return readRoster(path, s.session.Config)
}

func (s *VaultStore) ImportRoster(path string) (RosterImportResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return RosterImportResult{}, errors.New("먼저 보관함을 열어 주세요")
	}
	preview, err := readRoster(path, s.session.Config)
	if err != nil {
		return RosterImportResult{}, err
	}
	// 명렬표의 번호는 학기 중 바뀔 수 있으므로, 번호만으로 기존 학생을
	// 덮어쓰지 않습니다. 이름과 생년월일이 모두 같은 경우에만 같은 학생으로
	// 판단합니다. 생년월일이 비어 있으면 안전을 위해 자동 병합하지 않습니다.
	students := append([]Student(nil), s.session.Students...)
	byIdentity := make(map[string]int, len(students))
	byNumber := make(map[int]int, len(students))
	for i, student := range students {
		if key := rosterIdentityKey(student.Name, student.BirthDate); key != "" {
			if _, exists := byIdentity[key]; !exists {
				byIdentity[key] = i
			}
		}
		byNumber[student.Number] = i
	}
	result := RosterImportResult{Warnings: append([]string{}, preview.Warnings...)}
	for _, imported := range preview.Students {
		identity := rosterIdentityKey(imported.Name, imported.BirthDate)
		if index, found := byIdentity[identity]; found {
			existing := students[index]
			if numberOwner, occupied := byNumber[imported.Number]; occupied && numberOwner != index {
				result.Warnings = append(result.Warnings, fmt.Sprintf("%d번 %s 학생은 기존 %s 학생과 번호가 겹쳐 자동 반영하지 않았습니다", imported.Number, imported.Name, students[numberOwner].Name))
				continue
			}
			imported.ID = existing.ID
			imported.StudentID = existing.StudentID
			imported.StudentPhone = existing.StudentPhone
			imported.FatherName = existing.FatherName
			imported.FatherPhone = existing.FatherPhone
			imported.MotherName = existing.MotherName
			imported.MotherPhone = existing.MotherPhone
			imported.GuardianName = existing.GuardianName
			imported.GuardianRelationship = existing.GuardianRelationship
			imported.GuardianPhone = existing.GuardianPhone
			imported.DocumentGuardian = existing.DocumentGuardian
			imported.TransferInDate = existing.TransferInDate
			imported.CareerHope = existing.CareerHope
			imported.HasPhoto = existing.HasPhoto
			delete(byNumber, existing.Number)
			students[index] = imported
			byNumber[imported.Number] = index
			result.Updated++
			continue
		}
		if index, found := byNumber[imported.Number]; found {
			existing := students[index]
			result.Warnings = append(result.Warnings, fmt.Sprintf("%d번 %s 학생은 기존 %s 학생과 이름·생년월일이 달라 자동 반영하지 않았습니다", imported.Number, imported.Name, existing.Name))
			continue
		}
		id, err := newStudentID()
		if err != nil {
			return RosterImportResult{}, err
		}
		imported.ID = id
		byNumber[imported.Number] = len(students)
		if identity != "" {
			byIdentity[identity] = len(students)
		}
		students = append(students, imported)
		result.Added++
	}
	sortStudents(students)
	candidate := *s.session
	candidate.Students = students
	candidate.UpdatedAt = time.Now().UTC()
	if err := s.writeVaultDataLocked(&candidate); err != nil {
		return RosterImportResult{}, err
	}
	s.session = &candidate
	result.Total = len(students)
	return result, nil
}

func (s *VaultStore) ListStudents() ([]Student, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	students := append([]Student{}, s.session.Students...)
	sortStudents(students)
	return students, nil
}

func (s *VaultStore) SaveStudent(student Student) (Student, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Student{}, errors.New("먼저 보관함을 열어 주세요")
	}
	student = normaliseStudent(student)
	if err := validateStudent(student); err != nil {
		return Student{}, err
	}
	for i := range s.session.Students {
		if s.session.Students[i].ID == student.ID {
			s.session.Students[i] = student
			s.session.UpdatedAt = time.Now().UTC()
			if err := s.writeCurrentVaultLocked(); err != nil {
				return Student{}, err
			}
			return student, nil
		}
	}
	return Student{}, errors.New("수정할 학생을 찾지 못했습니다")
}

// AddStudent는 전입 학생처럼 명렬에 직접 추가한 학생 정보를 암호화해 저장합니다.
func (s *VaultStore) AddStudent(student Student) (Student, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return Student{}, errors.New("먼저 보관함을 열어 주세요")
	}
	student.ID = ""
	student.HasPhoto = false
	student = normaliseStudent(student)
	id, err := newStudentID()
	if err != nil {
		return Student{}, err
	}
	student.ID = id
	if err := validateStudent(student); err != nil {
		return Student{}, err
	}
	if student.TransferInDate == "" {
		return Student{}, errors.New("전입 학생의 전입일을 입력해 주세요")
	}
	for _, existing := range s.session.Students {
		if existing.Number == student.Number {
			return Student{}, fmt.Errorf("%d번 학생이 이미 있습니다", student.Number)
		}
	}
	s.session.Students = append(s.session.Students, student)
	sortStudents(s.session.Students)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return Student{}, err
	}
	return student, nil
}

func (s *VaultStore) GetStudentStats(baseDate string) (StudentStats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return StudentStats{}, errors.New("먼저 보관함을 열어 주세요")
	}
	date, err := parseBaseDate(baseDate)
	if err != nil {
		return StudentStats{}, err
	}
	gender := map[string]int{"남성": 0, "여성": 0, "미입력": 0}
	ageGroups := map[int][]Student{}
	for _, student := range s.session.Students {
		label := normaliseGender(student.Gender)
		if label == "" {
			label = "미입력"
		}
		gender[label]++
		if birth, err := time.Parse("2006-01-02", student.BirthDate); err == nil {
			age := fullAge(birth, date)
			ageGroups[age] = append(ageGroups[age], student)
		}
	}
	stats := StudentStats{BaseDate: date.Format("2006-01-02"), Total: len(s.session.Students), GenderCounts: []GenderCount{}, AgeGroups: []AgeGroup{}}
	for _, label := range []string{"남성", "여성", "미입력"} {
		if gender[label] > 0 {
			stats.GenderCounts = append(stats.GenderCounts, GenderCount{Gender: label, Count: gender[label]})
		}
	}
	ages := make([]int, 0, len(ageGroups))
	for age := range ageGroups {
		ages = append(ages, age)
	}
	sort.Ints(ages)
	for _, age := range ages {
		students := append([]Student{}, ageGroups[age]...)
		sortStudents(students)
		stats.AgeGroups = append(stats.AgeGroups, AgeGroup{Age: age, Count: len(students), Students: students})
	}
	return stats, nil
}

func readRoster(path string, config ClassConfig) (RosterPreview, error) {
	if strings.TrimSpace(path) == "" {
		return RosterPreview{}, errors.New("명렬표 파일을 선택해 주세요")
	}
	workbook, err := excelize.OpenFile(path)
	if err != nil {
		return RosterPreview{}, fmt.Errorf("명렬표를 열지 못했습니다: %w", err)
	}
	defer func() { _ = workbook.Close() }()
	sheets := workbook.GetSheetList()
	if len(sheets) == 0 {
		return RosterPreview{}, errors.New("명렬표에 시트가 없습니다")
	}
	rows, err := workbook.GetRows(sheets[0])
	if err != nil || len(rows) == 0 {
		return RosterPreview{}, errors.New("명렬표 내용을 읽지 못했습니다")
	}
	preview := RosterPreview{Headers: append([]string{}, rows[0]...), Students: []Student{}, Warnings: []string{}}
	columns := map[string]int{}
	for index, value := range rows[0] {
		columns[normaliseHeader(value)] = index
	}
	for _, required := range []string{"번호", "성명"} {
		if _, ok := columns[required]; !ok {
			return RosterPreview{}, fmt.Errorf("명렬표에 %s 열이 없습니다", required)
		}
	}
	warningSet := map[string]bool{}
	seenNumbers := map[int]int{}
	for rowIndex, row := range rows[1:] {
		if blankRow(row) {
			continue
		}
		number, err := strconv.Atoi(strings.TrimSpace(cell(row, columns["번호"])))
		if err != nil || number < 1 {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("%d행의 번호를 읽지 못해 제외했습니다", rowIndex+2))
			continue
		}
		if previousRow, exists := seenNumbers[number]; exists {
			return RosterPreview{}, fmt.Errorf("명렬표에 %d번이 중복되어 있습니다 (%d행과 %d행)", number, previousRow, rowIndex+2)
		}
		seenNumbers[number] = rowIndex + 2
		name := strings.TrimSpace(cell(row, columns["성명"]))
		if name == "" {
			preview.Warnings = append(preview.Warnings, fmt.Sprintf("%d행의 성명이 없어 제외했습니다", rowIndex+2))
			continue
		}
		student := Student{Number: number, Name: name, Gender: normaliseGender(cell(row, columns["성별"])), Address: strings.TrimSpace(cell(row, columns["주소"]))}
		if birthText := strings.TrimSpace(cell(row, columns["생년월일"])); birthText != "" {
			birth, err := parseBirthDate(birthText)
			if err != nil {
				preview.Warnings = append(preview.Warnings, fmt.Sprintf("%d행 %s 학생의 생년월일 형식을 확인해 주세요", rowIndex+2, name))
			} else {
				student.BirthDate = birth
			}
		}
		for _, check := range []struct{ header, expected, label string }{{"학년", config.Grade, "학년"}, {"반", config.ClassNumber, "반"}} {
			if index, ok := columns[check.header]; ok && check.expected != "" && strings.TrimSpace(cell(row, index)) != "" && strings.TrimSpace(cell(row, index)) != check.expected {
				message := fmt.Sprintf("명렬표 %s %s은(는) 최초 설정 %s과(와) 다릅니다", check.label, strings.TrimSpace(cell(row, index)), check.expected)
				if !warningSet[message] {
					preview.Warnings = append(preview.Warnings, message)
					warningSet[message] = true
				}
			}
		}
		preview.Students = append(preview.Students, student)
	}
	if len(preview.Students) == 0 {
		return RosterPreview{}, errors.New("가져올 수 있는 학생이 없습니다")
	}
	sortStudents(preview.Students)
	return preview, nil
}

func rosterIdentityKey(name, birthDate string) string {
	normalizedName := strings.ToLower(strings.Join(strings.Fields(name), ""))
	normalizedBirthDate := strings.TrimSpace(birthDate)
	if normalizedName == "" || normalizedBirthDate == "" {
		return ""
	}
	return normalizedName + "\x00" + normalizedBirthDate
}

func cell(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	return row[index]
}
func blankRow(row []string) bool {
	for _, value := range row {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}
func normaliseHeader(value string) string {
	return strings.ReplaceAll(strings.TrimSpace(value), " ", "")
}
func normaliseGender(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "남", "남자", "남성", "m", "male":
		return "남성"
	case "여", "여자", "여성", "f", "female":
		return "여성"
	default:
		return ""
	}
}
func parseBirthDate(value string) (string, error) {
	value = strings.TrimRight(strings.TrimSpace(value), ".")
	value = strings.NewReplacer(".", "-", "/", "-", " ", "").Replace(value)
	if len(value) == 8 && !strings.Contains(value, "-") {
		value = value[:4] + "-" + value[4:6] + "-" + value[6:]
	}
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		return "", err
	}
	return date.Format("2006-01-02"), nil
}
func parseBaseDate(value string) (time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return time.Now().In(time.Local), nil
	}
	date, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, errors.New("기준일은 YYYY-MM-DD 형식으로 입력해 주세요")
	}
	return date, nil
}
func fullAge(birth, base time.Time) int {
	age := base.Year() - birth.Year()
	if base.Month() < birth.Month() || (base.Month() == birth.Month() && base.Day() < birth.Day()) {
		age--
	}
	return age
}
func sortStudents(students []Student) {
	sort.Slice(students, func(i, j int) bool { return students[i].Number < students[j].Number })
}
func newStudentID() (string, error) {
	bytes, err := randomBytes(16)
	if err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}
func normaliseStudent(student Student) Student {
	student.Name = strings.TrimSpace(student.Name)
	student.StudentID = strings.TrimSpace(student.StudentID)
	student.Gender = normaliseGender(student.Gender)
	student.BirthDate = strings.TrimSpace(student.BirthDate)
	student.Address = strings.TrimSpace(student.Address)
	student.StudentPhone = strings.TrimSpace(student.StudentPhone)
	student.FatherName = strings.TrimSpace(student.FatherName)
	student.FatherPhone = strings.TrimSpace(student.FatherPhone)
	student.MotherName = strings.TrimSpace(student.MotherName)
	student.MotherPhone = strings.TrimSpace(student.MotherPhone)
	student.GuardianName = strings.TrimSpace(student.GuardianName)
	student.GuardianRelationship = strings.TrimSpace(student.GuardianRelationship)
	student.GuardianPhone = strings.TrimSpace(student.GuardianPhone)
	switch strings.TrimSpace(student.DocumentGuardian) {
	case "모", "부", "기타 보호자":
		student.DocumentGuardian = strings.TrimSpace(student.DocumentGuardian)
	default:
		student.DocumentGuardian = ""
	}
	student.TransferInDate = strings.TrimSpace(student.TransferInDate)
	student.CareerHope = strings.TrimSpace(student.CareerHope)
	student.Note = strings.TrimSpace(student.Note)
	return student
}
func validateStudent(student Student) error {
	if student.ID == "" || student.Number < 1 || student.Name == "" {
		return errors.New("학생 번호와 성명을 확인해 주세요")
	}
	if student.BirthDate != "" {
		if _, err := time.Parse("2006-01-02", student.BirthDate); err != nil {
			return errors.New("생년월일은 YYYY-MM-DD 형식으로 입력해 주세요")
		}
	}
	if student.TransferInDate != "" {
		if _, err := time.Parse("2006-01-02", student.TransferInDate); err != nil {
			return errors.New("전입일은 YYYY-MM-DD 형식으로 입력해 주세요")
		}
	}
	return nil
}
