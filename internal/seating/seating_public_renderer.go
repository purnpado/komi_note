package seating

import (
	"net"
	"net/http"
	"strings"

	"TeacherNote/internal/system"
)

// seatingPublicPageData는 학생·전자칠판 공개 페이지에만 필요한 회차 정보를 묶는다.
// 실명, 생년월일, 보관함 경로 같은 개인정보는 포함하지 않는다.
type seatingPublicPageData struct {
	studentURL string
	token      string
	boardToken string
}

func seatingPublicPageDataFor(x *seatingSession) seatingPublicPageData {
	port := x.listener.Addr().(*net.TCPAddr).Port
	return seatingPublicPageData{
		studentURL: "http://" + system.LocalAddress(port) + "/s/" + x.shortCode,
		token:      x.token,
		boardToken: x.boardToken,
	}
}

func renderSeatingPublicTemplate(template string, data seatingPublicPageData) string {
	return strings.NewReplacer(
		"__TOKEN__", data.token,
		"__BOARD_TOKEN__", data.boardToken,
		"__STUDENT_URL__", data.studentURL,
	).Replace(template)
}

func writeSeatingPublicHTML(w http.ResponseWriter, html string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(html))
}
