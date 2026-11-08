import { main as models } from "../../../wailsjs/go/models";
import { CustomSeatCanvas, SeatingGrid } from "./SeatingBoard";

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
}) {
  return (
    <section className="panel seating-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">4단계 · 확정 및 결과</p>
          <h3>{hasFinalSeatingResult ? "최종 자리배치" : "자리배정 진행 중"}</h3>
          <p>
            {hasFinalSeatingResult
              ? "배정 완료 뒤 저장된 결과입니다. 가로 방향 자리표로 인쇄할 수 있습니다."
              : "룰렛 배정이 끝난 뒤 최종 결과와 인쇄 버튼이 열립니다."}
          </p>
        </div>
        {hasFinalSeatingResult && (
          <button className="primary-button" onClick={onPrint}>
            가로 결과 인쇄
          </button>
        )}
      </div>
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
            />
          )}
        </div>
      ) : (
        <div className="empty-state">
          진행 중인 회차입니다. 학생별 룰렛이 모두 끝나면 이곳에 최종 자리배치가 표시됩니다.
        </div>
      )}
    </section>
  );
}
