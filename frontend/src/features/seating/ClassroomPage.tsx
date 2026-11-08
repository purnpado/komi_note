import { DragEvent as ReactDragEvent, FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { DeleteSeatingPlan, ListSeatingPlans, SaveSeatingPlan } from "../../../wailsjs/go/main/App";
import { defaultGridDimensions, groupSeatsForPlacement, isGroupedPlacement, makeSeats, orderSeatsForPlacement, placementGroupSize, seatsForRoster } from "./seatLayout";
import { generateSeatingPlacement } from "./seatingAlgorithm";
import { useSeatingSession } from "./useSeatingSession";
import { SeatingHistoryPanel } from "./SeatingHistoryPanel";
import { SeatingSetupPanel } from "./SeatingSetupPanel";
import { SeatingExecutionPanel } from "./SeatingExecutionPanel";
import { SeatingResultPanel } from "./SeatingResultPanel";
import {
  SeatingCloseSessionDialog,
  SeatingDeleteDialog,
  SeatingPartialCloseDialog,
  SeatingRecoveryEndDialog,
  SeatingRevealNamesDialog,
} from "./SeatingDialogs";
import { escapePrintText, openExternalURL, printSheet } from "../shared/desktopActions";
import "./seating.css";

export function ClassroomPage({
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
      setNotice(String(error));
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
        x: Number.isFinite(seat.x) && seat.x > 0 ? seat.x : Math.round(80 + ((seat.column - 1) * 840) / Math.max(1, columns - 1)),
        y: Number.isFinite(seat.y) && seat.y > 0 ? seat.y : Math.round(100 + ((seat.row - 1) * 800) / Math.max(1, rows - 1)),
      })),
    );
    setNotice("좌석을 끌어 실제 교실 위치에 놓을 수 있습니다.");
  }

  function addCustomSeat() {
    setSeats((current) => {
      const nextNumber = current.length + 1;
      const offset = ((current.length * 83) % 360) - 180;
      return [...current, {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        row: Math.floor(current.length / Math.max(1, columns)) + 1,
        column: (current.length % Math.max(1, columns)) + 1,
        x: Math.max(70, Math.min(930, 500 + offset)),
        y: Math.max(90, Math.min(900, 500 + ((current.length * 127) % 260) - 130)),
        label: `${nextNumber}번`,
        studentId: "",
      } as models.SeatingSeat];
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
    setSeats((current) => current.map((seat) => seat.id === customDraggingID ? { ...seat, x, y } : seat));
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

  function handleSeatDragStart(
    event: ReactDragEvent<HTMLDivElement>,
    seatID: string,
  ) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", seatID);
  }

  function handleSeatDrop(
    event: ReactDragEvent<HTMLDivElement>,
    targetID: string,
  ) {
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
      setNotice(
        drawMethod +
          " 방식으로 자리 배치를 준비했습니다. 저장 전 결과를 확인해 주세요.",
      );
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
      setNotice(String(error));
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
      setNotice(String(error));
    }
  }

  const assignedIDs = new Set(
    seats.map((seat) => seat.studentId).filter(Boolean),
  );
  const visualSeats = orderSeatsForPlacement(seats, placementMode, layoutMode);
  const groupedPlacement = isGroupedPlacement(placementMode);
  const groupSize = placementGroupSize(placementMode);
  const displaySeats = visualSeats.slice(
    0,
    orderedStudents.length > 0 ? orderedStudents.length : visualSeats.length,
  );
  const seatNumberByID = new Map(
    [...displaySeats]
      .sort((left, right) =>
        layoutMode === "사용자 지정"
          ? left.y - right.y || left.x - right.x
          : left.row - right.row || left.column - right.column,
      )
      .map((seat, index) => [seat.id, index + 1]),
  );
  const groupedSeatGroups = groupedPlacement
    ? groupSeatsForPlacement(displaySeats, placementMode)
    : [];
  function printSeatingResult() {
    const cells = visualSeats
      .map((seat) => {
        const student = orderedStudents.find(
          (item) => item.id === seat.studentId,
        );
        const number = seatNumberByID.get(seat.id) || 0;
        const position = layoutMode === "사용자 지정" ? ` style="left:${(seat.x || 500) / 10}%;top:${(seat.y || 500) / 10}%"` : "";
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
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">학급 운영 · 자리배정</p>
          <h2>자리배정</h2>
          <p>
            이전 배치를 확인하고 교실 구조를 정한 뒤, QR 랜덤 룰렛으로 결과를
            확정합니다.
          </p>
        </div>
        <div className="dialog-actions">
          <button className="primary-button" onClick={newPlan}>
            ＋ 새 자리 배치
          </button>
        </div>
      </section>
      <div className="seating-tabs" role="tablist" aria-label="자리배정 단계">
        {(
          [
            { id: "이전 자리배치도", step: 1, icon: "📋" },
            { id: "자리배치 설정", step: 2, icon: "⚙️" },
            { id: "자리배치 프로그램 실행", step: 3, icon: "🎮" },
            { id: "확정 및 결과", step: 4, icon: "🏆" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={seatingTab === item.id}
            className={seatingTab === item.id ? "active" : ""}
            onClick={() => setSeatingTab(item.id)}
          >
            <span className="tab-step-badge">{item.step}</span>
            <span className="tab-icon">{item.icon}</span>
            <span className="tab-label">{item.id}</span>
          </button>
        ))}
      </div>
      <HelpGuide
        title="자리배정 처음 사용 안내"
        defaultOpen={false}
        description="교실 배치도를 저장한 뒤 QR 회차를 열고, 선택한 게임 방식으로 배정한 다음 최종 자리표를 확인·인쇄합니다."
        steps={[
          {
            title: "배치도 설정",
            detail:
              "행·열 격자형 또는 사용자 지정 교실형을 선택해 실제 교실 구조, 교탁 방향, 사용할 좌석을 저장합니다.",
          },
          {
            title: "배정 규칙과 고정 학생 확인",
            detail: "이전 자리·짝꿍 금지 규칙을 정하고, 필요한 경우 이전 배치가 있는 학생만 교사 전용 고정 학생으로 지정합니다.",
          },
          {
            title: "QR 회차와 게임 진행",
            detail:
              "랜덤 룰렛·랜덤 사다리·희망 경쟁 중 하나로 QR 회차를 열고 입장 마감 뒤 교사 순서에 따라 진행합니다.",
          },
          {
            title: "최종 자리 확인·인쇄",
            detail:
              "배정이 끝나면 자리 확인 단계에서 설정한 배치도와 학생 실명을 교사·전자칠판에서 확인하고 결과를 인쇄합니다.",
          },
        ]}
        note="진행 중 학생 기기와 전자칠판에는 닉네임만 표시합니다. 실명과 교사 전용 고정 자리 정보는 최종 자리 확인 및 교사 프로그램에서만 확인합니다."
      />
      {notice && (
        <div className="seating-notice" role="status">
          <span>✓</span>
          {notice}
        </div>
      )}
      {seatingTab === "이전 자리배치도" && (
        <SeatingHistoryPanel
          plans={plans}
          selectedID={selectedID}
          selectedPlan={selectedPlan}
          rows={rows}
          columns={columns}
          placementMode={placementMode}
          deskPosition={deskPosition}
          layoutMode={layoutMode}
          displaySeats={displaySeats}
          visualSeats={visualSeats}
          groupedSeatGroups={groupedSeatGroups}
          groupedPlacement={groupedPlacement}
          groupSize={groupSize}
          seatNumberByID={seatNumberByID}
          orderedStudents={orderedStudents}
          assignedIDs={assignedIDs}
          formatRecordedAt={formatRecordedAt}
          onLoadPlan={loadPlan}
          onRequestDelete={() => setSeatingDeleteOpen(true)}
          onEditPlan={() => setSeatingTab("자리배치 설정")}
        />
      )}
      {seatingTab === "자리배치 설정" && (
        <SeatingSetupPanel
          title={title}
          setTitle={setTitle}
          deskPosition={deskPosition}
          setDeskPosition={setDeskPosition}
          layoutMode={layoutMode}
          switchLayoutMode={switchLayoutMode}
          seats={seats}
          rows={rows}
          columns={columns}
          changeLayout={changeLayout}
          placementMode={placementMode}
          setPlacementMode={setPlacementMode}
          drawMethod={drawMethod}
          setDrawMethod={setDrawMethod}
          competitionMethod={competitionMethod}
          setCompetitionMethod={setCompetitionMethod}
          preventPreviousSeat={preventPreviousSeat}
          setPreventPreviousSeat={setPreventPreviousSeat}
          preventPreviousPartner={preventPreviousPartner}
          setPreventPreviousPartner={setPreventPreviousPartner}
          canUseFixedSeats={canUseFixedSeats}
          fixedStudentIDs={fixedStudentIDs}
          setFixedStudentIDs={setFixedStudentIDs}
          orderedStudents={orderedStudents}
          drawSeats={drawSeats}
          savePlan={savePlan}
          visualSeats={visualSeats}
          groupedSeatGroups={groupedSeatGroups}
          groupedPlacement={groupedPlacement}
          groupSize={groupSize}
          seatNumberByID={seatNumberByID}
          assignedIDs={assignedIDs}
          customDraggingID={customDraggingID}
          setCustomDraggingID={setCustomDraggingID}
          assignSeat={assignSeat}
          deleteCustomSeat={deleteCustomSeat}
          moveCustomSeat={moveCustomSeat}
          addCustomSeat={addCustomSeat}
          clearCustomSeats={() => {
            setSeats([]);
            setNotice("사용자 지정 좌석을 모두 비웠습니다.");
          }}
          handleSeatDragStart={handleSeatDragStart}
          handleSeatDrop={handleSeatDrop}
        />
      )}
      {seatingTab === "자리배치 프로그램 실행" && (
        <SeatingExecutionPanel
          drawMethod={drawMethod}
          seatingSession={seatingSession}
          sessionPhase={sessionPhase}
          rosterCount={seatingSession?.rosterCnt || orderedStudents.length}
          executionAction={executionAction}
          canUseFixedSeats={canUseFixedSeats}
          onRecover={(action) => void recoverSeatingSession(action)}
          onRequestEnd={() => setSeatingRecoveryEndOpen(true)}
          onOpenResult={() => setSeatingTab("확정 및 결과")}
          onCopyAddress={() => void copyStudentAddress()}
          onOpenBoard={() => {
            if (seatingSession?.boardUrl) {
              void openExternalURL(seatingSession.boardUrl).catch(() => setNotice(`전자칠판 화면을 열지 못했습니다. 브라우저에 직접 입력해 주세요: ${seatingSession.boardUrl}`));
            }
          }}
          onCloseSession={() => setCloseSessionOpen(true)}
          onRevealNames={() => setRevealDialogOpen(true)}
          onHideNames={() => void revealSeatingNames(false)}
        />
      )}
      {seatingTab === "확정 및 결과" && (
        <SeatingResultPanel
          hasFinalSeatingResult={hasFinalSeatingResult}
          deskPosition={deskPosition}
          layoutMode={layoutMode}
          displaySeats={displaySeats}
          seatNumberByID={seatNumberByID}
          orderedStudents={orderedStudents}
          assignedIDs={assignedIDs}
          visualSeats={visualSeats}
          groupedSeatGroups={groupedSeatGroups}
          columns={columns}
          isGroupedPlacement={groupedPlacement}
          placementGroupSize={groupSize}
          onPrint={printSeatingResult}
          canSwap={hasFinalSeatingResult && Boolean(selectedID)}
          onSwapSeats={swapSeats}
          changes={selectedPlan?.changes || []}
          sessionFinished={Boolean(seatingSession?.running) && ["배정 완료", "자리 확인"].includes(seatingSession?.phase || "")}
          namesRevealed={Boolean(seatingSession?.namesRevealed)}
          onRevealNames={() => setRevealDialogOpen(true)}
          onHideNames={() => void revealSeatingNames(false)}
        />
      )}
      <SeatingDeleteDialog
        open={seatingDeleteOpen}
        onOpenChange={setSeatingDeleteOpen}
        selectedPlan={selectedPlan}
        onConfirmDelete={removePlan}
      />
      <SeatingRecoveryEndDialog
        open={seatingRecoveryEndOpen}
        onOpenChange={setSeatingRecoveryEndOpen}
        onConfirmEnd={() => recoverSeatingSession("회차 종료")}
      />
      <SeatingPartialCloseDialog
        open={partialCloseOpen}
        onOpenChange={setPartialCloseOpen}
        participantCount={seatingSession?.participantCnt || 0}
        rosterCount={seatingSession?.rosterCnt || orderedStudents.length}
        onConfirm={() => closeArrowEntry(true)}
      />
      <SeatingRevealNamesDialog
        open={revealDialogOpen}
        onOpenChange={setRevealDialogOpen}
        onConfirm={() => revealSeatingNames(true)}
      />
      <SeatingCloseSessionDialog
        open={closeSessionOpen}
        onOpenChange={setCloseSessionOpen}
        finished={["배정 완료", "자리 확인"].includes(seatingSession?.phase || "")}
        onConfirm={stopArrowSession}
      />
    </>
  );
}
