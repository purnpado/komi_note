// 시간표 화면과 대시보드가 함께 쓰는 계산 함수입니다. 화면 상태와 분리해 자동 검사합니다.
import type { main as models } from "../../../wailsjs/go/models";

export type TimetableKind = "teacher" | "class";
export const DAY_LABELS = ["월", "화", "수", "목", "금"];
export const CHANGE_KINDS = ["교체", "보강", "결강"] as const;

type Rule = Pick<models.TimetableBellRule, "firstStart" | "lessonMinutes" | "breakMinutes" | "lunchAfter" | "lunchMinutes" | "periodCount">;
type Period = Pick<models.TimetablePeriod, "number" | "start" | "end">;
type Cell = Omit<models.TimetableCell, never>;
type Book = Pick<models.TimetableBook, "periods" | "activeSchoolYear" | "activeSemester" | "timetables" | "changes"> & { rule?: Rule };

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatClock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

// computePeriods는 Go의 ComputePeriods와 같은 규칙으로 교시 시각을 미리 계산합니다(저장 때 서버가 다시 검사).
export function computePeriods(rule: Rule): { periods: Period[]; error: string } {
  const start = parseClock(rule.firstStart);
  if (start === null) return { periods: [], error: "1교시 시작 시각을 09:00처럼 입력해 주세요." };
  if (!(rule.periodCount >= 1 && rule.periodCount <= 10)) return { periods: [], error: "교시 수는 1~10 사이로 입력해 주세요." };
  if (!(rule.lessonMinutes >= 10 && rule.lessonMinutes <= 180)) return { periods: [], error: "수업 길이는 10~180분 사이로 입력해 주세요." };
  if (!(rule.breakMinutes >= 0 && rule.breakMinutes <= 60)) return { periods: [], error: "쉬는 시간은 0~60분 사이로 입력해 주세요." };
  if (rule.lunchAfter < 0 || (rule.lunchAfter !== 0 && rule.lunchAfter >= rule.periodCount)) return { periods: [], error: "점심시간은 마지막 교시보다 앞 교시 뒤에 넣어 주세요." };
  if (rule.lunchAfter > 0 && !(rule.lunchMinutes >= 10 && rule.lunchMinutes <= 180)) return { periods: [], error: "점심시간 길이는 10~180분 사이로 입력해 주세요." };
  const periods: Period[] = [];
  let cursor = start;
  for (let number = 1; number <= rule.periodCount; number++) {
    const end = cursor + rule.lessonMinutes;
    if (end >= 24 * 60) return { periods: [], error: "마지막 교시가 자정을 넘습니다. 시작 시각과 길이를 확인해 주세요." };
    periods.push({ number, start: formatClock(cursor), end: formatClock(end) });
    cursor = end + (number === rule.lunchAfter ? rule.lunchMinutes : rule.breakMinutes);
  }
  return { periods, error: "" };
}

// periodsError는 교시별로 고친 시각이 올바른지 검사합니다.
export function periodsError(periods: Period[]): string {
  let previousEnd = -1;
  for (const [index, period] of periods.entries()) {
    const start = parseClock(period.start);
    const end = parseClock(period.end);
    if (start === null || end === null) return `${index + 1}교시 시각을 09:00처럼 입력해 주세요.`;
    if (end <= start) return `${index + 1}교시 끝 시각이 시작 시각보다 늦어야 합니다.`;
    if (start < previousEnd) return `${index + 1}교시가 앞 교시와 겹칩니다.`;
    previousEnd = end;
  }
  return "";
}

export function timetableID(kind: TimetableKind, schoolYear: string, semester: string) {
  return `${kind}-${schoolYear}-${semester}`;
}

export function findTimetable(book: Book, kind: TimetableKind, schoolYear = book.activeSchoolYear, semester = book.activeSemester) {
  return (book.timetables || []).find((table) => table.kind === kind && table.schoolYear === schoolYear && table.semester === semester);
}

export function cellAt(book: Book, kind: TimetableKind, day: number, period: number, schoolYear?: string, semester?: string) {
  return findTimetable(book, kind, schoolYear, semester)?.cells.find((cell) => cell.day === day && cell.period === period);
}

function isEmptyCell(cell: Partial<Cell>) {
  return !cell.subject?.trim() && !cell.className?.trim() && !cell.room?.trim() && !cell.note?.trim() && !cell.courseRosterId;
}

// setCell은 한 칸을 바꾼 새 시간표를 돌려줍니다. 내용이 비면 칸을 지웁니다(공강).
export function setCell<T extends Book>(book: T, kind: TimetableKind, schoolYear: string, semester: string, cell: Cell): T {
  const id = timetableID(kind, schoolYear, semester);
  const tables = [...(book.timetables || [])];
  let index = tables.findIndex((table) => table.kind === kind && table.schoolYear === schoolYear && table.semester === semester);
  if (index < 0) {
    tables.push({ id, kind, schoolYear, semester, cells: [] } as unknown as models.Timetable);
    index = tables.length - 1;
  }
  const others = tables[index].cells.filter((item) => !(item.day === cell.day && item.period === cell.period));
  const cells = isEmptyCell(cell) ? others : [...others, cell as models.TimetableCell];
  cells.sort((a, b) => a.day - b.day || a.period - b.period);
  tables[index] = { ...tables[index], cells } as models.Timetable;
  return { ...book, timetables: tables };
}

// cellsBeyond는 교시 수를 줄이면 사라질 칸 수를 셉니다(모든 학기·날짜별 변경 포함).
export function cellsBeyond(book: Book, periodCount: number) {
  const cells = (book.timetables || []).reduce((sum, table) => sum + table.cells.filter((cell) => cell.period > periodCount).length, 0);
  const changes = (book.changes || []).filter((change) => change.period > periodCount).length;
  return cells + changes;
}

export function dropBeyond<T extends Book>(book: T, periodCount: number): T {
  return {
    ...book,
    timetables: (book.timetables || []).map((table) => ({ ...table, cells: table.cells.filter((cell) => cell.period <= periodCount) })),
    changes: (book.changes || []).filter((change) => change.period <= periodCount),
  };
}

// weekdayOf는 "YYYY-MM-DD"의 요일을 월=1~금=5로, 주말은 0으로 돌려줍니다.
export function weekdayOf(date: string) {
  const value = new Date(`${date}T12:00:00`);
  const day = value.getDay();
  return day === 0 || day === 6 ? 0 : day;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

// weekDates는 그 주의 월~금 날짜를 돌려줍니다. 토·일요일에는 다음 주를 돌려줍니다.
export function weekDates(today: string) {
  const day = new Date(`${today}T12:00:00`).getDay();
  const toMonday = day === 0 ? 1 : day === 6 ? 2 : 1 - day;
  const monday = shiftDate(today, toMonday);
  return { dates: [0, 1, 2, 3, 4].map((offset) => shiftDate(monday, offset)), nextWeek: day === 0 || day === 6 };
}

export type Lesson = {
  period: number;
  start: string;
  end: string;
  subject: string;
  className: string;
  room: string;
  note: string;
  courseRosterId: string;
  change: "" | "교체" | "보강" | "결강";
};

// lessonsForDate는 지금 학기 시간표에 그날의 교체·보강·결강을 반영한 수업 목록입니다.
export function lessonsForDate(book: Book, kind: TimetableKind, date: string): Lesson[] {
  const day = weekdayOf(date);
  const periods = book.periods || [];
  const base = day ? findTimetable(book, kind)?.cells.filter((cell) => cell.day === day) || [] : [];
  const changes = (book.changes || []).filter((change) => change.date === date && (change.target || "teacher") === kind);
  const lessons: Lesson[] = [];
  for (const period of periods) {
    const cell = base.find((item) => item.period === period.number);
    const change = changes.find((item) => item.period === period.number);
    if (change) {
      const source = change.kind === "결강" ? cell : change;
      if (change.kind === "결강" && !cell) continue;
      lessons.push({
        period: period.number, start: period.start, end: period.end,
        subject: source?.subject || "", className: source?.className || "", room: source?.room || "",
        note: change.note || "", courseRosterId: source?.courseRosterId || "",
        change: change.kind as Lesson["change"],
      });
    } else if (cell) {
      lessons.push({ period: period.number, start: period.start, end: period.end, subject: cell.subject, className: cell.className, room: cell.room, note: cell.note, courseRosterId: cell.courseRosterId, change: "" });
    }
  }
  return lessons;
}

// lessonState는 지금 시각 기준으로 수업이 끝났는지 진행 중인지 알려 줍니다(지난 수업 흐리게 표시용).
export function lessonState(lesson: Pick<Lesson, "start" | "end">, nowMinutes: number): "past" | "now" | "later" {
  const start = parseClock(lesson.start) ?? 0;
  const end = parseClock(lesson.end) ?? 0;
  if (nowMinutes >= end) return "past";
  if (nowMinutes >= start) return "now";
  return "later";
}

// rosterLabel은 수업 명렬을 "2-3"처럼 짧게 보여 줍니다.
export function rosterLabel(roster: Pick<models.CourseRoster, "grade" | "className">) {
  const name = (roster.className || "").trim();
  return /^\d+$/.test(name) && roster.grade ? `${roster.grade}-${name}` : name;
}

// lunchAfter는 교시 표에서 점심 줄을 넣을 교시 번호입니다(규칙에 없거나 교시 수를 벗어나면 0).
export function lunchAfter(book: Book) {
  const value = book.rule?.lunchAfter || 0;
  return value > 0 && value < (book.periods || []).length ? value : 0;
}
