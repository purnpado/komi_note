package attendance

import (
	"bytes"
	"fmt"

	"github.com/phpdave11/gofpdf"
)

// WriteAttendancePDF는 단일 페이지 이미지를 A4 크기 PDF 파일로 변환하여 저장합니다.
func WriteAttendancePDF(pageImage []byte, path string) error {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()
	pdf.RegisterImageOptionsReader("attendance-page", gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: true}, bytes.NewReader(pageImage))
	pdf.ImageOptions("attendance-page", 0, 0, 210, 297, false, gofpdf.ImageOptions{ImageType: "PNG", ReadDpi: true}, 0, "")
	if err := pdf.Error(); err != nil {
		return fmt.Errorf("PDF를 만들지 못했습니다: %w", err)
	}
	if err := pdf.OutputFileAndClose(path); err != nil {
		return fmt.Errorf("PDF를 저장하지 못했습니다: %w", err)
	}
	return nil
}

