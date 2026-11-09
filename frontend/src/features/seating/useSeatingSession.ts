import { useEffect, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { GetSeatingSessionInfo, ListSeatingPlans } from "../../../wailsjs/go/main/App";
import { makeSeats } from "./seatLayout";
import { seatingSessionActions } from "./seatingSessionActions";
/** useSeatingSession의 상태·계산 부분 */
export function useSeatingSessionState({
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
}: {
  selectedID: string;
  setSelectedID: (id: string) => void;
  title: string;
  rows: number;
  columns: number;
  layoutMode: "격자형" | "사용자 지정";
  setLayoutMode: (mode: "격자형" | "사용자 지정") => void;
  deskPosition: string;
  placementMode: string;
  drawMethod: string;
  competitionMethod: string;
  preventPreviousSeat: boolean;
  preventPreviousPartner: boolean;
  canUseFixedSeats: boolean;
  fixedStudentIDs: string[];
  seats: models.SeatingSeat[];
  setSeats: (seats: models.SeatingSeat[]) => void;
  plans: models.SeatingPlan[];
  setPlans: (plans: models.SeatingPlan[]) => void;
  students: models.Student[];
  setNotice: (notice: string) => void;
  sessionState: string;
  setSessionState: (state: string) => void;
  setParticipationMode: (mode: string) => void;
  setCurrentRound: (round: number) => void;
}) {
  const [seatingSession, setSeatingSession] = useState<models.SeatingSessionInfo | null>(null);
  // 재적보다 적게 입장했을 때 띄우는 "결석·미참여 예외 마감" 확인창
  const [partialCloseOpen, setPartialCloseOpen] = useState(false);
  const [revealDialogOpen, setRevealDialogOpen] = useState(false);
  const [closeSessionOpen, setCloseSessionOpen] = useState(false);

  // 실시간 세션 폴링
  useEffect(() => {
    if (!selectedID || !seatingSession?.running) return;
    let active = true;
    const refresh = async () => {
      try {
        const latest = await GetSeatingSessionInfo(selectedID);
        if (active) {
          const latestSession = new models.SeatingSessionInfo(latest);
          setSeatingSession(latestSession);
          if (["배정 완료", "자리 확인"].includes(latestSession.phase)) {
            const result = (await ListSeatingPlans()) || [];
            const next = result.map((item) => new models.SeatingPlan(item));
            const current = next.find((item) => item.id === selectedID);
            setPlans(next);
            if (current) {
              const isCustomLayout = current.layoutMode === "사용자 지정";
              setLayoutMode(isCustomLayout ? "사용자 지정" : "격자형");
              setSeats(
                isCustomLayout
                  ? [...(current.seats || [])]
                  : makeSeats(current.rows || 4, current.columns || 6, current.seats || []),
              );
            }
          }
        }
      } catch {
        /* 회차를 닫은 직후에는 이전 상태 유지 */
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedID, seatingSession?.running, setPlans, setLayoutMode, setSeats]);

  return { seatingSession, setSeatingSession, partialCloseOpen, setPartialCloseOpen, revealDialogOpen, setRevealDialogOpen, closeSessionOpen, setCloseSessionOpen };
}

/** 처리 함수 묶음이 받는 값: 상태 훅 결과 + 공유 값 */
export type SeatingSessionView = ReturnType<typeof useSeatingSessionState> & Parameters<typeof useSeatingSessionState>[0];

export function useSeatingSession({
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
}: {
  selectedID: string;
  setSelectedID: (id: string) => void;
  title: string;
  rows: number;
  columns: number;
  layoutMode: "격자형" | "사용자 지정";
  setLayoutMode: (mode: "격자형" | "사용자 지정") => void;
  deskPosition: string;
  placementMode: string;
  drawMethod: string;
  competitionMethod: string;
  preventPreviousSeat: boolean;
  preventPreviousPartner: boolean;
  canUseFixedSeats: boolean;
  fixedStudentIDs: string[];
  seats: models.SeatingSeat[];
  setSeats: (seats: models.SeatingSeat[]) => void;
  plans: models.SeatingPlan[];
  setPlans: (plans: models.SeatingPlan[]) => void;
  students: models.Student[];
  setNotice: (notice: string) => void;
  sessionState: string;
  setSessionState: (state: string) => void;
  setParticipationMode: (mode: string) => void;
  setCurrentRound: (round: number) => void;
}) {
  const state = useSeatingSessionState({ selectedID, setSelectedID, title, rows, columns, layoutMode, setLayoutMode, deskPosition, placementMode, drawMethod, competitionMethod, preventPreviousSeat, preventPreviousPartner, canUseFixedSeats, fixedStudentIDs, seats, setSeats, plans, setPlans, students, setNotice, sessionState, setSessionState, setParticipationMode, setCurrentRound });
  const view = { selectedID, setSelectedID, title, rows, columns, layoutMode, setLayoutMode, deskPosition, placementMode, drawMethod, competitionMethod, preventPreviousSeat, preventPreviousPartner, canUseFixedSeats, fixedStudentIDs, seats, setSeats, plans, setPlans, students, setNotice, sessionState, setSessionState, setParticipationMode, setCurrentRound, ...state };
  const seatingSessionActionsResult = seatingSessionActions(view);
  return { ...state, ...seatingSessionActionsResult };
}
