package attendance

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"io"
	"path"
	"regexp"
	"sort"
	"strings"
)

const maxAttendanceHWPXExpandedSize = 48 * 1024 * 1024

var (
	xmlTagPattern           = regexp.MustCompile(`(?s)<[^>]+>`)
	attendanceMarkerPattern = regexp.MustCompile(`\{\{\s*([^{}]+?)\s*\}\}`)
)

// ReplaceAttendanceHWPX는 HWPX ZIP 안의 XML 항목만 새 값으로 바꿉니다.
// 원본 파일은 건드리지 않으며, 호출자는 반환한 바이트를 새 경로에만 저장합니다.
func ReplaceAttendanceHWPX(source []byte, values map[string]string) ([]byte, []string, error) {
	reader, err := zip.NewReader(bytes.NewReader(source), int64(len(source)))
	if err != nil {
		return nil, nil, fmt.Errorf("올바른 HWPX 파일이 아닙니다: %w", err)
	}
	var output bytes.Buffer
	writer := zip.NewWriter(&output)
	unresolved := map[string]bool{}
	var total int64
	for _, entry := range reader.File {
		name := path.Clean(entry.Name)
		if name == "." || strings.HasPrefix(name, "../") || path.IsAbs(name) {
			return nil, nil, fmt.Errorf("안전하지 않은 HWPX 항목입니다")
		}
		if entry.UncompressedSize64 > maxAttendanceHWPXExpandedSize || total+int64(entry.UncompressedSize64) > maxAttendanceHWPXExpandedSize {
			return nil, nil, fmt.Errorf("HWPX 내용이 너무 큽니다")
		}
		total += int64(entry.UncompressedSize64)
		stream, err := entry.Open()
		if err != nil {
			return nil, nil, err
		}
		data, err := io.ReadAll(stream)
		stream.Close()
		if err != nil {
			return nil, nil, err
		}
		if strings.HasSuffix(strings.ToLower(name), ".xml") {
			for key, value := range values {
				data = ReplaceXMLMarker(data, key, XMLEscape(value))
			}
			plainText := html.UnescapeString(xmlTagPattern.ReplaceAllString(string(data), ""))
			for _, match := range attendanceMarkerPattern.FindAllStringSubmatch(plainText, -1) {
				if len(match) > 1 {
					unresolved[strings.TrimSpace(match[1])] = true
				}
			}
		}
		next, err := writer.CreateHeader(&entry.FileHeader)
		if err != nil {
			return nil, nil, err
		}
		if _, err := next.Write(data); err != nil {
			return nil, nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, nil, err
	}
	remaining := make([]string, 0, len(unresolved))
	for key := range unresolved {
		remaining = append(remaining, key)
	}
	sort.Strings(remaining)
	return output.Bytes(), remaining, nil
}

// AttendanceHWPXContainsMarker는 HWPX XML에 특정 치환자가 있는지 확인합니다.
func AttendanceHWPXContainsMarker(source []byte, key string) (bool, error) {
	reader, err := zip.NewReader(bytes.NewReader(source), int64(len(source)))
	if err != nil {
		return false, fmt.Errorf("올바른 HWPX 파일이 아닙니다: %w", err)
	}
	pattern := attendanceXMLMarkerPattern(key)
	var total int64
	for _, entry := range reader.File {
		name := path.Clean(entry.Name)
		if name == "." || strings.HasPrefix(name, "../") || path.IsAbs(name) {
			return false, fmt.Errorf("안전하지 않은 HWPX 항목입니다")
		}
		if entry.UncompressedSize64 > maxAttendanceHWPXExpandedSize || total+int64(entry.UncompressedSize64) > maxAttendanceHWPXExpandedSize {
			return false, fmt.Errorf("HWPX 내용이 너무 큽니다")
		}
		total += int64(entry.UncompressedSize64)
		if !strings.HasSuffix(strings.ToLower(name), ".xml") {
			continue
		}
		stream, err := entry.Open()
		if err != nil {
			return false, err
		}
		data, readErr := io.ReadAll(stream)
		stream.Close()
		if readErr != nil {
			return false, readErr
		}
		if pattern.Match(data) {
			return true, nil
		}
	}
	return false, nil
}

// ReplaceXMLMarker는 한글 편집기가 치환자 글자를 여러 텍스트 노드로
// 나눈 경우에도 중간 태그를 함께 정리해 유효한 XML 문자열로 치환합니다.
func ReplaceXMLMarker(source []byte, key, escapedValue string) []byte {
	return attendanceXMLMarkerPattern(key).ReplaceAll(source, []byte(escapedValue))
}

func attendanceXMLMarkerPattern(key string) *regexp.Regexp {
	marker := "{{" + key + "}}"
	parts := make([]string, 0, len([]rune(marker)))
	for _, char := range []rune(marker) {
		parts = append(parts, regexp.QuoteMeta(string(char)))
	}
	return regexp.MustCompile(strings.Join(parts, `(?:<[^>]+>)*`))
}

// XMLEscape는 XML 특수 문자를 이스케이프합니다.
func XMLEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return replacer.Replace(value)
}

