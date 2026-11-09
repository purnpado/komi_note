package seating

import (
	"TeacherNote/internal/system"
	"encoding/base64"
	"errors"
	"fmt"
	"net"
	"sort"
	"strings"

	"github.com/skip2/go-qrcode"
)

// 교사 화면에 돌려줄 회차 정보와 배치도·이름 스냅숏 계산입니다.

func orderedPlanSeats(plan SeatingPlan) []SeatingSeat {
	seats := append([]SeatingSeat(nil), plan.Seats...)
	sort.Slice(seats, func(i, j int) bool {
		left, right := seats[i], seats[j]
		if plan.LayoutMode == "사용자 지정" {
			return left.Y < right.Y || (left.Y == right.Y && left.X < right.X)
		}
		return left.Row < right.Row || (left.Row == right.Row && left.Column < right.Column)
	})
	return seats
}

// Info는 현재 회차의 입장 인원과 진행 상태를 교사 화면에 반환합니다.
func (s *SeatingServer) Info(planID string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if x := s.sessions[planID]; x != nil && !x.closed {
		if x.ended {
			return s.infoLocked(x)
		}
		if x.paused {
			return s.infoLocked(x)
		}
		s.finishOrderShuffleLocked(x)
		// 전자칠판을 열지 않은 채 교사 화면만 보고 있어도 사다리 연출이 끝나면 다음 단계로 넘어간다.
		s.finishRandomLadderAnimationLocked(x)
		s.advanceResultLocked(x)
		s.advanceRPSLocked(x)
		s.advanceRPSResultLocked(x)
		s.advanceLadderLocked(x)
		s.advanceLadderResultLocked(x)
		s.openStudentTurnIfNeededLocked(x)
		s.startAutomaticRouletteIfNeededLocked(x)
		s.finishPendingShotLocked(x)
		s.advanceResultLocked(x)
		s.advanceRPSLocked(x)
		s.advanceRPSResultLocked(x)
		s.advanceLadderLocked(x)
		s.advanceLadderResultLocked(x)
		s.openStudentTurnIfNeededLocked(x)
		return s.infoLocked(x)
	}
	return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
}

func (s *SeatingServer) infoLocked(x *seatingSession) (SeatingSessionInfo, error) {
	address := system.LocalAddress(x.listener.Addr().(*net.TCPAddr).Port)
	url := "http://" + address + "/s/" + x.shortCode
	png, err := qrcode.Encode(url, qrcode.Medium, 280)
	if err != nil {
		return SeatingSessionInfo{}, err
	}
	currentIndex := x.current
	if x.drawMethod == "랜덤 사다리 배정" {
		currentIndex = x.ladderCurrent
	}
	current := ""
	if currentIndex < len(x.order) {
		current = x.joined[x.order[currentIndex]]
	}
	notice := "QR을 스캔해 번호·이름을 확인하면 회차 닉네임이 배정됩니다."
	if x.phase == "희망 자리 제출 준비" {
		notice = "입장이 마감되었습니다. 교사가 희망 자리 제출을 열면 학생이 1~3지망을 제출합니다."
	} else if x.phase == "희망 자리 제출" {
		notice = fmt.Sprintf("학생이 남은 좌석 중 %d지망까지 제출합니다. 현재 %d명이 제출했습니다.", x.preferenceLimit, len(x.preferences))
	} else if x.phase == "경쟁률 공개" {
		notice = fmt.Sprintf("%d지망 경쟁률을 공개했습니다. 경쟁 좌석 %d곳을 확인해 주세요.", x.preferencePriority, len(x.contests))
	} else if x.phase == "가위바위보 선택" {
		notice = "현재 토너먼트 대결 후보가 10초 안에 가위·바위·보를 선택합니다."
	} else if x.phase == "가위바위보 결과" {
		notice = "토너먼트 대결 결과와 다음 진출자를 확인하는 중입니다."
	} else if x.phase == "사다리 출발점 선택" && x.drawMethod == "랜덤 사다리 배정" {
		notice = "배정 순서대로 학생이 남은 사다리 출발점 번호 하나를 선택합니다. 모두 선택하면 교사가 사다리를 공개합니다."
	} else if x.phase == "사다리 출발점 선택" {
		notice = "현재 경쟁 후보가 10초 안에 사다리 출발점 선호 순위를 선택합니다."
	} else if x.phase == "사다리 결과" {
		notice = "사다리 경로와 승자를 전자칠판에서 확인하는 중입니다."
	} else if x.phase == "사다리 공개" {
		notice = "출발점 선택이 마감되었습니다. 교사가 한 명씩 사다리타기를 진행합니다."
	} else if x.phase == "사다리 연출" {
		notice = "현재 학생의 사다리 경로를 전자칠판에 표시하고 있습니다."
	} else if x.phase == "사다리 결과 확인" {
		notice = "도착 좌석을 확인했습니다. 교사가 다음 학생 사다리타기를 시작할 수 있습니다."
	} else if x.phase == "자리 확인" {
		notice = "모든 참여 학생의 자리가 확정되었습니다. 결과를 확인·조정한 뒤 전자칠판에 실명 배치도를 공개해 주세요."
	} else if x.phase == "배정 완료" {
		notice = "제출된 지망의 경쟁이 모두 끝났습니다. 결과를 확인·조정한 뒤 전자칠판에 실명 배치도를 공개해 주세요."
	} else if strings.HasSuffix(x.phase, "지망 처리 완료") {
		notice = fmt.Sprintf("%d차 배정의 %d지망 처리가 끝났습니다. 확정 결과를 확인한 뒤 다음 지망을 처리해 주세요.", x.preferenceCycle, x.preferencePriority)
	} else if x.phase == "다음 차 지망 제출 준비" {
		notice = fmt.Sprintf("%d차 배정의 1~%d지망 처리가 끝났습니다. 미배정 학생만 새 희망 자리를 제출합니다.", x.preferenceCycle, x.preferenceLimit)
	} else if x.phase == "순서 섞기" {
		notice = "5초 동안 입장 학생 순서를 섞은 뒤 최종 순서를 확정합니다."
	} else if x.phase == "룰렛 시작 준비" {
		notice = "교사가 룰렛 시작을 누르면 5초 뒤 첫 학생 차례가 열립니다."
	} else if x.phase == "룰렛 대기" {
		notice = "현재 학생이 5초 안에 룰렛을 돌립니다. 시간이 지나면 자동으로 시작합니다."
	} else if x.phase == "룰렛 시작 대기" {
		notice = "5초 뒤 다음 학생의 룰렛 차례를 엽니다."
	} else if x.phase == "룰렛 연출" {
		notice = "룰렛이 회전 중입니다. 멈추면 좌석을 저장합니다."
	} else if x.phase == "결과 확인" || x.phase == "최종 결과 확인" {
		notice = "확정된 자리 결과를 확인하는 중입니다. 잠시 뒤 다음 단계로 진행합니다."
	} else if x.phase == "오류" {
		notice = "저장 오류로 회차가 멈췄습니다. 교사가 복구 방식을 선택할 때까지 기다려 주세요."
	} else if x.phase == "회차 종료" {
		notice = "교사가 이 회차를 종료했습니다. 전자칠판 안내를 확인해 주세요."
	}
	currentSeat, candidates := "", []string{}
	if contest := s.currentContestLocked(x); contest != nil {
		currentSeat = x.seatLabels[contest.SeatID]
		for _, id := range contest.StudentIDs {
			candidates = append(candidates, x.joined[id])
		}
	}
	if x.paused {
		notice = "교사가 회차를 안전 일시정지했습니다. 교사 재개를 기다려 주세요."
	}
	return SeatingSessionInfo{PlanID: x.planID, Running: !x.ended, StudentURL: url, BoardURL: "http://" + address + "/board/" + x.boardToken, QRCodeDataURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), ParticipantCnt: len(x.joined), LadderSelectedCnt: len(x.ladderStarts), Phase: x.phase, CurrentNickname: current, Notice: notice, DrawMethod: x.drawMethod, CompetitionMethod: x.competitionMethod, PreferenceLimit: x.preferenceLimit, SubmittedCnt: len(x.preferences), ContestCnt: len(x.contests), CurrentPreferencePriority: x.preferencePriority, CurrentContestSeat: currentSeat, CurrentContestCandidates: candidates, Paused: x.paused, ErrorMessage: x.errorMessage, RosterCnt: x.rosterCount, PartialClosed: x.partialClose, NamesRevealed: x.namesRevealed}, nil
}

func (s *SeatingServer) fixedSeatsLocked(plan SeatingPlan) map[string]string {
	fixed := map[string]string{}
	if len(plan.FixedStudentIDs) == 0 {
		return fixed
	}
	plans, err := s.store.ListSeatingPlans()
	if err != nil {
		return fixed
	}
	wanted := map[string]bool{}
	for _, id := range plan.FixedStudentIDs {
		wanted[id] = true
	}
	currentSeats := orderedPlanSeats(plan)
	for _, previous := range plans {
		if previous.ID == plan.ID {
			continue
		}
		previousSeats := orderedPlanSeats(previous)
		for index, seat := range previousSeats {
			if wanted[seat.StudentID] && fixed[seat.StudentID] == "" {
				// 좌석 ID는 배치안마다 새로 생길 수 있으므로, 이전 배치의
				// 시각적 순서를 현재 배치의 같은 순서 좌석으로 안전하게 옮긴다.
				if index < len(currentSeats) {
					fixed[seat.StudentID] = currentSeats[index].ID
				}
			}
		}
	}
	return fixed
}

func (s *SeatingServer) finalNamesBySeatLocked(x *seatingSession) map[string]string {
	result := map[string]string{}
	students, err := s.store.ListStudents()
	if err != nil {
		return result
	}
	names := map[string]string{}
	for _, student := range students {
		names[student.ID] = student.Name
	}
	for studentID, seatID := range x.assigned {
		result[seatID] = names[studentID]
	}
	return result
}

func (s *SeatingServer) rouletteSnapshotLocked(x *seatingSession) []map[string]any {
	all := s.layoutSnapshotLocked(x)
	result := make([]map[string]any, 0, len(x.available))
	for _, seat := range all {
		if x.available[seat["id"].(string)] {
			result = append(result, seat)
		}
	}
	return result
}

func (s *SeatingServer) layoutSnapshotLocked(x *seatingSession) []map[string]any {
	ids := s.orderedSeatIDsLocked(x)
	reverse := map[string]string{}
	for studentID, seatID := range x.assigned {
		reverse[seatID] = x.joined[studentID]
	}
	result := make([]map[string]any, 0, len(ids))
	for index, id := range ids {
		seat := x.seatLayout[id]
		result = append(result, map[string]any{"id": id, "seatNumber": index + 1, "label": fmt.Sprintf("%d번", index+1), "rawLabel": fmt.Sprintf("%d번", index+1), "row": seat.Row, "column": seat.Column, "x": seat.X, "y": seat.Y, "displayOrder": index, "available": x.available[id], "nickname": reverse[id]})
	}
	return result
}

func (s *SeatingServer) orderedSeatIDsLocked(x *seatingSession) []string {
	ids := make([]string, 0, len(x.seatLayout))
	for id := range x.seatLayout {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		left, right := x.seatLayout[ids[i]], x.seatLayout[ids[j]]
		if x.layoutMode == "사용자 지정" {
			return left.Y < right.Y || (left.Y == right.Y && left.X < right.X)
		}
		return left.Row < right.Row || (left.Row == right.Row && left.Column < right.Column)
	})
	return ids
}
