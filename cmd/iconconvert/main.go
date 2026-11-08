package main

import (
	"encoding/binary"
	"fmt"
	"os"
)

// PNG를 포함하는 단일 이미지 ICO 파일을 만든다.
func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "사용법: iconconvert 입력.png 출력.ico")
		os.Exit(2)
	}
	png, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	if len(png) < 8 || string(png[:8]) != "\x89PNG\r\n\x1a\n" {
		panic("PNG 파일이 아닙니다")
	}
	// ICO 헤더 6바이트 + 이미지 목록 16바이트 뒤에 PNG 원본을 넣는다.
	result := make([]byte, 22+len(png))
	binary.LittleEndian.PutUint16(result[2:4], 1)
	binary.LittleEndian.PutUint16(result[4:6], 1)
	result[6] = 0 // 256px 이상은 ICO 규격상 0으로 표시한다.
	result[7] = 0
	binary.LittleEndian.PutUint16(result[10:12], 1)
	binary.LittleEndian.PutUint16(result[12:14], 32)
	binary.LittleEndian.PutUint32(result[14:18], uint32(len(png)))
	binary.LittleEndian.PutUint32(result[18:22], 22)
	copy(result[22:], png)
	if err := os.WriteFile(os.Args[2], result, 0o644); err != nil {
		panic(err)
	}
}
