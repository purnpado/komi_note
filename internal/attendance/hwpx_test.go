package attendance

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"
)

func TestReplaceAttendanceHWPXReplacesSplitMarkerAndReportsRemaining(t *testing.T) {
	var source bytes.Buffer
	writer := zip.NewWriter(&source)
	entry, err := writer.Create("Contents/section0.xml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte(`<hp:t>{{이</hp:t><hp:t>름}}</hp:t><hp:t>{{미입력}}</hp:t>`)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	result, unresolved, err := ReplaceAttendanceHWPX(source.Bytes(), map[string]string{"이름": "가&나"})
	if err != nil {
		t.Fatal(err)
	}
	if len(unresolved) != 1 || unresolved[0] != "미입력" {
		t.Fatalf("남은 치환자 목록이 올바르지 않습니다: %#v", unresolved)
	}
	reader, err := zip.NewReader(bytes.NewReader(result), int64(len(result)))
	if err != nil {
		t.Fatal(err)
	}
	stream, err := reader.File[0].Open()
	if err != nil {
		t.Fatal(err)
	}
	defer stream.Close()
	data, err := io.ReadAll(stream)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `<hp:t>가&amp;나</hp:t><hp:t>{{미입력}}</hp:t>` {
		t.Fatalf("HWPX XML 치환 결과가 올바르지 않습니다: %s", data)
	}
}

func TestAttendanceHWPXContainsMarkerFindsSplitMarker(t *testing.T) {
	var source bytes.Buffer
	writer := zip.NewWriter(&source)
	entry, err := writer.Create("Contents/section0.xml")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte(`<hp:t>{{보호</hp:t><hp:t>자성명}}</hp:t>`)); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	hasMarker, err := AttendanceHWPXContainsMarker(source.Bytes(), "보호자성명")
	if err != nil || !hasMarker {
		t.Fatalf("분리된 보호자성명 치환자를 찾지 못했습니다: %v, %v", hasMarker, err)
	}
}

// 치환자를 채운 문단의 줄 배치 기록만 지우고, 다른 문단(표 안 문단 포함)은 그대로 둔다(2026-11-10).
func TestReplaceAttendanceHWPXDropsLineSegmentsOnlyInFilledParagraphs(t *testing.T) {
	section := `<hp:p id="1"><hp:run><hp:t>성명 : {{이름}} / {{번호}}</hp:t></hp:run><hp:linesegarray><hp:lineseg a="1"/></hp:linesegarray></hp:p>` +
		`<hp:p id="2"><hp:run><hp:t>바뀌지 않는 문단</hp:t></hp:run><hp:linesegarray><hp:lineseg a="2"/></hp:linesegarray></hp:p>` +
		`<hp:p id="3"><hp:run><hp:t>표 앞 {{이름}}</hp:t><hp:tbl><hp:tc><hp:p id="4"><hp:run><hp:t>칸</hp:t></hp:run><hp:linesegarray><hp:lineseg a="4"/></hp:linesegarray></hp:p></hp:tc></hp:tbl></hp:run><hp:linesegarray><hp:lineseg a="3"/></hp:linesegarray></hp:p>`
	var source bytes.Buffer
	writer := zip.NewWriter(&source)
	entry, _ := writer.Create("Contents/section0.xml")
	entry.Write([]byte(section))
	writer.Close()
	result, _, err := ReplaceAttendanceHWPX(source.Bytes(), map[string]string{"이름": "가온", "번호": "7"})
	if err != nil {
		t.Fatal(err)
	}
	reader, _ := zip.NewReader(bytes.NewReader(result), int64(len(result)))
	stream, _ := reader.File[0].Open()
	data, _ := io.ReadAll(stream)
	got := string(data)
	if strings.Contains(got, `a="1"`) {
		t.Fatalf("채운 문단(1)의 줄 배치 기록은 지워야 합니다: %s", got)
	}
	if !strings.Contains(got, `a="2"`) || !strings.Contains(got, `a="4"`) {
		t.Fatalf("채우지 않은 문단(2)과 표 안 문단(4)의 기록은 남아야 합니다: %s", got)
	}
	if !strings.Contains(got, `a="3"`) {
		t.Fatalf("표가 끼어 있는 문단(3)은 안전하게 그대로 둡니다: %s", got)
	}
	if strings.Contains(got, "\x00") || !strings.Contains(got, "성명 : 가온 / 7") {
		t.Fatalf("치환 결과가 올바르지 않습니다: %s", got)
	}
}

func TestAttendanceMarkTokens(t *testing.T) {
	values := AttendanceMarkTokens(AttendanceEntry{Status: "지각", ReasonCategory: "질병", Period: "1~2교시"})
	if values["질병표시"] != "○" || values["기타표시"] != "" || values["지각표시"] != "○" || values["결석표시"] != "" {
		t.Fatalf("표시 치환자: %v", values)
	}
	if values["시작교시"] != "1" || values["종료교시"] != "2" {
		t.Fatalf("교시 나누기: %v", values)
	}
	if one := AttendanceMarkTokens(AttendanceEntry{Period: "3교시"}); one["시작교시"] != "3" || one["종료교시"] != "3" {
		t.Fatalf("한 교시: %v", one)
	}
}
