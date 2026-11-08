import { useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { CustomSeatCanvas, SeatingGrid } from "./SeatingBoard";

function formatChangeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SeatingResultPanel({
  hasFinalSeatingResult,
  deskPosition,
  layoutMode,
  displaySeats,
  seatNumberByID,
  orderedStudents,
  assignedIDs,
  visualSeats,
  groupedSeatGroups,
  columns,
  isGroupedPlacement,
  placementGroupSize,
  onPrint,
  canSwap,
  onSwapSeats,
  changes,
  sessionFinished,
  namesRevealed,
  onRevealNames,
  onHideNames,
}: {
  hasFinalSeatingResult: boolean;
  deskPosition: string;
  layoutMode: string;
  displaySeats: models.SeatingSeat[];
  seatNumberByID: Map<string, number>;
  orderedStudents: models.Student[];
  assignedIDs: Set<string>;
  visualSeats: models.SeatingSeat[];
  groupedSeatGroups: models.SeatingSeat[][];
  columns: number;
  isGroupedPlacement: boolean;
  placementGroupSize: number;
  onPrint: () => void;
  canSwap: boolean;
  onSwapSeats: (firstSeatID: string, secondSeatID: string) => Promise<boolean>;
  changes: models.SeatingChange[];
  sessionFinished: boolean;
  namesRevealed: boolean;
  onRevealNames: () => void;
  onHideNames: () => void;
}) {
  const [swapMode, setSwapMode] = useState(false);
  const [firstSeatID, setFirstSeatID] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSeatClick(seatID: string) {
    if (busy) return;
    if (!firstSeatID) {
      setFirstSeatID(seatID);
      return;
    }
    if (firstSeatID === seatID) {
      setFirstSeatID("");
      return;
    }
    setBusy(true);
    await onSwapSeats(firstSeatID, seatID);
    setBusy(false);
    setFirstSeatID("");
  }

  const firstNumber = firstSeatID ? seatNumberByID.get(firstSeatID) : 0;
  const swapHandlers = swapMode && canSwap ? { onSeatClick: (id: string) => void handleSeatClick(id), selectedSeatID: firstSeatID } : {};
  const recentChanges = [...changes].reverse().slice(0, 8);

  return (
    <section className="panel seating-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">4단계 · 확정 및 결과</p>
          <h3>{hasFinalSeatingResult ? "최종 자리배치" : "자리배정 진행 중"}</h3>
          <p>
            {hasFinalSeatingResult
              ? "배정 결과를 확인하고, 필요하면 두 자리를 눌러 맞바꾼 뒤 인쇄하세요."
              : "배정이 끝난 뒤 최종 결과, 자리 바꾸기, 인쇄 버튼이 열립니다."}
          </p>
        </div>
        {hasFinalSeatingResult && (
          <div className="seating-result-actions">
            {canSwap && (
              <button
                className={swapMode ? "accent-button" : "quiet-button"}
                aria-pressed={swapMode}
                onClick={() => {
                  setSwapMode(!swapMode);
                  setFirstSeatID("");
                }}
              >
                {swapMode ? "자리 바꾸기 끝내기" : "자리 바꾸기"}
              </button>
            )}
            <button className="primary-button" onClick={onPrint}>
              가로 결과 인쇄
            </button>
          </div>
        )}
      </div>
      {sessionFinished && (
        <div className={namesRevealed ? "seating-reveal-bar revealed" : "seating-reveal-bar"} role="status">
          <span>
            {namesRevealed
              ? "전자칠판에 실명 배치도를 공개했어요. 자리를 바꾸면 전자칠판에도 바로 반영됩니다."
              : "전자칠판에는 아직 좌석 번호와 닉네임만 보입니다. 확인을 마치면 실명을 공개하세요."}
          </span>
          {namesRevealed ? (
            <button className="quiet-button" onClick={onHideNames}>실명 다시 가리기</button>
          ) : (
            <button className="primary-button" onClick={onRevealNames}>실명 배치도 공개</button>
          )}
        </div>
      )}
      {swapMode && canSwap && (
        <p className="seating-swap-guide" role="status" aria-live="polite">
          {busy
            ? "자리를 바꾸는 중입니다…"
            : firstSeatID
              ? `${firstNumber ? `${firstNumber}번` : "선택한"} 자리를 골랐어요. 바꿀 자리를 누르세요. 같은 자리를 다시 누르면 취소됩니다.`
              : "바꿀 첫 번째 자리를 누르세요. 빈자리를 고르면 그 자리로 옮깁니다."}
        </p>
      )}
      {hasFinalSeatingResult ? (
        <div className="seating-board">
          <div className="teacher-desk">교탁 · {deskPosition}</div>
          {layoutMode === "사용자 지정" ? (
            <CustomSeatCanvas
              seats={displaySeats}
              seatNumberByID={seatNumberByID}
              orderedStudents={orderedStudents}
              assignedIDs={assignedIDs}
              readOnly
              {...swapHandlers}
            />
          ) : (
            <SeatingGrid
              visualSeats={visualSeats}
              groupedSeatGroups={groupedSeatGroups}
              columns={columns}
              isGroupedPlacement={isGroupedPlacement}
              placementGroupSize={placementGroupSize}
              seatNumberByID={seatNumberByID}
              orderedStudents={orderedStudents}
              assignedIDs={assignedIDs}
              readOnly
              {...swapHandlers}
            />
          )}
        </div>
      ) : (
        <div className="empty-state">
          진행 중인 회차입니다. 모든 학생의 배정이 끝나면 이곳에 최종 자리배치가 표시됩니다.
        </div>
      )}
      {hasFinalSeatingResult && recentChanges.length > 0 && (
        <details className="seating-change-log">
          <summary>자리 바꾸기 기록 {changes.length}건</summary>
          <ul>
            {recentChanges.map((change, index) => (
              <li key={`${change.at}-${index}`}>
                <time>{formatChangeTime(change.at)}</time> {change.summary}
              </li>
            ))}
          </ul>
          {changes.length > recentChanges.length && <small>최근 {recentChanges.length}건만 표시합니다.</small>}
        </details>
      )}
    </section>
  );
}
