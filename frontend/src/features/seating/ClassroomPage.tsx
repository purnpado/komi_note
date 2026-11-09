import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { isGroupedPlacement, placementGroupSize } from "./seatLayout";
import { SeatingHistoryPanel } from "./SeatingHistoryPanel";
import { SeatingSetupPanel } from "./SeatingSetupPanel";
import { SeatingExecutionPanel } from "./SeatingExecutionPanel";
import { SeatingResultPanel } from "./SeatingResultPanel";
import { SeatingCloseSessionDialog, SeatingDeleteDialog, SeatingPartialCloseDialog, SeatingRecoveryEndDialog, SeatingRevealNamesDialog } from "./SeatingDialogs";
import { openExternalURL } from "../shared/desktopActions";
import "./seating.css";
import { useClassroomPage } from "./useClassroomPage";

export function ClassroomPage({
  students,
  formatRecordedAt,
}: {
  students: models.Student[];
  formatRecordedAt: (value: string) => string;
}) {
  const { seatingTab, setSeatingTab, plans, setPlans, selectedID, setSelectedID, title, setTitle, rows, setRows, columns, setColumns, layoutMode, setLayoutMode, deskPosition, setDeskPosition, placementMode, setPlacementMode, drawMethod, setDrawMethod, competitionMethod, setCompetitionMethod, preventPreviousSeat, setPreventPreviousSeat, preventPreviousPartner, setPreventPreviousPartner, fixedStudentIDs, setFixedStudentIDs, participationMode, setParticipationMode, sessionState, setSessionState, currentRound, setCurrentRound, seats, setSeats, notice, setNotice, seatingDeleteOpen, setSeatingDeleteOpen, seatingRecoveryEndOpen, setSeatingRecoveryEndOpen, customDraggingID, setCustomDraggingID, initialRosterCount, selectedPlan, orderedStudents, canUseFixedSeats, seatingSession, setSeatingSession, sessionPhase, executionAction, openArrowSession, startArrowAssignment, startSeatingRoulette, revealRandomLadder, advanceRandomLadder, closeArrowEntry, openPreferenceSubmission, closePreferenceSubmission, startRPSCompetition, advancePreferenceRound, stopArrowSession, recoverSeatingSession, copyStudentAddress, partialCloseOpen, setPartialCloseOpen, revealDialogOpen, setRevealDialogOpen, closeSessionOpen, setCloseSessionOpen, revealSeatingNames, swapSeats, hasFinalSeatingResult, loadPlans, loadPlan, newPlan, changeLayout, switchLayoutMode, addCustomSeat, deleteCustomSeat, moveCustomSeat, assignSeat, moveSeat, handleSeatDragStart, handleSeatDrop, drawSeats, savePlan, removePlan, assignedIDs, visualSeats, groupedPlacement, groupSize, displaySeats, seatNumberByID, groupedSeatGroups, printSeatingResult } = useClassroomPage({ students, formatRecordedAt });
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
          students={orderedStudents}
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
