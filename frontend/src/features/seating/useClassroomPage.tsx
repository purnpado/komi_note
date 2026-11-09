import { useEffect, useRef, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { ListSeatingPlans } from "../../../wailsjs/go/main/App";
import { defaultGridDimensions, makeSeats, seatsForRoster } from "./seatLayout";
import { useSeatingSession } from "./useSeatingSession";
import { errorMessage } from "../shared/format";
import { seatingPlanActions } from "./seatingPlanActions";



/** ClassroomPage 화면의 상태·계산·처리 함수. 화면(JSX)은 ClassroomPage.tsx에 있다. */
/** useClassroomPage의 상태·계산 부분 */
export function useClassroomPageState({
  students,
  formatRecordedAt,
}: {
  students: models.Student[];
  formatRecordedAt: (value: string) => string;
}) {
  const [seatingTab, setSeatingTab] = useState<
    | "이전 자리배치도"
    | "자리배치 설정"
    | "자리배치 프로그램 실행"
    | "확정 및 결과"
  >("이전 자리배치도");
  const [plans, setPlans] = useState<models.SeatingPlan[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [title, setTitle] = useState("자리 배치");
  const [rows, setRows] = useState(4);
  const [columns, setColumns] = useState(6);
  const [layoutMode, setLayoutMode] = useState<"격자형" | "사용자 지정">("격자형");
  const [deskPosition, setDeskPosition] = useState("앞쪽 중앙");
  const [placementMode, setPlacementMode] = useState("행 기준");
  const [drawMethod, setDrawMethod] = useState("랜덤 룰렛 배정");
  const [competitionMethod, setCompetitionMethod] = useState("가위바위보");
  const [preventPreviousSeat, setPreventPreviousSeat] = useState(true);
  const [preventPreviousPartner, setPreventPreviousPartner] = useState(true);
  const [fixedStudentIDs, setFixedStudentIDs] = useState<string[]>([]);
  const [participationMode, setParticipationMode] = useState("교사 직접 배치");
  const [sessionState, setSessionState] = useState("설정 중");
  const [currentRound, setCurrentRound] = useState(1);
  const [seats, setSeats] = useState<models.SeatingSeat[]>([]);
  const [notice, setNotice] = useState("");
  const [seatingDeleteOpen, setSeatingDeleteOpen] = useState(false);
  const [seatingRecoveryEndOpen, setSeatingRecoveryEndOpen] = useState(false);
  const [customDraggingID, setCustomDraggingID] = useState("");
  const initialRosterCount = useRef(students.length);
  const selectedPlan = plans.find((item) => item.id === selectedID) || null;
  const orderedStudents = [...students].sort(
    (left, right) => left.number - right.number,
  );
  const canUseFixedSeats = plans.some((plan) => plan.id !== selectedID);

  const {
    seatingSession,
    setSeatingSession,
    sessionPhase,
    executionAction,
    openArrowSession,
    startArrowAssignment,
    startSeatingRoulette,
    revealRandomLadder,
    advanceRandomLadder,
    closeArrowEntry,
    openPreferenceSubmission,
    closePreferenceSubmission,
    startRPSCompetition,
    advancePreferenceRound,
    stopArrowSession,
    recoverSeatingSession,
    copyStudentAddress,
    partialCloseOpen,
    setPartialCloseOpen,
    revealDialogOpen,
    setRevealDialogOpen,
    closeSessionOpen,
    setCloseSessionOpen,
    revealSeatingNames,
    swapSeats,
  } = useSeatingSession({
    selectedID,
    setSelectedID,
    title,
    rows,
    columns,
    layoutMode,
    setLayoutMode,
    deskPosition,
    placementMode,
    drawMethod,
    competitionMethod,
    preventPreviousSeat,
    preventPreviousPartner,
    canUseFixedSeats,
    fixedStudentIDs,
    seats,
    setSeats,
    plans,
    setPlans,
    students,
    setNotice,
    sessionState,
    setSessionState,
    setParticipationMode,
    setCurrentRound,
  });

  const hasFinalSeatingResult =
    !seatingSession?.running || ["배정 완료", "자리 확인"].includes(seatingSession.phase);

  async function loadPlans() {
    try {
      const result = (await ListSeatingPlans()) || [];
      const next = result.map((item) => new models.SeatingPlan(item));
      setPlans(next);
      if (next.length > 0 && !selectedID) loadPlan(next[0]);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  useEffect(() => {
    const initial = defaultGridDimensions(students.length);
    setRows(initial.rows);
    setColumns(initial.columns);
    setSeats(makeSeats(initial.rows, initial.columns, []));
    void loadPlans();
  }, []);
  useEffect(() => {
    // 명렬표가 비동기로 로드되는 경우에도 기본 자리를 24개로 고정하지 않습니다.
    if (
      students.length === 0 ||
      selectedID ||
      plans.length > 0 ||
      students.length === initialRosterCount.current
    ) {
      return;
    }
    const previous = defaultGridDimensions(initialRosterCount.current);
    if (
      seats.length !== previous.rows * previous.columns ||
      seats.some((seat) => Boolean(seat.studentId))
    ) {
      initialRosterCount.current = students.length;
      return;
    }
    const next = defaultGridDimensions(students.length);
    initialRosterCount.current = students.length;
    setRows(next.rows);
    setColumns(next.columns);
    setSeats(makeSeats(next.rows, next.columns, []));
  }, [students.length, selectedID, plans.length]);
  useEffect(() => {
    if (!canUseFixedSeats && fixedStudentIDs.length > 0) setFixedStudentIDs([]);
  }, [canUseFixedSeats, fixedStudentIDs.length]);

  function loadPlan(plan: models.SeatingPlan) {
    const planRows = plan.rows || 4;
    const planColumns = plan.columns || 6;
    setSelectedID(plan.id);
    // 저장된 이전 회차의 결과 상태가 새 배치안 실행 화면에 남지 않게 합니다.
    setSeatingSession(null);
    setTitle(plan.title || "자리 배치");
    setRows(planRows);
    setColumns(planColumns);
    setLayoutMode(plan.layoutMode === "사용자 지정" ? "사용자 지정" : "격자형");
    setDeskPosition(plan.deskPosition || "앞쪽 중앙");
    setPlacementMode(plan.placementMode || "행 기준");
      setDrawMethod(plan.drawMethod || "랜덤 룰렛 배정");
  setCompetitionMethod("가위바위보");
    setPreventPreviousSeat(plan.preventPreviousSeat);
    setPreventPreviousPartner(plan.preventPreviousPartner);
    setFixedStudentIDs([...(plan.fixedStudentIds || [])]);
    setParticipationMode(plan.participationMode || "교사 직접 배치");
    setSessionState(plan.sessionState || "설정 중");
    setCurrentRound(plan.currentRound || 1);
    const loadedSeats =
      plan.layoutMode === "사용자 지정"
        ? [...(plan.seats || [])]
        : makeSeats(planRows, planColumns, plan.seats || []);
    setSeats(
      seatsForRoster(
        loadedSeats,
        students.length,
        plan.layoutMode === "사용자 지정" ? "사용자 지정" : "격자형",
      ),
    );
    setNotice((plan.title || "자리 배치") + " 배치안을 불러왔습니다.");
  }

  return { seatingTab, setSeatingTab, plans, setPlans, selectedID, setSelectedID, title, setTitle, rows, setRows, columns, setColumns, layoutMode, setLayoutMode, deskPosition, setDeskPosition, placementMode, setPlacementMode, drawMethod, setDrawMethod, competitionMethod, setCompetitionMethod, preventPreviousSeat, setPreventPreviousSeat, preventPreviousPartner, setPreventPreviousPartner, fixedStudentIDs, setFixedStudentIDs, participationMode, setParticipationMode, sessionState, setSessionState, currentRound, setCurrentRound, seats, setSeats, notice, setNotice, seatingDeleteOpen, setSeatingDeleteOpen, seatingRecoveryEndOpen, setSeatingRecoveryEndOpen, customDraggingID, setCustomDraggingID, initialRosterCount, selectedPlan, orderedStudents, canUseFixedSeats, seatingSession, setSeatingSession, sessionPhase, executionAction, openArrowSession, startArrowAssignment, startSeatingRoulette, revealRandomLadder, advanceRandomLadder, closeArrowEntry, openPreferenceSubmission, closePreferenceSubmission, startRPSCompetition, advancePreferenceRound, stopArrowSession, recoverSeatingSession, copyStudentAddress, partialCloseOpen, setPartialCloseOpen, revealDialogOpen, setRevealDialogOpen, closeSessionOpen, setCloseSessionOpen, revealSeatingNames, swapSeats, hasFinalSeatingResult, loadPlans, loadPlan };
}

/** 처리 함수 묶음이 받는 값: 상태 훅 결과 + 공유 값 */
export type ClassroomPageView = ReturnType<typeof useClassroomPageState> & Parameters<typeof useClassroomPageState>[0];

export function useClassroomPage({
  students,
  formatRecordedAt,
}: {
  students: models.Student[];
  formatRecordedAt: (value: string) => string;
}) {
  const state = useClassroomPageState({ students, formatRecordedAt });
  const view = { students, formatRecordedAt, ...state };
  const seatingPlanActionsResult = seatingPlanActions(view);
  return { ...state, ...seatingPlanActionsResult };
}
