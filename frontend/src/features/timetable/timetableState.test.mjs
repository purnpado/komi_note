import assert from "node:assert/strict";
import test from "node:test";
import { cellsBeyond, computePeriods, dropBeyond, lessonState, lessonsForDate, periodsError, rosterLabel, setCell, weekDates, weekdayOf } from "./timetableState.ts";

const rule = { firstStart: "08:50", lessonMinutes: 45, breakMinutes: 10, lunchAfter: 4, lunchMinutes: 60, periodCount: 6 };

function sampleBook() {
  const { periods } = computePeriods(rule);
  let book = { rule, periods, activeSchoolYear: "2026", activeSemester: "2", timetables: [], changes: [] };
  book = setCell(book, "teacher", "2026", "2", { day: 1, period: 1, subject: "과학", className: "2-1", room: "", note: "", courseRosterId: "r1" });
  book = setCell(book, "teacher", "2026", "2", { day: 1, period: 3, subject: "과학", className: "2-3", room: "과학실", note: "", courseRosterId: "" });
  book = setCell(book, "teacher", "2026", "1", { day: 1, period: 2, subject: "1학기 수업", className: "1-1", room: "", note: "", courseRosterId: "" });
  return book;
}

test("교시 규칙으로 점심시간을 넣어 시각을 계산한다", () => {
  const { periods, error } = computePeriods(rule);
  assert.equal(error, "");
  assert.deepEqual(periods.map((period) => `${period.start}-${period.end}`), ["08:50-09:35", "09:45-10:30", "10:40-11:25", "11:35-12:20", "13:20-14:05", "14:15-15:00"]);
  assert.match(computePeriods({ ...rule, firstStart: "9시" }).error, /09:00/);
  assert.match(computePeriods({ ...rule, lunchAfter: 6 }).error, /점심/);
});

test("교시별로 고친 시각이 겹치면 알려 준다", () => {
  const { periods } = computePeriods(rule);
  assert.equal(periodsError(periods), "");
  assert.match(periodsError([...periods.slice(0, 1), { number: 2, start: "09:30", end: "10:15" }]), /겹칩니다/);
  assert.match(periodsError([{ number: 1, start: "10:00", end: "09:00" }]), /늦어야/);
});

test("빈 칸으로 저장하면 공강이 되고 다른 학기 칸은 그대로 둔다", () => {
  let book = sampleBook();
  book = setCell(book, "teacher", "2026", "2", { day: 1, period: 3, subject: " ", className: "", room: "", note: "", courseRosterId: "" });
  const second = book.timetables.find((table) => table.semester === "2");
  const first = book.timetables.find((table) => table.semester === "1");
  assert.equal(second.cells.length, 1);
  assert.equal(first.cells.length, 1);
});

test("날짜별 교체·보강·결강을 그날 수업에 반영한다", () => {
  const book = sampleBook();
  book.changes = [
    { id: "a", date: "2026-11-09", period: 1, kind: "결강", target: "teacher", subject: "", className: "", room: "", note: "출장", courseRosterId: "" },
    { id: "b", date: "2026-11-09", period: 5, kind: "보강", target: "teacher", subject: "과학", className: "2-5", room: "", note: "", courseRosterId: "" },
    { id: "c", date: "2026-11-09", period: 3, kind: "교체", target: "teacher", subject: "과학", className: "2-4", room: "", note: "", courseRosterId: "" },
    { id: "d", date: "2026-11-09", period: 2, kind: "결강", target: "teacher", subject: "", className: "", room: "", note: "", courseRosterId: "" },
    { id: "e", date: "2026-11-09", period: 4, kind: "보강", target: "class", subject: "체육", className: "", room: "", note: "", courseRosterId: "" },
  ];
  const lessons = lessonsForDate(book, "teacher", "2026-11-09");
  assert.deepEqual(lessons.map((lesson) => `${lesson.period}:${lesson.change || "-"}:${lesson.className}`), ["1:결강:2-1", "3:교체:2-4", "5:보강:2-5"]);
  assert.equal(lessons[0].note, "출장");
  assert.equal(lessons[0].courseRosterId, "r1");
  assert.equal(lessonsForDate(book, "teacher", "2026-11-16").length, 2);
  assert.equal(lessonsForDate(book, "teacher", "2026-11-08").length, 0);
});

test("주말에는 다음 주 월~금을, 평일에는 이번 주를 보여 준다", () => {
  assert.deepEqual(weekDates("2026-11-11"), { dates: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"], nextWeek: false });
  assert.equal(weekDates("2026-11-08").dates[0], "2026-11-09");
  assert.equal(weekDates("2026-11-07").dates[0], "2026-11-09");
  assert.equal(weekDates("2026-11-08").nextWeek, true);
  assert.equal(weekdayOf("2026-11-13"), 5);
  assert.equal(weekdayOf("2026-11-14"), 0);
});

test("교시를 줄이면 사라질 칸을 세고 지운다", () => {
  const book = sampleBook();
  book.changes = [{ id: "x", date: "2026-11-09", period: 6, kind: "결강", target: "teacher" }];
  assert.equal(cellsBeyond(book, 2), 2);
  const trimmed = dropBeyond(book, 2);
  assert.equal(cellsBeyond(trimmed, 2), 0);
  assert.equal(trimmed.timetables.find((table) => table.semester === "2").cells.length, 1);
});

test("지난 수업·진행 중·이후 수업을 구분하고 반 이름을 짧게 보여 준다", () => {
  const lesson = { start: "09:00", end: "09:45" };
  assert.equal(lessonState(lesson, 8 * 60), "later");
  assert.equal(lessonState(lesson, 9 * 60 + 10), "now");
  assert.equal(lessonState(lesson, 9 * 60 + 45), "past");
  assert.equal(rosterLabel({ grade: "2", className: "3" }), "2-3");
  assert.equal(rosterLabel({ grade: "2", className: "2-3" }), "2-3");
});
