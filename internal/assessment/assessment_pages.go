package assessment

import (
	_ "embed"
	"html/template"
)

// 수행평가 QR 회차의 학생 휴대폰 화면과 전자칠판 화면입니다.
// 자리배정·설문·모둠처럼 HTML 파일을 실행 파일 안에 넣어 둡니다.

//go:embed public/student.html
var assessmentStudentHTML string

//go:embed public/board.html
var assessmentBoardHTML string

var (
	assessmentStudentTemplate = template.Must(template.New("assessment-student").Parse(assessmentStudentHTML))
	assessmentBoardTemplate   = template.Must(template.New("assessment-board").Parse(assessmentBoardHTML))
)
