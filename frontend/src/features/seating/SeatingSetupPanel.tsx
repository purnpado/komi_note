import type { Dispatch, SetStateAction } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { CustomSeatCanvas, SeatingGrid } from "./SeatingBoard";

export function SeatingSetupPanel({
  title,
  setTitle,
  deskPosition,
  setDeskPosition,
  layoutMode,
  switchLayoutMode,
  seats,
  rows,
  columns,
  changeLayout,
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
  canUseFixedSeats,
  fixedStudentIDs,
  setFixedStudentIDs,
  orderedStudents,
  drawSeats,
  savePlan,
  visualSeats,
  groupedSeatGroups,
  groupedPlacement,
  groupSize,
  seatNumberByID,
  assignedIDs,
  customDraggingID,
  setCustomDraggingID,
  assignSeat,
  deleteCustomSeat,
  moveCustomSeat,
  addCustomSeat,
  clearCustomSeats,
  handleSeatDragStart,
  handleSeatDrop,
}: {
  title: string;
  setTitle: (value: string) => void;
  deskPosition: string;
  setDeskPosition: (value: string) => void;
  layoutMode: "격자형" | "사용자 지정";
  switchLayoutMode: (mode: "격자형" | "사용자 지정") => void;
  seats: models.SeatingSeat[];
  rows: number;
  columns: number;
  changeLayout: (r: number, c: number) => void;
  placementMode: string;
  setPlacementMode: (value: string) => void;
  drawMethod: string;
  setDrawMethod: (value: string) => void;
  competitionMethod: string;
  setCompetitionMethod: (value: string) => void;
  preventPreviousSeat: boolean;
  setPreventPreviousSeat: (value: boolean) => void;
  preventPreviousPartner: boolean;
  setPreventPreviousPartner: (value: boolean) => void;
  canUseFixedSeats: boolean;
  fixedStudentIDs: string[];
  setFixedStudentIDs: Dispatch<SetStateAction<string[]>>;
  orderedStudents: models.Student[];
  drawSeats: () => void;
  savePlan: () => Promise<void>;
  visualSeats: models.SeatingSeat[];
  groupedSeatGroups: models.SeatingSeat[][];
  groupedPlacement: boolean;
  groupSize: number;
  seatNumberByID: Map<string, number>;
  assignedIDs: Set<string>;
  customDraggingID: string;
  setCustomDraggingID: (id: string) => void;
  assignSeat: (seatID: string, studentID: string) => void;
  deleteCustomSeat: (seatID: string) => void;
  moveCustomSeat: (event: React.PointerEvent<HTMLDivElement>) => void;
  addCustomSeat: () => void;
  clearCustomSeats: () => void;
  handleSeatDragStart: (event: React.DragEvent<HTMLDivElement>, seatID: string) => void;
  handleSeatDrop: (event: React.DragEvent<HTMLDivElement>, targetSeatID: string) => void;
}) {
  return (
    <section className="seating-setup-workspace">
      <section className="panel seating-settings">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">2단계 · 배치 기준</p>
            <h3>자리 배치 설정</h3>
            <p>입력하면 오른쪽 배치도에 바로 반영됩니다.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            배치 이름
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 10월 자리 배치"
            />
          </label>
          <label>
            교탁 위치
            <select
              value={deskPosition}
              onChange={(event) => setDeskPosition(event.target.value)}
            >
              <option>앞쪽 중앙</option>
              <option>앞쪽 왼쪽</option>
              <option>앞쪽 오른쪽</option>
              <option>뒤쪽 중앙</option>
            </select>
          </label>
          <label>
            배치도 방식
            <select
              value={layoutMode}
              onChange={(event) => switchLayoutMode(event.target.value as "격자형" | "사용자 지정")}
            >
              <option value="격자형">행·열 격자형</option>
              <option value="사용자 지정">사용자 지정 교실형</option>
            </select>
          </label>
          {layoutMode === "사용자 지정" && (
            <div className="custom-layout-summary">
              <b>좌석 {seats.length}개</b>
              <span>좌석을 끌어 실제 교실 위치에 놓으세요.</span>
            </div>
          )}
          {layoutMode === "격자형" && (
            <>
              <label>
                행 수
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={rows}
                  onChange={(event) => changeLayout(Number(event.target.value), columns)}
                />
              </label>
              <label>
                열 수
                <input
                  type="number"
                  min="1"
                  max="40"
                  value={columns}
                  onChange={(event) => changeLayout(rows, Number(event.target.value))}
                />
              </label>
              <label>
                배치 순서
                <select
                  value={placementMode}
                  onChange={(event) => setPlacementMode(event.target.value)}
                >
                  <option>행 기준</option>
                  <option>열 기준</option>
                  <option>2열 묶음</option>
                  <option>3열 묶음</option>
                  <option>모둠형</option>
                </select>
              </label>
            </>
          )}
          <label>
            배정 방식
            <select
              value={drawMethod}
              onChange={(event) => setDrawMethod(event.target.value)}
            >
              <option>랜덤 룰렛 배정</option>
              <option>랜덤 사다리 배정</option>
              <option>희망 경쟁배정</option>
            </select>
          </label>
          {drawMethod === "희망 경쟁배정" && (
            <label>
              경쟁 방식
              <select
                value={competitionMethod}
                onChange={(event) => setCompetitionMethod(event.target.value)}
              >
                <option>가위바위보</option>
              </select>
            </label>
          )}
        </div>
        <div className="seating-rules">
          {drawMethod === "희망 경쟁배정" && (
            <p className="muted-copy">
              학생은 전자칠판을 보고 1~3지망 번호를 제출합니다. 복수 후보 좌석은 가위바위보 토너먼트로 결정합니다.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={preventPreviousSeat}
              onChange={(event) => setPreventPreviousSeat(event.target.checked)}
            />{" "}
            이전 자리 재배치 금지
          </label>
          <label>
            <input
              type="checkbox"
              checked={preventPreviousPartner}
              onChange={(event) => setPreventPreviousPartner(event.target.checked)}
            />{" "}
            이전 짝꿍 재배치 금지
          </label>
        </div>
        <details className="fixed-students" open={canUseFixedSeats}>
          <summary>
            고정 학생 선택 {canUseFixedSeats ? `(${fixedStudentIDs.length}명 선택)` : "(첫 배치 후 사용 가능)"}
          </summary>
          {canUseFixedSeats ? (
            <>
              <p className="muted-copy">
                선택한 학생은 룰렛·사다리에서도 다른 학생과 같은 순서와 연출을 거치지만,
                이전 배치의 같은 좌석 번호로 배정됩니다. 이 정보는 교사 화면에만 표시됩니다.
              </p>
              <div className="fixed-students-grid">
                {orderedStudents.map((student) => {
                  const checked = fixedStudentIDs.includes(student.id);
                  return (
                    <label key={student.id} className={checked ? "selected" : ""}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setFixedStudentIDs((current) =>
                            event.target.checked
                              ? [...current, student.id]
                              : current.filter((id) => id !== student.id),
                          )
                        }
                      />
                      <span className="fixed-student-num">{student.number}번</span>
                      <span className="fixed-student-name">{student.name}</span>
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="muted-copy">
              첫 자리배치를 저장한 뒤, 다음 배치부터 필요한 학생만 선택할 수 있습니다.
            </p>
          )}
        </details>
        <div className="dialog-actions">
          <button className="accent-button" onClick={drawSeats}>
            임시 배치 미리보기
          </button>
          <button className="primary-button" onClick={() => void savePlan()}>
            배치 저장
          </button>
        </div>
      </section>
      <section className="panel seating-editor seating-live-preview">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">실시간 미리보기</p>
            <h3>설정된 자리배치도</h3>
            <p>
              {layoutMode === "사용자 지정"
                ? `사용자 지정 · 좌석 ${seats.length}개`
                : `${rows}행 × ${columns}열 · ${placementMode}`}{" "}
              · 자리 번호는 배치 순서대로 표시됩니다.
            </p>
          </div>
        </div>
        <div className="seating-board">
          <div className="teacher-desk">교탁 · {deskPosition}</div>
          {layoutMode === "사용자 지정" ? (
            <>
              <CustomSeatCanvas
                seats={visualSeats}
                seatNumberByID={seatNumberByID}
                orderedStudents={orderedStudents}
                assignedIDs={assignedIDs}
                readOnly={false}
                draggingID={customDraggingID}
                emptyMessage="아래 버튼으로 좌석을 추가해 주세요."
                onAssignSeat={assignSeat}
                onDeleteSeat={deleteCustomSeat}
                onDragStart={setCustomDraggingID}
                onDragEnd={() => setCustomDraggingID("")}
                onPointerMove={moveCustomSeat}
              />
              <div className="custom-layout-actions">
                <button type="button" className="outline-button" onClick={addCustomSeat}>
                  + 좌석 추가
                </button>
                <button type="button" className="quiet-button" onClick={clearCustomSeats}>
                  전체 비우기
                </button>
              </div>
            </>
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
              readOnly={false}
              onAssignSeat={assignSeat}
              onSeatDragStart={handleSeatDragStart}
              onSeatDrop={handleSeatDrop}
            />
          )}
        </div>
      </section>
    </section>
  );
}
