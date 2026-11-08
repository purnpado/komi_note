package seating

import _ "embed"

// 학생 휴대폰과 전자칠판 화면은 별도 HTML 파일로 관리한다.
// 세 배정 방식(랜덤 룰렛·랜덤 사다리·희망 경쟁)을 한 화면이 단계별로 바꿔 그린다.

//go:embed public/board.html
var seatingBoardPageHTML string

//go:embed public/student.html
var seatingStudentPageHTML string

// renderSeatingBoardPage는 전자칠판 화면에 회차 주소와 전자칠판 전용 토큰을 넣는다.
func renderSeatingBoardPage(data seatingPublicPageData) string {
	return renderSeatingPublicTemplate(seatingBoardPageHTML, data)
}

// renderSeatingStudentPage는 학생 화면을 만든다. 실명이 포함될 수 있는 전자칠판 토큰은 넣지 않는다.
func renderSeatingStudentPage(data seatingPublicPageData) string {
	data.boardToken = ""
	return renderSeatingPublicTemplate(seatingStudentPageHTML, data)
}
