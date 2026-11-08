package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/xuri/excelize/v2"
)

// 이 도구는 실제 학생 정보 없이 수행평가 가져오기 화면을 검수하기 위한 가상 엑셀만 만듭니다.
func main() {
	output := flag.String("output", "수행평가_가상6명.xlsx", "생성할 가상 수행평가 엑셀 파일")
	flag.Parse()
	book := excelize.NewFile()
	defer func() { _ = book.Close() }()
	sheet := book.GetSheetName(0)
	rows := [][]any{
		{"과목", "반", "번호", "성명", "에너지 마을 설계", "친환경 자동차 제작"},
		{"", "", "", "", "만점(40)", "만점(60)"},
		{"", "", "", "", "점수", "점수"},
		{"기술·가정", "1", "1", "가온", 38, 56},
		{"기술·가정", "1", "2", "나래", 34, 52},
		{"기술·가정", "1", "3", "다온", 40, 60},
		{"기술·가정", "1", "4", "라온", 31, 48},
		{"기술·가정", "1", "5", "마루", 36, ""},
		{"기술·가정", "1", "6", "바다", "", 55},
	}
	for rowIndex, row := range rows {
		for columnIndex, value := range row {
			cell, _ := excelize.CoordinatesToCellName(columnIndex+1, rowIndex+1)
			if err := book.SetCellValue(sheet, cell, value); err != nil {
				fmt.Fprintln(os.Stderr, "가상 엑셀 셀을 만들지 못했습니다:", err)
				os.Exit(1)
			}
		}
	}
	for column, width := range map[string]float64{"A": 18, "B": 10, "C": 10, "D": 14, "E": 24, "F": 24} {
		if err := book.SetColWidth(sheet, column, column, width); err != nil {
			fmt.Fprintln(os.Stderr, "가상 엑셀 너비를 설정하지 못했습니다:", err)
			os.Exit(1)
		}
	}
	if err := book.SaveAs(*output); err != nil {
		fmt.Fprintln(os.Stderr, "가상 수행평가 엑셀을 저장하지 못했습니다:", err)
		os.Exit(1)
	}
	fmt.Println("가상 수행평가 엑셀 생성 완료:", *output)
}
