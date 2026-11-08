import {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useState,
} from "react";

// 배치도를 창 높이에 맞추는 책상 높이(px). 행 수가 많을수록 책상이 낮아지고,
// 40px 아래로는 줄이지 않는다(그 이하는 이름 선택칸을 읽기 어려움).
function useFitSeatHeight(rowCount: number) {
  const compute = () => {
    const usable = window.innerHeight * 0.74 - 70; // 교탁·여백을 뺀 배치도 높이
    const gap = rowCount > 6 ? 6 : 10;
    const height = (usable - gap * Math.max(0, rowCount - 1)) / Math.max(1, rowCount);
    return Math.round(Math.max(40, Math.min(82, height)));
  };
  const [height, setHeight] = useState(compute);
  useEffect(() => {
    const update = () => setHeight(compute());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowCount]);
  return height;
}
import { main as models } from "../../../wailsjs/go/models";

type SeatCommonProps = {
  seat: models.SeatingSeat;
  seatNumberByID: Map<string, number>;
  orderedStudents: models.Student[];
  assignedIDs: Set<string>;
};

function studentLabel(student: models.Student) {
  return `${String(student.number).padStart(2, "0")}번 ${student.name}`;
}

function SeatCell({
  seat,
  seatNumberByID,
  orderedStudents,
  assignedIDs,
  readOnly,
  onAssignSeat,
  onSeatDragStart,
  onSeatDrop,
  onSeatClick,
  selectedSeatID,
}: SeatCommonProps & {
  readOnly: boolean;
  onSeatClick?: (seatID: string) => void;
  selectedSeatID?: string;
  onAssignSeat?: (seatID: string, studentID: string) => void;
  onSeatDragStart?: (
    event: ReactDragEvent<HTMLDivElement>,
    seatID: string,
  ) => void;
  onSeatDrop?: (
    event: ReactDragEvent<HTMLDivElement>,
    seatID: string,
  ) => void;
}) {
  const seatNumber = seatNumberByID.get(seat.id) || 0;
  const student = orderedStudents.find((item) => item.id === seat.studentId);
  const clickable = readOnly && Boolean(onSeatClick);
  return (
    <div
      className={`${seat.studentId ? "seating-cell filled" : "seating-cell"}${clickable ? " swappable" : ""}${selectedSeatID === seat.id ? " swap-selected" : ""}`}
      key={seat.id}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-pressed={clickable ? selectedSeatID === seat.id : undefined}
      aria-label={clickable ? `${seatNumber ? `${seatNumber}번` : "여분"} 자리 ${student ? studentLabel(student) : "빈 자리"}` : undefined}
      onClick={clickable ? () => onSeatClick?.(seat.id) : undefined}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSeatClick?.(seat.id);
              }
            }
          : undefined
      }
      draggable={!readOnly && Boolean(seat.studentId)}
      onDragStart={
        !readOnly && onSeatDragStart
          ? (event) => onSeatDragStart(event, seat.id)
          : undefined
      }
      onDragOver={!readOnly ? (event) => event.preventDefault() : undefined}
      onDrop={!readOnly && onSeatDrop ? (event) => onSeatDrop(event, seat.id) : undefined}
    >
      <small>
        {/* 학생 수보다 많은 좌석은 번호 없이 "여분"으로 표시한다 */}
        <b>{seatNumber ? `${seatNumber}번` : "여분"}</b>
      </small>
      {readOnly ? (
        <strong>{student ? studentLabel(student) : "빈 자리"}</strong>
      ) : (
        <select
          value={seat.studentId}
          onChange={(event) => onAssignSeat?.(seat.id, event.target.value)}
        >
          <option value="">빈 자리</option>
          {orderedStudents
            .filter(
              (candidate) =>
                !assignedIDs.has(candidate.id) || candidate.id === seat.studentId,
            )
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {studentLabel(candidate)}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}

export function SeatingGrid({
  visualSeats,
  groupedSeatGroups,
  columns,
  isGroupedPlacement,
  placementGroupSize,
  seatNumberByID,
  orderedStudents,
  assignedIDs,
  readOnly,
  onAssignSeat,
  onSeatDragStart,
  onSeatDrop,
  onSeatClick,
  selectedSeatID,
}: {
  visualSeats: models.SeatingSeat[];
  groupedSeatGroups: models.SeatingSeat[][];
  columns: number;
  isGroupedPlacement: boolean;
  placementGroupSize: number;
  seatNumberByID: Map<string, number>;
  orderedStudents: models.Student[];
  assignedIDs: Set<string>;
  readOnly: boolean;
  onAssignSeat?: (seatID: string, studentID: string) => void;
  onSeatDragStart?: (
    event: ReactDragEvent<HTMLDivElement>,
    seatID: string,
  ) => void;
  onSeatDrop?: (
    event: ReactDragEvent<HTMLDivElement>,
    seatID: string,
  ) => void;
  onSeatClick?: (seatID: string) => void;
  selectedSeatID?: string;
}) {
  // 묶음 배치는 한 줄에 놓을 묶음 수가 "열 수 ÷ 묶음 크기"다.
  // 모둠형은 묶음이 이보다 많으므로 자동으로 다음 줄로 넘어가 2차원으로 놓인다.
  const groupColumns = Math.max(
    1,
    Math.min(groupedSeatGroups.length, Math.ceil(columns / Math.max(1, placementGroupSize))),
  );
  const rowCount = Math.max(1, ...visualSeats.map((seat) => seat.row || 1));
  const seatHeight = useFitSeatHeight(rowCount);
  const compact = seatHeight < 60;
  return (
    <div
      className={`${isGroupedPlacement ? "seating-grid grouped-grid" : "seating-grid"}${compact ? " compact" : ""}`}
      style={{
        gridTemplateColumns: isGroupedPlacement
          ? `repeat(${groupColumns}, minmax(0, 1fr))`
          : `repeat(${columns}, minmax(0, 1fr))`,
        "--seat-h": `${seatHeight}px`,
        gap: rowCount > 6 ? 6 : undefined,
      } as CSSProperties}
    >
      {isGroupedPlacement
        ? groupedSeatGroups.map((group, groupIndex) => (
            <div
              className={`seating-cluster cluster-${placementGroupSize}`}
              key={groupIndex}
              style={{
                gridTemplateColumns: `repeat(${placementGroupSize}, minmax(0, 1fr))`,
              }}
            >
              {group.map((seat) => (
                <SeatCell
                  key={seat.id}
                  seat={seat}
                  seatNumberByID={seatNumberByID}
                  orderedStudents={orderedStudents}
                  assignedIDs={assignedIDs}
                  readOnly={readOnly}
                  onAssignSeat={onAssignSeat}
                  onSeatDragStart={onSeatDragStart}
                  onSeatDrop={onSeatDrop}
                  onSeatClick={onSeatClick}
                  selectedSeatID={selectedSeatID}
                />
              ))}
            </div>
          ))
        : visualSeats.map((seat) => (
            <SeatCell
              key={seat.id}
              seat={seat}
              seatNumberByID={seatNumberByID}
              orderedStudents={orderedStudents}
              assignedIDs={assignedIDs}
              readOnly={readOnly}
              onAssignSeat={onAssignSeat}
              onSeatDragStart={onSeatDragStart}
              onSeatDrop={onSeatDrop}
              onSeatClick={onSeatClick}
              selectedSeatID={selectedSeatID}
            />
          ))}
    </div>
  );
}

export function CustomSeatCanvas({
  seats,
  seatNumberByID,
  orderedStudents,
  assignedIDs,
  readOnly,
  draggingID,
  emptyMessage,
  onAssignSeat,
  onDeleteSeat,
  onDragStart,
  onDragEnd,
  onPointerMove,
  onSeatClick,
  selectedSeatID,
}: {
  seats: models.SeatingSeat[];
  seatNumberByID: Map<string, number>;
  orderedStudents: models.Student[];
  assignedIDs: Set<string>;
  readOnly: boolean;
  draggingID?: string;
  emptyMessage?: string;
  onAssignSeat?: (seatID: string, studentID: string) => void;
  onDeleteSeat?: (seatID: string) => void;
  onDragStart?: (seatID: string) => void;
  onDragEnd?: () => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSeatClick?: (seatID: string) => void;
  selectedSeatID?: string;
}) {
  return (
    <div
      className={readOnly ? "custom-seat-canvas readonly-canvas" : "custom-seat-canvas"}
      onPointerMove={!readOnly ? onPointerMove : undefined}
      onPointerUp={!readOnly ? onDragEnd : undefined}
      onPointerLeave={!readOnly ? onDragEnd : undefined}
    >
      {seats.map((seat) => {
        const seatNumber = seatNumberByID.get(seat.id) || 0;
        const student = orderedStudents.find((item) => item.id === seat.studentId);
        if (readOnly) {
          const clickable = Boolean(onSeatClick);
          return (
            <div
              className={`${seat.studentId ? "custom-seat readonly filled" : "custom-seat readonly"}${clickable ? " swappable" : ""}${selectedSeatID === seat.id ? " swap-selected" : ""}`}
              key={seat.id}
              style={{ left: `${(seat.x || 500) / 10}%`, top: `${(seat.y || 500) / 10}%` }}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-pressed={clickable ? selectedSeatID === seat.id : undefined}
              aria-label={clickable ? `${seatNumber ? `${seatNumber}번` : "여분"} 자리 ${student ? studentLabel(student) : "빈 자리"}` : undefined}
              onClick={clickable ? () => onSeatClick?.(seat.id) : undefined}
              onKeyDown={
                clickable
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSeatClick?.(seat.id);
                      }
                    }
                  : undefined
              }
            >
              <b>{seatNumber ? `${seatNumber}번` : "여분"}</b>
              <small>{student ? studentLabel(student) : "빈 자리"}</small>
            </div>
          );
        }
        return (
          <div
            className={`custom-seat ${seat.studentId ? "filled" : ""} ${draggingID === seat.id ? "dragging" : ""}`}
            key={seat.id}
            style={{ left: `${(seat.x || 500) / 10}%`, top: `${(seat.y || 500) / 10}%` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              onDragStart?.(seat.id);
            }}
            onPointerUp={onDragEnd}
          >
            <div className="custom-seat-handle" aria-label={`${seatNumber}번 자리 이동`}>
              ⠿ <b>{seatNumber ? `${seatNumber}번` : "여분"}</b>
            </div>
            <select
              value={seat.studentId}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => onAssignSeat?.(seat.id, event.target.value)}
            >
              <option value="">빈 자리</option>
              {orderedStudents
                .filter(
                  (candidate) =>
                    !assignedIDs.has(candidate.id) || candidate.id === seat.studentId,
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {studentLabel(candidate)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="custom-seat-delete"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onDeleteSeat?.(seat.id)}
              aria-label={`${seatNumber}번 자리 삭제`}
            >
              ×
            </button>
          </div>
        );
      })}
      {!readOnly && seats.length === 0 && emptyMessage && (
        <p className="custom-seat-empty">{emptyMessage}</p>
      )}
    </div>
  );
}
