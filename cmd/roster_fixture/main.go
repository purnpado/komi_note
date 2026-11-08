// 명렬표 시험 자료 생성기는 개인정보가 없는 25명 가상 명렬표를 만듭니다.
package main

import (
	"flag"
	"fmt"
	"log"
	"path/filepath"

	"github.com/xuri/excelize/v2"
)

type student struct{ name, gender, birthDate, address string }

func main() {
	input := flag.String("input", "학생명렬표.xlsx", "열 구조를 가져올 명렬표 파일")
	output := flag.String("output", "학생명렬표_가상25명.xlsx", "생성할 가상 명렬표 파일")
	flag.Parse()
	workbook, err := excelize.OpenFile(*input)
	if err != nil {
		log.Fatalf("명렬표를 열지 못했습니다: %v", err)
	}
	defer func() { _ = workbook.Close() }()
	sheets := workbook.GetSheetList()
	if len(sheets) == 0 {
		log.Fatal("명렬표에 시트가 없습니다")
	}
	sheet := sheets[0]
	if err := clearStudentRows(workbook, sheet); err != nil {
		log.Fatalf("기존 학생 행을 비우지 못했습니다: %v", err)
	}
	for index, header := range []string{"학년", "반", "번호", "성명", "성별", "생년월일", "주소"} {
		if err := workbook.SetCellValue(sheet, fmt.Sprintf("%c1", 'A'+index), header); err != nil {
			log.Fatalf("명렬표 헤더를 저장하지 못했습니다: %v", err)
		}
	}
	for index, value := range fixtureStudents {
		row := index + 2
		values := map[string]any{fmt.Sprintf("A%d", row): "2", fmt.Sprintf("B%d", row): "1", fmt.Sprintf("C%d", row): index + 1, fmt.Sprintf("D%d", row): value.name, fmt.Sprintf("E%d", row): value.gender, fmt.Sprintf("F%d", row): value.birthDate, fmt.Sprintf("G%d", row): value.address}
		for cell, cellValue := range values {
			if err := workbook.SetCellValue(sheet, cell, cellValue); err != nil {
				log.Fatalf("%s 셀을 저장하지 못했습니다: %v", cell, err)
			}
		}
	}
	if err := workbook.SaveAs(*output); err != nil {
		log.Fatalf("가상 명렬표를 저장하지 못했습니다: %v", err)
	}
	fmt.Printf("25명 가상 명렬표를 만들었습니다: %s\n", filepath.Clean(*output))
}

func clearStudentRows(workbook *excelize.File, sheet string) error {
	rows, err := workbook.GetRows(sheet)
	if err != nil {
		return err
	}
	for row := 2; row <= len(rows)+1; row++ {
		for _, column := range []string{"A", "B", "C", "D", "E", "F", "G"} {
			if err := workbook.SetCellValue(sheet, fmt.Sprintf("%s%d", column, row), ""); err != nil {
				return err
			}
		}
	}
	return nil
}

var fixtureStudents = []student{
	{"가온", "여", "2012-01-15", "가상시 가온구 새봄로 101"}, {"나래", "남", "2012-02-27", "가상시 나래구 푸른길 102"}, {"다온", "여", "2012-03-08", "가상시 다온구 햇살로 103"}, {"라온", "남", "2012-04-19", "가상시 라온구 느티길 104"}, {"마루", "여", "2012-05-30", "가상시 마루구 별빛로 105"},
	{"바다", "남", "2012-06-12", "가상시 바다구 구름길 106"}, {"새봄", "여", "2012-07-24", "가상시 새봄구 풀잎로 107"}, {"아람", "남", "2012-08-05", "가상시 아람구 은하길 108"}, {"여울", "여", "2012-09-16", "가상시 여울구 솔바람로 109"}, {"이든", "남", "2012-10-07", "가상시 이든구 한들길 110"},
	{"자람", "여", "2012-10-08", "가상시 자람구 샘물로 111"}, {"차온", "남", "2012-11-29", "가상시 차온구 새싹길 112"}, {"하린", "여", "2012-12-10", "가상시 하린구 들꽃로 113"}, {"도담", "남", "2012-01-21", "가상시 도담구 물결길 114"}, {"로운", "여", "2012-02-02", "가상시 로운구 해솔로 115"},
	{"시온", "남", "2012-03-13", "가상시 시온구 초록길 116"}, {"유담", "여", "2012-04-25", "가상시 유담구 노을로 117"}, {"주원", "남", "2012-05-06", "가상시 주원구 오름길 118"}, {"태린", "여", "2012-06-17", "가상시 태린구 숲길 119"}, {"하율", "남", "2012-07-28", "가상시 하율구 봄빛로 120"},
	{"윤슬", "여", "2012-08-09", "가상시 윤슬구 달빛길 121"}, {"지안", "남", "2012-09-20", "가상시 지안구 온새미로 122"}, {"초롱", "여", "2012-10-31", "가상시 초롱구 푸름길 123"}, {"키움", "남", "2012-11-11", "가상시 키움구 누리로 124"}, {"한결", "여", "2012-12-22", "가상시 한결구 맑은길 125"},
}
