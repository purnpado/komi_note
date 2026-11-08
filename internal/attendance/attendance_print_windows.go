//go:build windows

package attendance

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	deviceCapsHorzRes = 8
	deviceCapsVertRes = 10
	biRGB             = 0
	dibRGBColors      = 0
)

type docInfo struct {
	Size     int32
	Name     *uint16
	Output   *uint16
	DataType *uint16
	Flags    uint32
}

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

type bitmapInfo struct{ Header bitmapInfoHeader }

// PrintAttendanceImage는 GDI 프린터 장치에 직접 이미지를 그려 PDF 뷰어를 거치지 않습니다.
func PrintAttendanceImage(pageImage []byte) error {
	decoded, _, err := image.Decode(bytes.NewReader(pageImage))
	if err != nil {
		return errors.New("인쇄할 출결 서류 이미지를 읽지 못했습니다")
	}
	bounds := decoded.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	if width <= 0 || height <= 0 {
		return errors.New("인쇄할 출결 서류 크기가 올바르지 않습니다")
	}
	pixels := make([]byte, width*height*4)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			r, g, b, a := decoded.At(bounds.Min.X+x, bounds.Min.Y+y).RGBA()
			alpha := uint32(a)
			r = uint32(r) + (0xffff-uint32(r))*(0xffff-alpha)/0xffff
			g = uint32(g) + (0xffff-uint32(g))*(0xffff-alpha)/0xffff
			b = uint32(b) + (0xffff-uint32(b))*(0xffff-alpha)/0xffff
			offset := (y*width + x) * 4
			pixels[offset] = byte(b >> 8)
			pixels[offset+1] = byte(g >> 8)
			pixels[offset+2] = byte(r >> 8)
			pixels[offset+3] = 0
		}
	}
	gdi32 := windows.NewLazySystemDLL("gdi32.dll")
	winspool := windows.NewLazySystemDLL("winspool.drv")
	getDefaultPrinter := winspool.NewProc("GetDefaultPrinterW")
	createDC := gdi32.NewProc("CreateDCW")
	getDeviceCaps := gdi32.NewProc("GetDeviceCaps")
	startDoc := gdi32.NewProc("StartDocW")
	startPage := gdi32.NewProc("StartPage")
	stretchDIBits := gdi32.NewProc("StretchDIBits")
	endPage := gdi32.NewProc("EndPage")
	endDoc := gdi32.NewProc("EndDoc")
	deleteDC := gdi32.NewProc("DeleteDC")
	driver, _ := windows.UTF16PtrFromString("WINSPOOL")
	var nameLength uint32
	getDefaultPrinter.Call(0, uintptr(unsafe.Pointer(&nameLength)))
	if nameLength == 0 {
		return errors.New("기본 프린터가 설정되어 있지 않습니다. Windows 설정에서 기본 프린터를 먼저 선택해 주세요")
	}
	printerName := make([]uint16, nameLength)
	if result, _, callErr := getDefaultPrinter.Call(uintptr(unsafe.Pointer(&printerName[0])), uintptr(unsafe.Pointer(&nameLength))); result == 0 {
		return fmt.Errorf("기본 프린터 이름을 읽지 못했습니다: %w", callErr)
	}
	hdc, _, callErr := createDC.Call(uintptr(unsafe.Pointer(driver)), uintptr(unsafe.Pointer(&printerName[0])), 0, 0)
	if hdc == 0 {
		return fmt.Errorf("기본 프린터를 열지 못했습니다: %w", callErr)
	}
	defer deleteDC.Call(hdc)
	pageWidth, _, _ := getDeviceCaps.Call(hdc, deviceCapsHorzRes)
	pageHeight, _, _ := getDeviceCaps.Call(hdc, deviceCapsVertRes)
	if pageWidth == 0 || pageHeight == 0 {
		return errors.New("기본 프린터의 용지 정보를 읽지 못했습니다")
	}
	docName, _ := windows.UTF16PtrFromString("꼬미노트 출결 서류")
	info := docInfo{Size: int32(unsafe.Sizeof(docInfo{})), Name: docName}
	started, _, callErr := startDoc.Call(hdc, uintptr(unsafe.Pointer(&info)))
	if int32(started) <= 0 {
		return fmt.Errorf("인쇄 작업을 시작하지 못했습니다: %w", callErr)
	}
	defer endDoc.Call(hdc)
	if result, _, callErr := startPage.Call(hdc); int32(result) <= 0 {
		return fmt.Errorf("인쇄 페이지를 시작하지 못했습니다: %w", callErr)
	}
	infoHeader := bitmapInfo{Header: bitmapInfoHeader{Size: uint32(unsafe.Sizeof(bitmapInfoHeader{})), Width: int32(width), Height: -int32(height), Planes: 1, BitCount: 32, Compression: biRGB, SizeImage: uint32(len(pixels))}}
	scale := min(float64(pageWidth)/float64(width), float64(pageHeight)/float64(height))
	drawWidth, drawHeight := int(float64(width)*scale), int(float64(height)*scale)
	x, y := (int(pageWidth)-drawWidth)/2, (int(pageHeight)-drawHeight)/2
	result, _, callErr := stretchDIBits.Call(hdc, uintptr(x), uintptr(y), uintptr(drawWidth), uintptr(drawHeight), 0, 0, uintptr(width), uintptr(height), uintptr(unsafe.Pointer(&pixels[0])), uintptr(unsafe.Pointer(&infoHeader)), dibRGBColors, 0x00CC0020)
	if result == 0xffffffff {
		return fmt.Errorf("출결 서류를 프린터에 그리지 못했습니다: %w", callErr)
	}
	if result, _, callErr := endPage.Call(hdc); int32(result) <= 0 {
		return fmt.Errorf("인쇄 페이지를 마치지 못했습니다: %w", callErr)
	}
	return nil
}
