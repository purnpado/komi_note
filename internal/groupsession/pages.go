package groupsession

import _ "embed"

// 학생 휴대폰 화면. 회차 토큰만 넣고 실명·생년월일은 넣지 않는다.
//
//go:embed public/student.html
var studentPageHTML string
