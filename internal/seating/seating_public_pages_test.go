package seating

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testSeatingSession(t *testing.T) *seatingSession {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("테스트용 참여 서버를 열지 못했습니다: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })
	return &seatingSession{token: "student-token", boardToken: "board-token", shortCode: "ABC123", listener: listener}
}

// 학생 화면에는 실명이 담길 수 있는 전자칠판 토큰이 절대 들어가면 안 된다.
func TestStudentPageNeverContainsBoardToken(t *testing.T) {
	for _, method := range []string{"랜덤 룰렛 배정", "랜덤 사다리 배정", "희망 경쟁배정"} {
		x := testSeatingSession(t)
		x.drawMethod = method
		recorder := httptest.NewRecorder()
		(&SeatingServer{}).studentPage(x)(recorder, httptest.NewRequest(http.MethodGet, "/s/ABC123", nil))
		body := recorder.Body.String()
		if strings.Contains(body, "board-token") || strings.Contains(body, "/board-api/") {
			t.Fatalf("%s 학생 화면에 전자칠판 토큰이 포함됨", method)
		}
		if !strings.Contains(body, "const API='/api/student-token'") {
			t.Fatalf("%s 학생 화면에 학생 API 주소가 없음", method)
		}
		if strings.Contains(body, "__TOKEN__") || strings.Contains(body, "__BOARD_TOKEN__") {
			t.Fatalf("%s 학생 화면에 치환되지 않은 자리표시자가 남음", method)
		}
	}
}

func TestBoardPageUsesBoardTokenAndStudentAddress(t *testing.T) {
	x := testSeatingSession(t)
	x.drawMethod = "랜덤 룰렛 배정"
	recorder := httptest.NewRecorder()
	(&SeatingServer{}).boardPage(x)(recorder, httptest.NewRequest(http.MethodGet, "/board/board-token", nil))
	body := recorder.Body.String()
	for _, want := range []string{"const API='/board-api/board-token'", "QR='/api/student-token/qr'", "/s/ABC123"} {
		if !strings.Contains(body, want) {
			t.Fatalf("전자칠판 화면에 %q가 없음", want)
		}
	}
	if strings.Contains(body, "__STUDENT_URL__") || strings.Contains(body, "__BOARD_TOKEN__") {
		t.Fatal("전자칠판 화면에 치환되지 않은 자리표시자가 남음")
	}
}

// 전자칠판은 1600×900 무대를 화면에 맞춰 확대·축소하고, 세 방식의 장면을 모두 갖춰야 한다.
func TestBoardPageCoversEveryMethodAndScalesStage(t *testing.T) {
	for _, want := range []string{"function fit()", "Math.min(innerWidth/1600,innerHeight/900)", "entry:", "order:", "roulette:", "ladder:", "pref:", "rps:", "final:", "prefers-reduced-motion"} {
		if !strings.Contains(seatingBoardPageHTML, want) {
			t.Fatalf("전자칠판 화면 코드에 %q가 없음", want)
		}
	}
	// 학생 사이의 대기 단계에서 순서판으로 되돌아가지 않아야 한다(첫 학생 전에만 순서판).
	if !strings.Contains(seatingBoardPageHTML, "p==='룰렛 시작 대기'&&!(j.confirmedAssignments||[]).length") {
		t.Fatal("룰렛 학생 사이 대기 단계 처리 조건이 없음")
	}
}

func TestStudentPageSendsExpectedRequests(t *testing.T) {
	for _, want := range []string{"post('/login',{name,birthDate:birth})", "post('/arrow')", "post('/ladder',{start:ladderPick})", "post('/preferences',{seatIds:prefPicks})", "post('/rps',{choice:b.dataset.choice})"} {
		if !strings.Contains(seatingStudentPageHTML, want) {
			t.Fatalf("학생 화면 요청 코드에 %q가 없음", want)
		}
	}
}
