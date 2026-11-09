import { main as models } from "../../../wailsjs/go/models";
import { AdvanceRandomLadder, AdvanceSeatingPreferenceRound, CloseSeatingEntry, CloseSeatingPreferenceSubmission, OpenSeatingPreferenceSubmission, RecoverSeatingSession, RevealRandomLadder, RevealSeatingNames, SaveSeatingPlan, StartRandomArrowAssignment, StartSeatingRPSCompetition, StartSeatingRoulette, StartSeatingSession, StopSeatingSession, SwapSeatingSeats } from "../../../wailsjs/go/main/App";
import { copyText } from "../shared/desktopActions";
import { makeSeats, seatsForRoster } from "./seatLayout";
import { errorMessage } from "../shared/format";
import type { SeatingSessionView } from "./useSeatingSession";

/** useSeatingSession에서 떼어 낸 처리 함수 묶음(훅 없음). 상태는 view로 받는다. */
export function seatingSessionActions(view: SeatingSessionView) {
  const { seatingSession, setSeatingSession, setPartialCloseOpen, setRevealDialogOpen, setCloseSessionOpen, selectedID, setSelectedID, title, rows, columns, layoutMode, deskPosition, placementMode, drawMethod, competitionMethod, preventPreviousSeat, preventPreviousPartner, canUseFixedSeats, fixedStudentIDs, seats, setSeats, plans, setPlans, students, setNotice, sessionState, setSessionState, setParticipationMode, setCurrentRound } = view;
  async function openArrowSession() {
    try {
      const savedSeats = seatsForRoster(seats, students.length, layoutMode);
      const saved = await SaveSeatingPlan(
        new models.SeatingPlan({
          id: selectedID,
          title,
          rows,
          columns,
          layoutMode,
          deskPosition,
          placementMode,
          drawMethod,
          competitionMethod,
          preventPreviousSeat,
          preventPreviousPartner,
          fixedStudentIds: canUseFixedSeats ? fixedStudentIDs : [],
          participationMode:
            drawMethod === "희망 경쟁배정"
              ? "QR 희망 경쟁"
              : drawMethod === "랜덤 사다리 배정"
                ? "QR 랜덤 사다리"
                : "QR 랜덤 룰렛",
          sessionState: "QR 입장 대기",
          currentRound: 1,
          seats: savedSeats,
        }),
      );
      const next = plans.filter((item) => item.id !== saved.id);
      next.unshift(new models.SeatingPlan(saved));
      setPlans(next);
      setSelectedID(saved.id);
      setSeats(savedSeats);
      setParticipationMode(
        drawMethod === "희망 경쟁배정"
          ? "QR 희망 경쟁"
          : drawMethod === "랜덤 사다리 배정"
            ? "QR 랜덤 사다리"
            : "QR 랜덤 룰렛",
      );
      setSessionState("QR 입장 대기");
      setCurrentRound(1);
      setSeatingSession(null);
      const session = await StartSeatingSession(saved.id);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice(
        drawMethod === "희망 경쟁배정"
          ? "QR 희망 경쟁 회차를 열었습니다. 학생 입장 뒤 지망 접수를 열어 주세요."
          : "QR 참여 회차를 열었습니다. 학생 입장 뒤 순서 섞기를 시작하세요.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function startArrowAssignment() {
    if (!selectedID) {
      setNotice("먼저 QR 참여 회차를 열어 주세요.");
      return;
    }
    try {
      const session = await StartRandomArrowAssignment(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setSessionState(
        drawMethod === "랜덤 사다리 배정" ? "랜덤 사다리 순서 섞기" : "랜덤 룰렛 순서 섞기",
      );
      setNotice(
        drawMethod === "랜덤 사다리 배정"
          ? "5초 동안 학생 순서를 섞습니다. 이후 학생이 순서대로 사다리 출발점을 선택합니다."
          : "5초 동안 학생 순서를 섞습니다. 순서가 확정되면 룰렛 시작 버튼을 눌러 주세요.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function startSeatingRoulette() {
    if (!selectedID) return;
    try {
      const session = await StartSeatingRoulette(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice("5초 뒤 첫 학생의 룰렛 차례가 열립니다. 이후에도 학생 사이에 5초 간격을 둡니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function revealRandomLadder() {
    if (!selectedID) return;
    try {
      const session = await RevealRandomLadder(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice("출발점 선택을 마감하고 사다리를 공개했습니다. 교사가 한 명씩 진행해 주세요.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function advanceRandomLadder() {
    if (!selectedID) return;
    try {
      const session = await AdvanceRandomLadder(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice("학생 한 명의 사다리 경로를 공개했습니다. 결과를 확인한 뒤 다음 학생을 진행해 주세요.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function closeArrowEntry(allowPartial = false) {
    if (!selectedID) return;
    try {
      const session = await CloseSeatingEntry(selectedID, allowPartial);
      setPartialCloseOpen(false);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setSessionState("입장 마감");
      setNotice(
        drawMethod === "희망 경쟁배정"
          ? `학생 ${session.participantCnt}명의 입장을 마감했습니다${session.partialClosed ? `(재적 ${session.rosterCnt}명 중 결석·미참여 ${session.rosterCnt - session.participantCnt}명 예외 마감)` : ""}. 희망 자리 제출을 열어 주세요.`
          : `학생 ${session.participantCnt}명의 입장을 마감했습니다${session.partialClosed ? `(재적 ${session.rosterCnt}명 중 결석·미참여 ${session.rosterCnt - session.participantCnt}명 예외 마감)` : ""}. 순서를 섞은 뒤 ${drawMethod === "랜덤 사다리 배정" ? "사다리 출발점 선택" : "룰렛배정"}을 시작하세요.`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function openPreferenceSubmission() {
    if (!selectedID) return;
    try {
      const session = await OpenSeatingPreferenceSubmission(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice(`학생 기기에서 ${session.preferenceLimit}지망까지 희망 자리를 제출할 수 있습니다.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function closePreferenceSubmission() {
    if (!selectedID) return;
    try {
      const session = await CloseSeatingPreferenceSubmission(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice(`지망 접수를 마감했습니다. ${session.contestCnt}개 좌석의 1지망 경쟁률을 공개합니다.`);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function startRPSCompetition() {
    if (!selectedID) return;
    try {
      const session = await StartSeatingRPSCompetition(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice(
        session.competitionMethod === "사다리타기"
          ? "현재 좌석의 후보 학생이 10초 안에 사다리 출발점 선호 순위를 선택합니다."
          : "무작위 토너먼트 대진표를 만들었습니다. 후보 학생이 10초 안에 가위·바위·보를 선택합니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function advancePreferenceRound() {
    if (!selectedID) return;
    try {
      const session = await AdvanceSeatingPreferenceRound(selectedID);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setNotice(
        session.phase === "배정 완료"
          ? "제출한 모든 지망 처리가 끝났습니다."
          : session.phase === "다음 차 지망 제출 준비"
            ? "1~3지망 처리가 끝났습니다. 미배정 학생만 다음 차 희망 자리를 제출합니다."
            : `${session.currentPreferencePriority}지망 처리를 시작했습니다.`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function revealSeatingNames(reveal: boolean) {
    if (!selectedID) return;
    try {
      const session = await RevealSeatingNames(selectedID, reveal);
      setSeatingSession(new models.SeatingSessionInfo(session));
      setRevealDialogOpen(false);
      setNotice(
        reveal
          ? "전자칠판에 실명 배치도를 공개했습니다. 학생 휴대폰에는 계속 이름이 보이지 않습니다."
          : "전자칠판의 실명을 다시 가렸습니다. 지금은 좌석 번호와 닉네임만 보입니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  // 결과에서 두 자리를 맞바꾸고, 저장된 배치안으로 화면을 다시 맞춘다.
  async function swapSeats(firstSeatID: string, secondSeatID: string) {
    if (!selectedID) return false;
    try {
      const saved = new models.SeatingPlan(await SwapSeatingSeats(selectedID, firstSeatID, secondSeatID));
      setPlans(plans.map((item) => (item.id === saved.id ? saved : item)));
      const isCustomLayout = saved.layoutMode === "사용자 지정";
      setSeats(
        isCustomLayout
          ? [...(saved.seats || [])]
          : makeSeats(saved.rows || 4, saved.columns || 6, saved.seats || []),
      );
      const last = saved.changes?.[saved.changes.length - 1];
      setNotice(last ? `${last.summary} · 보관함에 저장했습니다.` : "자리를 바꿨습니다.");
      return true;
    } catch (error) {
      setNotice(errorMessage(error));
      return false;
    }
  }

  async function stopArrowSession() {
    if (!selectedID) return;
    try {
      await StopSeatingSession(selectedID);
      setCloseSessionOpen(false);
      setSeatingSession(null);
      setSessionState("교사 최종 발표 준비");
      setNotice("QR 참여 회차를 닫고 임시 접속 정보를 폐기했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function recoverSeatingSession(action: "재시도" | "건너뛰기" | "회차 종료") {
    if (!selectedID) return;
    try {
      const session = await RecoverSeatingSession(selectedID, action);
      setSeatingSession(new models.SeatingSessionInfo(session));
      if (action === "재시도") setNotice("좌석 결과 저장을 다시 시도했습니다.");
      if (action === "건너뛰기") setNotice("현재 학생을 배정하지 않고 다음 단계로 넘겼습니다.");
      if (action === "회차 종료") setNotice("오류 회차를 종료했습니다. 필요하면 회차 닫기로 QR 정보를 폐기해 주세요.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function copyStudentAddress() {
    if (!seatingSession?.studentUrl) return;
    try {
      await copyText(seatingSession.studentUrl);
      setNotice("학생 입장 주소를 복사했습니다.");
    } catch {
      setNotice("주소 복사에 실패했습니다. 주소를 길게 눌러 복사해 주세요.");
    }
  }

  const sessionPhase = seatingSession?.phase || "회차를 열어 주세요";
  const executionAction = !seatingSession
    ? {
        label: "QR 회차 열기",
        action: () => void openArrowSession(),
        disabled: false,
      }
    : seatingSession.phase === "입장 대기"
      ? seatingSession.rosterCnt > 0 && seatingSession.participantCnt < seatingSession.rosterCnt
        ? {
            label: `입장 마감 (${seatingSession.participantCnt}/${seatingSession.rosterCnt}명 입장)`,
            action: () => setPartialCloseOpen(true),
            disabled: seatingSession.participantCnt === 0,
          }
        : {
            label: "입장 마감",
            action: () => void closeArrowEntry(false),
            disabled: false,
          }
      : seatingSession.drawMethod === "희망 경쟁배정"
        ? seatingSession.phase === "희망 자리 제출 준비" ||
          seatingSession.phase === "다음 차 지망 제출 준비"
          ? {
              label:
                seatingSession.phase === "다음 차 지망 제출 준비"
                  ? `${seatingSession.currentPreferencePriority + 1}차 배정 희망 자리 제출 열기`
                  : "희망 자리 제출 열기",
              action: () => void openPreferenceSubmission(),
              disabled: false,
            }
          : seatingSession.phase === "희망 자리 제출"
            ? {
                label: "지망 접수 마감·경쟁률 공개",
                action: () => void closePreferenceSubmission(),
                disabled: false,
              }
            : seatingSession.phase === "경쟁률 공개"
              ? {
                  label: "가위바위보 토너먼트 시작",
                  action: () => void startRPSCompetition(),
                  disabled: false,
                }
              : /^\d+지망 처리 완료$/.test(seatingSession.phase)
                ? {
                    label:
                      seatingSession.currentPreferencePriority >= seatingSession.preferenceLimit
                        ? "다음 차 희망 자리 제출 준비"
                        : `${seatingSession.currentPreferencePriority + 1}지망 처리 진행`,
                    action: () => void advancePreferenceRound(),
                    disabled: false,
                  }
                : null
        : seatingSession.phase === "입장 마감"
          ? {
              label: "순서 섞기",
              action: () => void startArrowAssignment(),
              disabled: false,
            }
          : seatingSession.phase === "룰렛 시작 준비"
            ? {
                label: "룰렛 시작",
                action: () => void startSeatingRoulette(),
                disabled: false,
              }
            : seatingSession.phase === "사다리 출발점 선택"
              ? {
                  label:
                    seatingSession.ladderSelectedCnt >= seatingSession.participantCnt
                      ? "출발점 마감·사다리 공개"
                      : `출발점 선택 ${seatingSession.ladderSelectedCnt}/${seatingSession.participantCnt} 완료`,
                  action: () => void revealRandomLadder(),
                  disabled: seatingSession.ladderSelectedCnt < seatingSession.participantCnt,
                }
              : ["사다리 공개", "사다리 결과 확인"].includes(seatingSession.phase)
                ? {
                    label:
                      seatingSession.phase === "사다리 공개"
                        ? "첫 학생 사다리타기"
                        : "다음 학생 사다리타기",
                    action: () => void advanceRandomLadder(),
                    disabled: false,
                  }
                : null;

  return { openArrowSession, startArrowAssignment, startSeatingRoulette, revealRandomLadder, advanceRandomLadder, closeArrowEntry, openPreferenceSubmission, closePreferenceSubmission, startRPSCompetition, advancePreferenceRound, revealSeatingNames, swapSeats, stopArrowSession, recoverSeatingSession, copyStudentAddress, sessionPhase, executionAction };
}
