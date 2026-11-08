package vault

import (
	"archive/zip"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"TeacherNote/internal/attendance"
)

const maxAttendanceTemplateSize = 12 * 1024 * 1024

// AttendanceTemplate은 학교별 결석계 양식과 교사가 지정한 입력 위치입니다.
type AttendanceTemplate = attendance.AttendanceTemplate

// AttendanceFieldPoint는 양식 미리보기의 가로·세로 비율 좌표입니다.
type AttendanceFieldPoint = attendance.AttendanceFieldPoint

type encryptedTemplate struct {
	FileName string `json:"fileName"`
	Data     string `json:"data"`
}

// AttendanceHWPXBuildResult는 원본을 수정하지 않고 만든 결과 바이트와
// 서식에서 아직 채우지 못한 치환자 목록을 함께 전달합니다.
type AttendanceHWPXBuildResult = attendance.AttendanceHWPXBuildResult

func (s *VaultStore) ListAttendanceTemplates() ([]AttendanceTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return nil, errors.New("먼저 보관함을 열어 주세요")
	}
	items := append([]AttendanceTemplate{}, s.session.AttendanceTemplates...)
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	return items, nil
}

func (s *VaultStore) SaveAttendanceTemplate(name, path string, statuses []string) (AttendanceTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceTemplate{}, errors.New("먼저 보관함을 열어 주세요")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return AttendanceTemplate{}, errors.New("양식 이름을 입력해 주세요")
	}
	statuses = normaliseAttendanceTemplateStatuses(statuses)
	if len(statuses) == 0 {
		return AttendanceTemplate{}, errors.New("적용할 출결 상태를 하나 이상 선택해 주세요")
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext != ".hwpx" && ext != ".pdf" && ext != ".docx" && ext != ".xlsx" {
		return AttendanceTemplate{}, errors.New("HWPX, PDF, DOCX, XLSX 양식만 등록할 수 있습니다")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return AttendanceTemplate{}, errors.New("양식 파일을 읽지 못했습니다")
	}
	defer zeroBytes(contents)
	if len(contents) == 0 || len(contents) > maxAttendanceTemplateSize {
		return AttendanceTemplate{}, errors.New("양식 파일은 12MB 이하로 등록해 주세요")
	}
	id, err := newStudentID()
	if err != nil {
		return AttendanceTemplate{}, err
	}
	preview := ""
	if ext == ".hwpx" {
		preview, _ = hwpxPreview(contents)
	}
	if ext == ".pdf" {
		preview, _ = pdfPreview(path)
	}
	payload, err := json.Marshal(encryptedTemplate{FileName: filepath.Base(path), Data: base64.StdEncoding.EncodeToString(contents)})
	if err != nil {
		return AttendanceTemplate{}, errors.New("양식 저장을 준비하지 못했습니다")
	}
	defer zeroBytes(payload)
	sealed, err := seal(s.sessionKey, payload, "attendance-template-v1")
	if err != nil {
		return AttendanceTemplate{}, err
	}
	if err := writeJSONSecure(s.attendanceTemplatePath(id), sealed); err != nil {
		return AttendanceTemplate{}, fmt.Errorf("양식 파일을 암호화해 저장하지 못했습니다: %w", err)
	}
	item := AttendanceTemplate{ID: id, Name: name, FileName: filepath.Base(path), Format: strings.TrimPrefix(ext, "."), Statuses: statuses, PreviewData: preview, Mappings: []AttendanceFieldPoint{}, CustomValues: map[string]string{}, CreatedAt: time.Now().UTC().Format(time.RFC3339)}
	s.session.AttendanceTemplates = append(s.session.AttendanceTemplates, item)
	s.session.UpdatedAt = time.Now().UTC()
	if err := s.writeCurrentVaultLocked(); err != nil {
		return AttendanceTemplate{}, err
	}
	return item, nil
}

func normaliseAttendanceTemplateStatuses(items []string) []string {
	allowed := map[string]bool{"결석": true, "지각": true, "조퇴": true, "결과": true}
	seen := map[string]bool{}
	result := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if allowed[item] && !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

func (s *VaultStore) DeleteAttendanceTemplate(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return errors.New("먼저 보관함을 열어 주세요")
	}
	for i, item := range s.session.AttendanceTemplates {
		if item.ID != id {
			continue
		}
		if err := os.Remove(s.attendanceTemplatePath(id)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return errors.New("암호화 양식 파일을 삭제하지 못했습니다")
		}
		s.session.AttendanceTemplates = append(s.session.AttendanceTemplates[:i], s.session.AttendanceTemplates[i+1:]...)
		s.session.UpdatedAt = time.Now().UTC()
		return s.writeCurrentVaultLocked()
	}
	return errors.New("삭제할 양식을 찾지 못했습니다")
}

func pdfPreview(path string) (string, error) {
	directory, err := os.MkdirTemp("", "teacher-note-pdf-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(directory)
	prefix := filepath.Join(directory, "preview")
	if output, err := exec.Command("pdftoppm", "-f", "1", "-l", "1", "-png", "-r", "160", path, prefix).CombinedOutput(); err != nil {
		return "", fmt.Errorf("PDF 미리보기를 만들지 못했습니다: %s", strings.TrimSpace(string(output)))
	}
	image, err := os.ReadFile(prefix + "-1.png")
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(image), nil
}

func (s *VaultStore) SaveAttendanceTemplateMappings(id string, mappings []AttendanceFieldPoint) (AttendanceTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceTemplate{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.AttendanceTemplates {
		if s.session.AttendanceTemplates[index].ID != id {
			continue
		}
		clean := make([]AttendanceFieldPoint, 0, len(mappings))
		seen := map[string]bool{}
		for _, point := range mappings {
			point.ID = strings.TrimSpace(point.ID)
			point.Field = strings.TrimSpace(point.Field)
			point.Format = strings.TrimSpace(point.Format)
			if point.ID == "" {
				id, err := newStudentID()
				if err != nil {
					return AttendanceTemplate{}, err
				}
				point.ID = id
			}
			// 이전에 저장한 좌표에는 크기 정보가 없으므로, 불러올 때도 같은 기본 크기로 보정합니다.
			if point.Width <= 0 {
				point.Width = 14
			}
			if point.Height <= 0 {
				point.Height = 5
			}
			if point.FontSize <= 0 {
				point.FontSize = 1.8
			}
			if point.Field == "" || seen[point.ID] || point.X < 0 || point.X > 100 || point.Y < 0 || point.Y > 100 || point.Width < 2 || point.Width > 90 || point.Height < 2 || point.Height > 30 || point.FontSize < 0.8 || point.FontSize > 6 || point.X+point.Width > 100 || point.Y+point.Height > 100 {
				return AttendanceTemplate{}, errors.New("양식 항목 위치를 다시 확인해 주세요")
			}
			seen[point.ID] = true
			clean = append(clean, point)
		}
		s.session.AttendanceTemplates[index].Mappings = clean
		s.session.UpdatedAt = time.Now().UTC()
		if err := s.writeCurrentVaultLocked(); err != nil {
			return AttendanceTemplate{}, err
		}
		return s.session.AttendanceTemplates[index], nil
	}
	return AttendanceTemplate{}, errors.New("양식을 찾지 못했습니다")
}

// SaveAttendanceTemplateCustomValues는 학교 서식에서만 쓰는 치환자 값을 저장합니다.
// 기본 출결·학생 치환자는 저장값으로 덮어쓰지 못하게 막습니다.
func (s *VaultStore) SaveAttendanceTemplateCustomValues(id string, values map[string]string) (AttendanceTemplate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceTemplate{}, errors.New("먼저 보관함을 열어 주세요")
	}
	for index := range s.session.AttendanceTemplates {
		if s.session.AttendanceTemplates[index].ID != id {
			continue
		}
		clean := make(map[string]string)
		for key, value := range values {
			key = strings.TrimSpace(strings.Trim(key, "{}"))
			value = strings.TrimSpace(value)
			if key == "" || len([]rune(key)) > 40 || len([]rune(value)) > 200 {
				return AttendanceTemplate{}, errors.New("기타 치환자 이름 또는 값을 다시 확인해 주세요")
			}
			if attendanceReservedToken(key) {
				return AttendanceTemplate{}, fmt.Errorf("{{%s}}는 출결 기록에서 자동으로 채워지는 항목입니다", key)
			}
			clean[key] = value
		}
		s.session.AttendanceTemplates[index].CustomValues = clean
		s.session.UpdatedAt = time.Now().UTC()
		if err := s.writeCurrentVaultLocked(); err != nil {
			return AttendanceTemplate{}, err
		}
		return s.session.AttendanceTemplates[index], nil
	}
	return AttendanceTemplate{}, errors.New("양식을 찾지 못했습니다")
}

func attendanceReservedToken(key string) bool {
	for _, prefix := range []string{"기준", "시작", "종료", "작성"} {
		if key == prefix || key == prefix+"년" || key == prefix+"월" || key == prefix+"일자" {
			return true
		}
	}
	reserved := map[string]bool{"이름": true, "학번": true, "학년": true, "반": true, "번호": true, "출결상태": true, "사유구분": true, "상세사유": true, "교시": true, "보호자성명": true, "보호자관계": true, "보호자연락처": true, "담임교사": true, "결석일수": true}
	return reserved[key]
}

// documentGuardianName은 결석 신고서에 넣을 보호자 성명을 결정한다.
// 교사가 학생별로 지정한 문서용 보호자를 우선하고, 미지정이면 모·부·기타 보호자 순서로 찾는다.
func documentGuardianName(student Student) string {
	bySelection := map[string]string{"모": student.MotherName, "부": student.FatherName, "기타 보호자": student.GuardianName}
	if selected := strings.TrimSpace(bySelection[student.DocumentGuardian]); selected != "" {
		return selected
	}
	for _, name := range []string{student.MotherName, student.FatherName, student.GuardianName} {
		if name = strings.TrimSpace(name); name != "" {
			return name
		}
	}
	return ""
}

func hwpxPreview(contents []byte) (string, error) {
	reader, err := zip.NewReader(strings.NewReader(string(contents)), int64(len(contents)))
	if err != nil {
		return "", err
	}
	for _, entry := range reader.File {
		if entry.Name != "Preview/PrvImage.png" {
			continue
		}
		stream, err := entry.Open()
		if err != nil {
			return "", err
		}
		defer stream.Close()
		image, err := io.ReadAll(io.LimitReader(stream, 4*1024*1024))
		if err != nil {
			return "", err
		}
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(image), nil
	}
	return "", nil
}

func (s *VaultStore) attendanceTemplatePath(id string) string {
	return filepath.Join(filepath.Dir(s.filePath), "attendance-templates", id+".template")
}

// BuildAttendanceHWPX는 암호화 보관된 HWPX 서식을 복호화해 선택한 학생의
// 기준일 출결 값으로 채운 새 파일 바이트를 만든다. 원본 보관함은 변경하지 않는다.
func (s *VaultStore) BuildAttendanceHWPX(templateID, studentID, date string) (AttendanceHWPXBuildResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.session == nil {
		return AttendanceHWPXBuildResult{}, errors.New("먼저 보관함을 열어 주세요")
	}
	var template AttendanceTemplate
	for _, item := range s.session.AttendanceTemplates {
		if item.ID == templateID {
			template = item
			break
		}
	}
	if template.ID == "" || template.Format != "hwpx" {
		return AttendanceHWPXBuildResult{}, errors.New("HWPX 서식을 선택해 주세요")
	}
	var student Student
	for _, item := range s.session.Students {
		if item.ID == studentID {
			student = item
			break
		}
	}
	if student.ID == "" {
		return AttendanceHWPXBuildResult{}, errors.New("학생 정보를 찾지 못했습니다")
	}
	period, err := s.attendanceDocumentPeriodLocked(studentID, date)
	if err != nil {
		return AttendanceHWPXBuildResult{}, err
	}
	entry := period.Entry
	if len(template.Statuses) > 0 {
		applies := false
		for _, status := range template.Statuses {
			if status == entry.Status {
				applies = true
				break
			}
		}
		if !applies {
			return AttendanceHWPXBuildResult{}, errors.New("선택한 출결 상태에 연결된 HWPX 서식이 아닙니다")
		}
	}
	var encrypted encryptedBlob
	if err := readJSON(s.attendanceTemplatePath(template.ID), &encrypted); err != nil {
		return AttendanceHWPXBuildResult{}, errors.New("암호화된 HWPX 서식을 읽지 못했습니다")
	}
	source, err := open(s.sessionKey, encrypted, "attendance-template-v1")
	if err != nil {
		return AttendanceHWPXBuildResult{}, errors.New("HWPX 서식을 복호화하지 못했습니다")
	}
	defer zeroBytes(source)
	guardianName := documentGuardianName(student)
	if guardianName == "" {
		hasMarker, err := attendance.AttendanceHWPXContainsMarker(source, "보호자성명")
		if err != nil {
			return AttendanceHWPXBuildResult{}, err
		}
		if hasMarker {
			return AttendanceHWPXBuildResult{}, errors.New("학생 정보에 결석신고서용 보호자 성명을 입력하거나 선택해 주세요")
		}
	}
	guardianPhone := student.GuardianPhone
	if guardianPhone == "" {
		guardianPhone = student.FatherPhone
	}
	if guardianPhone == "" {
		guardianPhone = student.MotherPhone
	}
	values := map[string]string{"이름": student.Name, "학번": student.StudentID, "학년": s.session.Config.Grade, "반": s.session.Config.ClassNumber, "번호": fmt.Sprintf("%d", student.Number), "출결상태": entry.Status, "사유구분": entry.ReasonCategory, "상세사유": entry.Reason, "교시": entry.Period, "보호자성명": guardianName, "보호자관계": student.GuardianRelationship, "보호자연락처": guardianPhone, "담임교사": s.session.Config.TeacherLabel, "결석일수": fmt.Sprintf("%d일간", period.SchoolDays)}
	for key, value := range attendance.AttendanceDateTokens("기준", date) {
		values[key] = value
	}
	for key, value := range attendance.AttendanceDateTokens("시작", period.StartDate) {
		values[key] = value
	}
	endDate := period.EndDate
	if endDate == "" {
		endDate = period.StartDate
	}
	for key, value := range attendance.AttendanceDateTokens("종료", endDate) {
		values[key] = value
	}
	for key, value := range attendance.AttendanceDateTokens("작성", time.Now().Format("2006-01-02")) {
		values[key] = value
	}
	for key, value := range template.CustomValues {
		if !attendanceReservedToken(key) {
			values[key] = value
		}
	}
	result, unresolved, err := attendance.ReplaceAttendanceHWPX(source, values)
	if err != nil {
		return AttendanceHWPXBuildResult{}, err
	}
	return AttendanceHWPXBuildResult{Data: result, FileName: fmt.Sprintf("%s_출결서류_%s.hwpx", strings.ReplaceAll(date, "-", ""), student.Name), Unresolved: unresolved}, nil
}
