package seating

import (
	"errors"
	"time"
)

// 진행이 막혔을 때 교사가 고르는 되살리기(다시 하기·건너뛰기)입니다.

// Recover는 저장 오류로 멈춘 회차를 교사가 안전하게 처리하도록 합니다.
// action은 재시도, 건너뛰기, 회차 종료 중 하나만 허용합니다.
func (s *SeatingServer) Recover(planID, action string) (SeatingSessionInfo, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	x := s.sessions[planID]
	if x == nil || x.closed {
		return SeatingSessionInfo{}, errors.New("진행 중인 QR 참여 회차가 없습니다")
	}
	if x.phase != "오류" {
		return SeatingSessionInfo{}, errors.New("오류 상태인 회차에서만 복구할 수 있습니다")
	}
	switch action {
	case "재시도":
		if x.recoveryStudentID == "" || x.recoverySeatID == "" {
			return SeatingSessionInfo{}, errors.New("다시 저장할 배정 정보가 없습니다. 현재 학생을 건너뛰거나 회차를 종료해 주세요")
		}
		if err := s.persistArrowAssignmentLocked(x, x.recoveryStudentID, x.recoverySeatID); err != nil {
			x.errorMessage = "좌석 저장을 다시 시도했지만 실패했습니다. 보관함 잠금 상태와 저장 공간을 확인해 주세요."
			return s.infoLocked(x)
		}
		s.completeRecoveredAssignmentLocked(x)
	case "건너뛰기":
		s.skipRecoveryLocked(x)
	case "회차 종료":
		x.ended = true
		x.errorMessage = "교사가 오류 복구 대신 이 회차를 종료했습니다. QR 참여와 타이머가 중단되었습니다."
		x.phase = "회차 종료"
	default:
		return SeatingSessionInfo{}, errors.New("지원하지 않는 오류 복구 방식입니다")
	}
	return s.infoLocked(x)
}

func (s *SeatingServer) beginAssignmentRecoveryLocked(x *seatingSession, kind, studentID, seatID string) {
	x.phase = "오류"
	x.errorMessage = "좌석 결과를 암호화 보관함에 저장하지 못했습니다. 재시도하거나 현재 학생을 건너뛸 수 있습니다."
	x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = kind, studentID, seatID
}

func (s *SeatingServer) clearRecoveryLocked(x *seatingSession) {
	x.errorMessage, x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = "", "", "", ""
}

func (s *SeatingServer) completeRecoveredAssignmentLocked(x *seatingSession) {
	studentID, seatID, kind := x.recoveryStudentID, x.recoverySeatID, x.recoveryKind
	x.assigned[studentID] = seatID
	delete(x.available, seatID)
	if kind == "가위바위보" || kind == "사다리타기" {
		s.recordPreferenceConfirmationLocked(x, studentID, seatID, x.preferencePriority)
	}
	x.pendingShot = nil
	x.turnEndsAt = time.Time{}
	x.resultEndsAt = time.Now().Add(5 * time.Second)
	if kind == "가위바위보" {
		x.contestIndex++
		x.phase = "가위바위보 결과"
	} else if kind == "사다리타기" {
		x.contestIndex++
		x.phase = "사다리 결과"
	} else if x.current+1 >= len(x.order) {
		x.lastShot, x.lastShotSeatID, x.phase = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID, "최종 결과 확인"
	} else {
		x.lastShot, x.lastShotSeatID, x.phase = x.joined[studentID]+" → "+x.seatLabels[seatID], seatID, "결과 확인"
	}
	s.clearRecoveryLocked(x)
}

func (s *SeatingServer) skipRecoveryLocked(x *seatingSession) {
	kind := x.recoveryKind
	x.pendingShot = nil
	x.turnEndsAt = time.Time{}
	x.resultEndsAt = time.Time{}
	if kind == "가위바위보" {
		x.contestIndex++
		x.phase = "가위바위보 결과"
		x.resultEndsAt = time.Now().Add(5 * time.Second)
	} else if kind == "사다리타기" {
		x.contestIndex++
		x.phase = "사다리 결과"
		x.resultEndsAt = time.Now().Add(5 * time.Second)
	} else if kind == "룰렛" {
		x.current++
		if x.current >= len(x.order) {
			x.phase = "배정 완료"
		} else {
			x.phase = "룰렛 시작 대기"
			x.turnStartsAt = time.Now().Add(5 * time.Second)
		}
	} else {
		x.phase = "회차 종료"
		x.ended = true
	}
	x.errorMessage = "교사가 현재 저장 오류 대상을 건너뛰었습니다."
	x.recoveryKind, x.recoveryStudentID, x.recoverySeatID = "", "", ""
}
