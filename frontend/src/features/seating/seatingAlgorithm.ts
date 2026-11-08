import { main as models } from "../../../wailsjs/go/models";
import { makeSeats } from "./seatLayout";

export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function generateSeatingPlacement({
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
}: {
  orderedStudents: models.Student[];
  seats: models.SeatingSeat[];
  rows: number;
  columns: number;
  layoutMode: "격자형" | "사용자 지정";
  plans: models.SeatingPlan[];
  selectedID: string;
  visualSeats: models.SeatingSeat[];
  canUseFixedSeats: boolean;
  fixedStudentIDs: string[];
  preventPreviousSeat: boolean;
  preventPreviousPartner: boolean;
}): { success: boolean; nextSeats?: models.SeatingSeat[]; error?: string } {
  if (orderedStudents.length > (layoutMode === "사용자 지정" ? seats.length : rows * columns)) {
    return {
      success: false,
      error:
        layoutMode === "사용자 지정"
          ? "학생 수보다 사용자 지정 좌석이 부족합니다. 좌석을 추가해 주세요."
          : "학생 수보다 자리가 부족합니다. 행·열을 늘려 주세요.",
    };
  }

  const previous = plans.find((plan) => plan.id !== selectedID);
  const previousSeatByStudent = new Map(
    (previous?.seats || [])
      .filter((seat) => seat.studentId)
      .map((seat) => [seat.studentId, seat.id]),
  );

  const previousPartnerByStudent = new Map<string, string>();
  (previous?.seats || []).forEach((seat) => {
    if (!seat.studentId) return;
    const partnerColumn = seat.column % 2 === 1 ? seat.column + 1 : seat.column - 1;
    const partner = (previous?.seats || []).find(
      (candidate) =>
        candidate.row === seat.row &&
        candidate.column === partnerColumn &&
        candidate.studentId,
    );
    if (partner?.studentId) {
      previousPartnerByStudent.set(seat.studentId, partner.studentId);
    }
  });

  const currentSeatByStudent = new Map(
    (seats || [])
      .filter((seat) => seat.studentId)
      .map((seat) => [seat.studentId, seat.id]),
  );

  const next =
    layoutMode === "사용자 지정"
      ? seats.map((seat) => ({ ...seat, studentId: "" } as models.SeatingSeat))
      : makeSeats(rows, columns, []);

  const occupied = new Set<string>();
  const drawSeatPool = visualSeats
    .slice(0, orderedStudents.length)
    .map((seat) => next.find((candidate) => candidate.id === seat.id))
    .filter((seat): seat is models.SeatingSeat => Boolean(seat));

  (canUseFixedSeats ? fixedStudentIDs : []).forEach((studentID) => {
    const priorSeat =
      previousSeatByStudent.get(studentID) || currentSeatByStudent.get(studentID);
    const target = next.find((seat) => seat.id === priorSeat && !occupied.has(seat.id));
    if (target) {
      if (!drawSeatPool.some((seat) => seat.id === target.id)) {
        drawSeatPool.push(target);
      }
      target.studentId = studentID;
      occupied.add(target.id);
    }
  });

  const fixedAssignedStudentIDs = new Set(
    next.filter((seat) => seat.studentId).map((seat) => seat.studentId),
  );

  function scoreSeat(studentID: string, seat: models.SeatingSeat) {
    let score = Math.random();
    if (preventPreviousSeat && previousSeatByStudent.get(studentID) === seat.id) {
      score -= 100;
    }
    if (preventPreviousPartner) {
      const partnerColumn = seat.column % 2 === 1 ? seat.column + 1 : seat.column - 1;
      const partner = next.find(
        (candidate) =>
          candidate.row === seat.row &&
          candidate.column === partnerColumn &&
          candidate.studentId,
      );
      if (
        partner?.studentId &&
        previousPartnerByStudent.get(studentID) === partner.studentId
      ) {
        score -= 100;
      }
    }
    return score;
  }

  const remainingStudents = shuffleArray(
    orderedStudents.filter((student) => !fixedAssignedStudentIDs.has(student.id)),
  );

  remainingStudents.forEach((student) => {
    const choices = drawSeatPool.filter((seat) => !seat.studentId);
    choices.sort(
      (left, right) => scoreSeat(student.id, right) - scoreSeat(student.id, left),
    );
    if (choices[0]) choices[0].studentId = student.id;
  });

  return { success: true, nextSeats: next };
}
