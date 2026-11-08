import { main as models } from "../../../wailsjs/go/models";

export type SeatingPlacementMode =
  | "행 기준"
  | "열 기준"
  | "2열 묶음"
  | "3열 묶음"
  | "모둠형";

export function defaultGridDimensions(count: number) {
  const safeCount = Math.max(1, count);
  const columns = Math.min(6, safeCount);
  return {
    rows: Math.max(1, Math.ceil(safeCount / columns)),
    columns,
  };
}

export function makeSeats(
  nextRows: number,
  nextColumns: number,
  current: models.SeatingSeat[] = [],
) {
  const currentByID = new Map((current || []).map((seat) => [seat.id, seat]));
  return Array.from({ length: nextRows * nextColumns }, (_, index) => {
    const row = Math.floor(index / nextColumns) + 1;
    const column = (index % nextColumns) + 1;
    const id = "r" + row + "c" + column;
    const old = currentByID.get(id);
    return {
      id,
      row,
      column,
      x:
        nextColumns === 1
          ? 500
          : Math.round(80 + ((column - 1) * 840) / (nextColumns - 1)),
      y:
        nextRows === 1
          ? 500
          : Math.round(100 + ((row - 1) * 800) / (nextRows - 1)),
      label: row + "열 " + column + "번",
      studentId: old?.studentId || "",
    } as models.SeatingSeat;
  });
}

export function seatsForRoster(
  source: models.SeatingSeat[],
  studentCount: number,
  mode: "격자형" | "사용자 지정",
) {
  if (studentCount === 0) return source;
  return [...source]
    .sort((left, right) =>
      mode === "사용자 지정"
        ? left.y - right.y || left.x - right.x
        : left.row - right.row || left.column - right.column,
    )
    .slice(0, studentCount);
}

export function orderSeatsForPlacement(
  source: models.SeatingSeat[],
  placementMode: SeatingPlacementMode | string,
  layoutMode: "격자형" | "사용자 지정",
) {
  return [...source].sort((left, right) => {
    if (layoutMode === "사용자 지정") return left.y - right.y || left.x - right.x;
    if (placementMode === "열 기준") return left.column - right.column || left.row - right.row;
    if (placementMode === "2열 묶음" || placementMode === "3열 묶음") {
      const size = placementMode === "2열 묶음" ? 2 : 3;
      return (
        Math.floor((left.column - 1) / size) -
          Math.floor((right.column - 1) / size) ||
        left.row - right.row ||
        left.column - right.column
      );
    }
    if (placementMode === "모둠형") {
      return (
        Math.floor((left.row - 1) / 2) - Math.floor((right.row - 1) / 2) ||
        Math.floor((left.column - 1) / 2) - Math.floor((right.column - 1) / 2) ||
        left.row - right.row ||
        left.column - right.column
      );
    }
    return left.row - right.row || left.column - right.column;
  });
}

export function placementGroupSize(placementMode: SeatingPlacementMode | string) {
  return placementMode === "3열 묶음" ? 3 : 2;
}

export function isGroupedPlacement(placementMode: SeatingPlacementMode | string) {
  return ["2열 묶음", "3열 묶음", "모둠형"].includes(placementMode);
}

export function groupSeatsForPlacement(
  source: models.SeatingSeat[],
  placementMode: SeatingPlacementMode | string,
) {
  if (!isGroupedPlacement(placementMode)) return [];
  const size = placementGroupSize(placementMode);
  const groups = new Map<string, models.SeatingSeat[]>();
  for (const seat of orderSeatsForPlacement(source, placementMode, "격자형")) {
    const key =
      placementMode === "모둠형"
        ? `${Math.floor((seat.row - 1) / 2)}-${Math.floor((seat.column - 1) / 2)}`
        : String(Math.floor((seat.column - 1) / size));
    const group = groups.get(key) || [];
    group.push(seat);
    groups.set(key, group);
  }
  // 모둠형은 "모둠 행-모둠 열" 순서(위→아래, 왼쪽→오른쪽)로 정렬해야 화면에서 교실처럼 2차원으로 놓인다.
  return [...groups.entries()]
    .sort(([left], [right]) => {
      const [leftRow, leftColumn = 0] = left.split("-").map(Number);
      const [rightRow, rightColumn = 0] = right.split("-").map(Number);
      return leftRow - rightRow || leftColumn - rightColumn;
    })
    .map(([, group]) => group);
}
