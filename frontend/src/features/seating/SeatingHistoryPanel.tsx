import { main as models } from "../../../wailsjs/go/models";
import { CustomSeatCanvas, SeatingGrid } from "./SeatingBoard";

export function SeatingHistoryPanel({
  plans,
  selectedID,
  selectedPlan,
  rows,
  columns,
  placementMode,
  deskPosition,
  layoutMode,
  displaySeats,
  visualSeats,
  groupedSeatGroups,
  groupedPlacement,
  groupSize,
  seatNumberByID,
  orderedStudents,
  assignedIDs,
  formatRecordedAt,
  onLoadPlan,
  onRequestDelete,
  onEditPlan,
}: {
  plans: models.SeatingPlan[];
  selectedID: string;
  selectedPlan: models.SeatingPlan | null;
  rows: number;
  columns: number;
  placementMode: string;
  deskPosition: string;
  layoutMode: string;
  displaySeats: models.SeatingSeat[];
  visualSeats: models.SeatingSeat[];
  groupedSeatGroups: models.SeatingSeat[][];
  groupedPlacement: boolean;
  groupSize: number;
  seatNumberByID: Map<string, number>;
  orderedStudents: models.Student[];
  assignedIDs: Set<string>;
  formatRecordedAt: (value: string) => string;
  onLoadPlan: (plan: models.SeatingPlan) => void;
  onRequestDelete: () => void;
  onEditPlan: () => void;
}) {
  return (
    <section className="history-workspace">
      <aside className="panel seating-history">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">1단계 · 누적 이력</p>
            <h3>이전 자리배치도</h3>
            <p>암호화 보관함에 저장된 배치안입니다.</p>
          </div>
          {selectedPlan && (
            <button
              className="danger-button"
              onClick={onRequestDelete}
            >
              이력 삭제
            </button>
          )}
        </div>
        {plans.length === 0 ? (
          <p className="empty-state">
            저장된 자리 배치가 없습니다. 새 배치를 만든 뒤 저장하면 이곳에 누적됩니다.
          </p>
        ) : (
          plans.map((plan) => (
            <button
              key={plan.id}
              className={
                plan.id === selectedID
                  ? "seating-history-item active"
                  : "seating-history-item"
              }
              onClick={() => onLoadPlan(plan)}
            >
              <strong>{plan.title}</strong>
              <small>
                {formatRecordedAt(plan.createdAt)} ·{" "}
                {plan.drawMethod || "수동 설정"}
              </small>
            </button>
          ))
        )}
      </aside>
      <section className="panel seating-editor history-preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">저장 내용 미리보기</p>
            <h3>{selectedPlan?.title || "배치도를 선택해 주세요"}</h3>
            <p>
              {selectedPlan
                ? `${rows}행 × ${columns}열 · ${placementMode} · ${formatRecordedAt(selectedPlan.createdAt)}`
                : "왼쪽 목록에서 저장된 배치도를 선택하면 결과를 읽기 전용으로 표시합니다."}
            </p>
          </div>
          {selectedPlan && (
            <button className="quiet-button" onClick={onEditPlan}>
              이 배치 수정
            </button>
          )}
        </div>
        {selectedPlan && (
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
                isGroupedPlacement={groupedPlacement}
                placementGroupSize={groupSize}
                seatNumberByID={seatNumberByID}
                orderedStudents={orderedStudents}
                assignedIDs={assignedIDs}
                readOnly
              />
            )}
          </div>
        )}
      </section>
    </section>
  );
}
