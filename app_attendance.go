package main

// 출결 입력·서식·출력 바인딩

import (
	"encoding/base64"
	"errors"
	"net/url"
	"path/filepath"
	"strings"

	"TeacherNote/internal/attendance"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// GetAttendance는 선택 날짜의 재학생 출결을 반환합니다.
func (a *App) GetAttendance(date string) (AttendanceDay, error) {
	return a.vault.GetAttendance(date)
}

// SaveAttendance는 선택 날짜의 재학생 출결을 암호화 보관함에 저장합니다.
func (a *App) SaveAttendance(day AttendanceDay) (AttendanceDay, error) {
	result, err := a.vault.SaveAttendance(day)
	return notifyAfter(eventAttendanceChanged, "수정", nil, result, err)
}

// ListStudentAttendance는 학생 상세정보의 출결 누계와 기록을 반환합니다.
func (a *App) ListStudentAttendance(studentID string) ([]AttendanceDay, error) {
	return a.vault.ListStudentAttendance(studentID)
}

func (a *App) GetAttendanceDocumentPeriod(studentID, date string) (AttendanceDocumentPeriod, error) {
	return a.vault.GetAttendanceDocumentPeriod(studentID, date)
}

func (a *App) SelectAttendanceTemplateFile() (string, error) {
	return a.openFileDialog("결석계 양식 선택", "한글(HWPX) 결석계 양식", "*.hwpx")
}

func (a *App) ListAttendanceTemplates() ([]AttendanceTemplate, error) {
	return a.vault.ListAttendanceTemplates()
}

func (a *App) SaveAttendanceTemplate(name, path string, statuses []string) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplate(name, path, statuses)
}

func (a *App) SaveAttendanceTemplateMappings(id string, mappings []AttendanceFieldPoint) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplateMappings(id, mappings)
}

func (a *App) SaveAttendanceTemplateCustomValues(id string, values map[string]string) (AttendanceTemplate, error) {
	return a.vault.SaveAttendanceTemplateCustomValues(id, values)
}

func (a *App) DeleteAttendanceTemplate(id string) error { return a.vault.DeleteAttendanceTemplate(id) }

// AttendanceHWPXExportResult는 저장 위치와 서식에 남은 안내용 치환자를 제공합니다.
type AttendanceHWPXExportResult struct {
	Path       string   `json:"path"`
	Unresolved []string `json:"unresolved"`
}

func (a *App) ExportAttendanceHWPX(templateID, studentID, date string) (AttendanceHWPXExportResult, error) {
	result, err := a.vault.BuildAttendanceHWPX(templateID, studentID, date)
	if err != nil {
		return AttendanceHWPXExportResult{}, err
	}
	defer zeroBytes(result.Data)
	path, err := a.saveFileDialog("출결 HWPX 저장", result.FileName, "HWPX 파일", "*.hwpx")
	if err != nil || path == "" {
		return AttendanceHWPXExportResult{}, err
	}
	if err := writeFileAndSync(path, result.Data); err != nil {
		return AttendanceHWPXExportResult{}, errors.New("HWPX 서류를 저장하지 못했습니다")
	}
	fileURL := (&url.URL{Scheme: "file", Path: filepath.ToSlash(path)}).String()
	if appInst := application.Get(); appInst != nil {
		_ = appInst.Browser.OpenURL(fileURL)
	}
	return AttendanceHWPXExportResult{Path: path, Unresolved: result.Unresolved}, nil
}

// SaveAttendancePDF는 화면에서 완성한 단일 페이지를 PDF로 저장하고 기본 PDF 뷰어로 엽니다.
func (a *App) SaveAttendancePDF(pageDataURL, suggestedName string) (string, error) {
	encoded, found := strings.CutPrefix(pageDataURL, "data:image/png;base64,")
	if !found || encoded == "" {
		return "", errors.New("출결 서류 이미지를 준비하지 못했습니다")
	}
	pageImage, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(pageImage) == 0 {
		return "", errors.New("출결 서류 이미지를 읽지 못했습니다")
	}
	suggestedName = strings.TrimSpace(suggestedName)
	if suggestedName == "" {
		suggestedName = "출결 서류.pdf"
	}
	if !strings.EqualFold(filepath.Ext(suggestedName), ".pdf") {
		suggestedName += ".pdf"
	}
	path, err := a.saveFileDialog("출결 서류 PDF 저장", suggestedName, "PDF 파일", "*.pdf")
	if err != nil || path == "" {
		return "", err
	}
	if err := attendance.WriteAttendancePDF(pageImage, path); err != nil {
		return "", err
	}
	fileURL := (&url.URL{Scheme: "file", Path: filepath.ToSlash(path)}).String()
	if appInst := application.Get(); appInst != nil {
		_ = appInst.Browser.OpenURL(fileURL)
	}
	return path, nil
}

// PrintAttendancePDF는 완성된 출결 서류 이미지를 Windows 기본 프린터로 바로 보냅니다.
func (a *App) PrintAttendancePDF(pageDataURL string) error {
	encoded, found := strings.CutPrefix(pageDataURL, "data:image/png;base64,")
	if !found || encoded == "" {
		return errors.New("출결 서류 이미지를 준비하지 못했습니다")
	}
	pageImage, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(pageImage) == 0 {
		return errors.New("출결 서류 이미지를 읽지 못했습니다")
	}
	return attendance.PrintAttendanceImage(pageImage)
}
