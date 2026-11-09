import type { SeatingSessionView } from "./useSeatingSession";

type Actions = Record<
  | "openArrowSession"
  | "openPreferenceSubmission"
  | "closePreferenceSubmission"
  | "startRPSCompetition"
  | "advancePreferenceRound"
  | "startArrowAssignment"
  | "startSeatingRoulette"
  | "revealRandomLadder"
  | "advanceRandomLadder",
  () => unknown
> & { closeArrowEntry: (allowPartial?: boolean) => unknown };

/** 자리배정 회차 단계에 맞는 '다음 동작' 버튼 하나(문구·동작·잠금)를 고른다. 단계가 없으면 null. */
export function seatingExecutionAction(
  seatingSession: SeatingSessionView["seatingSession"],
  setPartialCloseOpen: (open: boolean) => void,
  {
    openArrowSession,
    closeArrowEntry,
    openPreferenceSubmission,
    closePreferenceSubmission,
    startRPSCompetition,
    advancePreferenceRound,
    startArrowAssignment,
    startSeatingRoulette,
    revealRandomLadder,
    advanceRandomLadder,
  }: Actions,
) {
  return !seatingSession
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
        ? seatingSession.phase === "희망 자리 제출 준비" || seatingSession.phase === "다음 차 지망 제출 준비"
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
                    label: seatingSession.phase === "사다리 공개" ? "첫 학생 사다리타기" : "다음 학생 사다리타기",
                    action: () => void advanceRandomLadder(),
                    disabled: false,
                  }
                : null;
}
