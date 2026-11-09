import { DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { DeleteSeatingPlan, SaveSeatingPlan } from "../../../wailsjs/go/main/App";
import {
  defaultGridDimensions,
  groupSeatsForPlacement,
  isGroupedPlacement,
  makeSeats,
  orderSeatsForPlacement,
  placementGroupSize,
  seatsForRoster,
} from "./seatLayout";
import { generateSeatingPlacement } from "./seatingAlgorithm";
import { escapePrintText, printSheet } from "../shared/desktopActions";
import { errorMessage } from "../shared/format";
import type { ClassroomPageView } from "./useClassroomPage";

/** useClassroomPage에서 떼어 낸 처리 함수 묶음(훅 없음). 상태는 view로 받는다. */
export function seatingPlanActions(view: ClassroomPageView) {
  const {
    plans,
    setPlans,
    selectedID,
    setSelectedID,
    title,
    setTitle,
    rows,
    setRows,
    columns,
    setColumns,
    layoutMode,
    setLayoutMode,
    deskPosition,
    setDeskPosition,
    placementMode,
    setPlacementMode,
    drawMethod,
    setDrawMethod,
    competitionMethod,
    setCompetitionMethod,
    preventPreviousSeat,
    setPreventPreviousSeat,
    preventPreviousPartner,
    setPreventPreviousPartner,
    fixedStudentIDs,
    setFixedStudentIDs,
    participationMode,
    setParticipationMode,
    sessionState,
    setSessionState,
    currentRound,
    setCurrentRound,
    seats,
    setSeats,
    setNotice,
    setSeatingDeleteOpen,
    customDraggingID,
    selectedPlan,
    orderedStudents,
    canUseFixedSeats,
    setSeatingSession,
    students,
  } = view;
  function newPlan() {
    const initial = defaultGridDimensions(students.length);
    setSelectedID("");
    setSeatingSession(null);
    setTitle("자리 배치");
    setRows(initial.rows);
    setColumns(initial.columns);
    setLayoutMode("격자형");
    setDeskPosition("앞쪽 중앙");
    setPlacementMode("행 기준");
    setDrawMethod("랜덤 룰렛 배정");
    setCompetitionMethod("가위바위보");
    setPreventPreviousSeat(true);
    setPreventPreviousPartner(true);
    setFixedStudentIDs([]);
    setParticipationMode("교사 직접 배치");
    setSessionState("설정 중");
    setCurrentRound(1);
    setSeats(makeSeats(initial.rows, initial.columns, []));
    setNotice("새 자리 배치안을 준비했습니다.");
  }

  function changeLayout(nextRows: number, nextColumns: number) {
    const safeRows = Math.max(1, Math.min(40, nextRows || 1));
    const safeColumns = Math.max(1, Math.min(40, nextColumns || 1));
    setRows(safeRows);
    setColumns(safeColumns);
    setSeats(makeSeats(safeRows, safeColumns, seats));
  }

  function switchLayoutMode(nextMode: "격자형" | "사용자 지정") {
    if (nextMode === layoutMode) return;
    if (nextMode === "격자형") {
      setSeats(makeSeats(rows, columns, seats));
      setLayoutMode("격자형");
      setNotice("행·열 격자형 배치도로 전환했습니다.");
      return;
    }
    setLayoutMode("사용자 지정");
    setSeats((current) =>
      current.map((seat) => ({
        ...seat,
        x:
          Number.isFinite(seat.x) && seat.x > 0
            ? seat.x
            : Math.round(80 + ((seat.column - 1) * 840) / Math.max(1, columns - 1)),
        y:
          Number.isFinite(seat.y) && seat.y > 0
            ? seat.y
            : Math.round(100 + ((seat.row - 1) * 800) / Math.max(1, rows - 1)),
      })),
    );
    setNotice("좌석을 끌어 실제 교실 위치에 놓을 수 있습니다.");
  }

  function addCustomSeat() {
    setSeats((current) => {
      const nextNumber = current.length + 1;
      const offset = ((current.length * 83) % 360) - 180;
      return [
        ...current,
        {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          row: Math.floor(current.length / Math.max(1, columns)) + 1,
          column: (current.length % Math.max(1, columns)) + 1,
          x: Math.max(70, Math.min(930, 500 + offset)),
          y: Math.max(90, Math.min(900, 500 + ((current.length * 127) % 260) - 130)),
          label: `${nextNumber}번`,
          studentId: "",
        } as models.SeatingSeat,
      ];
    });
  }

  function deleteCustomSeat(seatID: string) {
    setSeats((current) => current.filter((seat) => seat.id !== seatID));
  }

  function moveCustomSeat(event: ReactPointerEvent<HTMLDivElement>) {
    if (!customDraggingID) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.max(45, Math.min(955, ((event.clientX - bounds.left) / bounds.width) * 1000)));
    const y = Math.round(Math.max(60, Math.min(940, ((event.clientY - bounds.top) / bounds.height) * 1000)));
    setSeats((current) => current.map((seat) => (seat.id === customDraggingID ? { ...seat, x, y } : seat)));
  }

  function assignSeat(seatID: string, studentID: string) {
    setSeats((current) =>
      current.map((seat) =>
        seat.id === seatID
          ? { ...seat, studentId: studentID }
          : studentID && seat.studentId === studentID
            ? { ...seat, studentId: "" }
            : seat,
      ),
    );
  }

  function moveSeat(sourceID: string, targetID: string) {
    if (!sourceID || sourceID === targetID) return;
    setSeats((current) => {
      const source = current.find((seat) => seat.id === sourceID);
      const target = current.find((seat) => seat.id === targetID);
      if (!source || !target) return current;
      return current.map((seat) =>
        seat.id === sourceID
          ? { ...seat, studentId: target.studentId }
          : seat.id === targetID
            ? { ...seat, studentId: source.studentId }
            : seat,
      );
    });
  }

  function handleSeatDragStart(event: ReactDragEvent<HTMLDivElement>, seatID: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", seatID);
  }

  function handleSeatDrop(event: ReactDragEvent<HTMLDivElement>, targetID: string) {
    event.preventDefault();
    moveSeat(event.dataTransfer.getData("text/plain"), targetID);
  }

  function drawSeats() {
    const result = generateSeatingPlacement({
      orderedStudents,
      seats,
      rows,
      columns,
      layoutMode,
      plans,
      selectedID,
      visualSeats,
      canUseFixedSeats,
      fixedStudentIDs,
      preventPreviousSeat,
      preventPreviousPartner,
    });
    if (!result.success) {
      setNotice(result.error || "자리 배치에 실패했습니다.");
      return;
    }
    if (result.nextSeats) {
      setSeats(result.nextSeats);
      setNotice(drawMethod + " 방식으로 자리 배치를 준비했습니다. 저장 전 결과를 확인해 주세요.");
    }
  }

  async function savePlan() {
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
          participationMode,
          sessionState,
          currentRound,
          seats: savedSeats,
        }),
      );
      const next = plans.filter((item) => item.id !== saved.id);
      next.unshift(new models.SeatingPlan(saved));
      setPlans(next);
      setSelectedID(saved.id);
      setSeats(savedSeats);
      setNotice("자리 배치와 적용 규칙을 암호화해 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  async function removePlan() {
    if (!selectedPlan) return;
    try {
      await DeleteSeatingPlan(selectedPlan.id);
      setPlans((items) => items.filter((item) => item.id !== selectedPlan.id));
      setSeatingDeleteOpen(false);
      newPlan();
      setNotice("자리 배치 이력을 삭제했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const assignedIDs = new Set(seats.map((seat) => seat.studentId).filter(Boolean));
  const visualSeats = orderSeatsForPlacement(seats, placementMode, layoutMode);
  const groupedPlacement = isGroupedPlacement(placementMode);
  const groupSize = placementGroupSize(placementMode);
  const displaySeats = visualSeats.slice(0, orderedStudents.length > 0 ? orderedStudents.length : visualSeats.length);
  const seatNumberByID = new Map(
    [...displaySeats]
      .sort((left, right) =>
        layoutMode === "사용자 지정"
          ? left.y - right.y || left.x - right.x
          : left.row - right.row || left.column - right.column,
      )
      .map((seat, index) => [seat.id, index + 1]),
  );
  const groupedSeatGroups = groupedPlacement ? groupSeatsForPlacement(displaySeats, placementMode) : [];
  function printSeatingResult() {
    const cells = visualSeats
      .map((seat) => {
        const student = orderedStudents.find((item) => item.id === seat.studentId);
        const number = seatNumberByID.get(seat.id) || 0;
        const position =
          layoutMode === "사용자 지정" ? ` style="left:${(seat.x || 500) / 10}%;top:${(seat.y || 500) / 10}%"` : "";
        return `<article${position}><b>${number}번</b><strong>${student ? `${escapePrintText(student.number)}번 ${escapePrintText(student.name)}` : "빈 자리"}</strong></article>`;
      })
      .join("");
    const boardClass = layoutMode === "사용자 지정" ? "custom-print" : "grid";
    const p = ".print-sheet";
    const css = `@page{size:A4 landscape;margin:12mm}${p} *{box-sizing:border-box}${p}{font-family:Arial,sans-serif;color:#1e2a44}${p} h1{text-align:center;margin:0 0 12mm}${p} .desk{margin:0 auto 10mm;width:32%;padding:8px;text-align:center;border-radius:8px;background:#f1d5ad;font-weight:bold}${p} .grid{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:7px;background:#fff;padding:0}${p} .grid article,${p} .custom-print article{min-height:52px;padding:8px;border:1px solid #777;border-radius:6px;background:#fff}${p} .custom-print{position:relative;height:160mm;border:1px dashed #d3b18a;background:#fffaf2}${p} .custom-print article{position:absolute;min-width:80px;transform:translate(-50%,-50%)}${p} b,${p} article strong{display:block}${p} article b{font-size:12px;color:#92501d}${p} article strong{margin-top:6px;font-size:14px}`;
    void printSheet(
      `<h1>${escapePrintText(title)}</h1><div class="desk">교탁 · ${escapePrintText(deskPosition)}</div><main class="${boardClass}">${cells}</main>`,
      css,
    ).catch(() => setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."));
  }
  return {
    newPlan,
    changeLayout,
    switchLayoutMode,
    addCustomSeat,
    deleteCustomSeat,
    moveCustomSeat,
    assignSeat,
    moveSeat,
    handleSeatDragStart,
    handleSeatDrop,
    drawSeats,
    savePlan,
    removePlan,
    assignedIDs,
    visualSeats,
    groupedPlacement,
    groupSize,
    displaySeats,
    seatNumberByID,
    groupedSeatGroups,
    printSeatingResult,
  };
}
