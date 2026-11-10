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
			changed := false
			for key, value := range values {
				next := ReplaceXMLMarker(data, key, fillMark+XMLEscape(strings.ReplaceAll(value, fillMark, "")))
				if !bytes.Equal(next, data) {
					changed = true
				}
				data = next
			}
			if changed {
				data = dropFilledLineSegments(data)
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

// attendanceXMLMarkerPattern은 {{치환자}}를 찾는 패턴이다. 한글이 글자 사이에 태그를 끼워 넣어도,
// 중괄호 안쪽 앞뒤에 띄어쓰기가 있어도({{ 이름 }}) 찾는다.
func attendanceXMLMarkerPattern(key string) *regexp.Regexp {
	const tags = `(?:<[^>]+>)*`
	const space = `(?:<[^>]+>|\s)*`
	chars := make([]string, 0, len([]rune(key)))
	for _, char := range []rune(key) {
		chars = append(chars, regexp.QuoteMeta(string(char)))
	}
	pattern := `\{` + tags + `\{` + space + strings.Join(chars, tags) + space + `\}` + tags + `\}`
	return regexp.MustCompile(pattern)
}

// XMLEscape는 XML 특수 문자를 이스케이프합니다.
func XMLEscape(value string) string {
	replacer := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return replacer.Replace(value)
}

// fillMark는 치환한 자리를 잠깐 표시하는 글자다(XML에 쓸 수 없는 글자라 원래 내용과 겹치지 않음).
const fillMark = "\x00"

// dropFilledLineSegments는 치환자를 채운 문단의 줄 배치 기록(<hp:linesegarray>)만 지우고 표시를 없앤다.
// 한글은 이 기록이 없으면 줄 나눔을 다시 계산하므로, 글 길이가 바뀌어도 줄이 어긋나지 않는다(2026-11-10 사용자 결정).
// 같은 문단 안(다음 문단 시작·끝보다 앞)에 있는 기록만 지워, 표 안 문단 등 다른 문단은 그대로 둔다.
func dropFilledLineSegments(data []byte) []byte {
	const open, close = "<hp:linesegarray", "</hp:linesegarray>"
	rest := string(data)
	var out strings.Builder
	out.Grow(len(rest))
	for {
		index := strings.Index(rest, fillMark)
		if index < 0 {
			out.WriteString(rest)
			break
		}
		out.WriteString(rest[:index])
		rest = rest[index+len(fillMark):]
		segment := strings.Index(rest, open)
		paragraphEnd := strings.Index(rest, "</hp:p>")
		paragraphStart := strings.Index(rest, "<hp:p ")
		if segment < 0 || (paragraphEnd >= 0 && paragraphEnd < segment) || (paragraphStart >= 0 && paragraphStart < segment) {
			continue
		}
		tagEnd := strings.Index(rest[segment:], ">")
		if tagEnd < 0 {
			continue
		}
		if strings.HasSuffix(rest[segment:segment+tagEnd+1], "/>") {
			rest = rest[:segment] + rest[segment+tagEnd+1:]
			continue
		}
		closing := strings.Index(rest[segment:], close)
		if closing < 0 {
			continue
		}
		rest = rest[:segment] + rest[segment+closing+len(close):]
	}
	return []byte(out.String())
}
