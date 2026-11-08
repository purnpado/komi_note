package seating

import "testing"

func TestResolveLadderContestAssignsDistinctLanesAndOneWinner(t *testing.T) {
	result, err := ResolveLadderContest([]string{"a", "b", "c"}, map[string][]int{
		"a": {1, 2, 3},
		"b": {1, 2, 3},
		"c": {2, 1, 3},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.LaneCount != 3 || result.WinnerID == "" || result.WinningEnd < 1 || result.WinningEnd > 3 {
		t.Fatalf("사다리 결과가 올바르지 않습니다: %#v", result)
	}
	seen := map[int]bool{}
	for _, lane := range result.StartByStudent {
		if lane < 1 || lane > 3 || seen[lane] {
			t.Fatalf("출발점 배정이 중복되었거나 범위를 벗어났습니다: %#v", result.StartByStudent)
		}
		seen[lane] = true
	}
	if result.EndByStudent[result.WinnerID] != result.WinningEnd {
		t.Fatalf("승리 도착점과 승자가 일치하지 않습니다: %#v", result)
	}
}

func TestResolveLadderContestKeepsUniqueFirstChoice(t *testing.T) {
	result, err := ResolveLadderContest([]string{"a", "b", "c"}, map[string][]int{
		"a": {1, 2, 3},
		"b": {2, 1, 3},
		"c": {2, 3, 1},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.StartByStudent["a"] != 1 {
		t.Fatalf("단독 1순위 출발점은 우선 확정되어야 합니다: %#v", result.StartByStudent)
	}
}

func TestLadderRungsFollowFixedAssignments(t *testing.T) {
	session := &seatingSession{
		order:               []string{"a", "b", "c"},
		ladderStarts:        map[string]int{"a": 2, "b": 3, "c": 1},
		ladderSeatByStudent: map[string]string{"a": "seat-3", "b": "seat-1", "c": "seat-2"},
	}
	rungs := ladderRungsForAssignments(session, []string{"seat-1", "seat-2", "seat-3"})
	if len(rungs) == 0 {
		t.Fatal("서버가 고정한 결과를 연결하는 사다리 가로선이 필요합니다")
	}
	if len(rungs) < 6*(len(session.order)-1) {
		t.Fatalf("랜덤 사다리는 결과 연결 외에도 읽을 수 있는 충분한 가로선을 가져야 합니다: %d", len(rungs))
	}
	for studentID, start := range session.ladderStarts {
		lane := start
		for _, rung := range rungs {
			if rung.Left == lane {
				lane++
			} else if rung.Left+1 == lane {
				lane--
			}
		}
		seatID := []string{"seat-1", "seat-2", "seat-3"}[lane-1]
		if seatID != session.ladderSeatByStudent[studentID] {
			t.Fatalf("%s: 사다리 도착=%s, 고정 결과=%s", studentID, seatID, session.ladderSeatByStudent[studentID])
		}
	}
}

func TestLadderSeatPoolKeepsJoinedFixedStudentSeat(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{
		order:      []string{"normal-a", "fixed", "normal-b", "normal-c"},
		joined:     map[string]string{"normal-a": "가", "fixed": "나", "normal-b": "다", "normal-c": "라"},
		fixed:      map[string]string{"fixed": "seat-20"},
		available:  map[string]bool{},
		seatLayout: map[string]SeatingSeat{},
		layoutMode: "격자형",
	}
	for index := 1; index <= 25; index++ {
		id := "seat-" + string(rune('a'+index))
		if index == 20 {
			id = "seat-20"
		}
		session.available[id] = true
		session.seatLayout[id] = SeatingSeat{ID: id, Row: index, Column: 1}
	}
	pool := server.ladderSeatIDsLocked(session)
	if len(pool) != len(session.order) || !containsSeatID(pool, "seat-20") {
		t.Fatalf("고정 학생의 실제 좌석이 사다리 도착점 묶음에 포함되어야 합니다: %#v", pool)
	}
}

func TestRouletteFixedStudentAlwaysTargetsTeacherSeat(t *testing.T) {
	server := &SeatingServer{}
	session := &seatingSession{
		order:     []string{"fixed-student"},
		fixed:     map[string]string{"fixed-student": "seat-20"},
		available: map[string]bool{"seat-1": true, "seat-20": true},
	}
	if err := server.queueArrowShotLocked(session); err != nil {
		t.Fatal(err)
	}
	if session.pendingShot == nil || session.pendingShot.targetID != "seat-20" {
		t.Fatalf("고정 학생은 룰렛 순서와 무관하게 교사용 고정 좌석으로 가야 합니다: %#v", session.pendingShot)
	}
}
