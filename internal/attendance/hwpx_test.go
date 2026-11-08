package attendance

import (
	"archive/zip"
	"bytes"
	"io"
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

