import assert from "node:assert/strict";
import test from "node:test";
import { addDays, dayLabel, entriesByDate, eventProblem, eventTime, monthGrid, rangeLabel, reminderText, upcomingEvents, weekDays } from "./scheduleState.ts";

const ev = (over) => ({ id: over.title || "e", title: "일정", startDate: "2026-11-20", endDate: "", allDay: true, category: "기타", reminders: [], ...over });

test("달력 칸: 일요일 시작 6주", () => {
  const grid = monthGrid(2026, 11);
  assert.equal(grid.length, 42);
  assert.equal(grid[0].date, "2026-11-01", "2026년 11월 1일은 일요일");
  assert.equal(grid[0].inMonth, true);
  assert.equal(grid[30].date, "2026-12-01");
  assert.equal(grid[30].inMonth, false);
  assert.equal(monthGrid(2026, 12)[0].date, "2026-11-29");
  assert.deepEqual(weekDays("2026-11-11"), ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("날짜별 항목: 여러 날 일정·할 일·시간표 교체", () => {
  const events = [
    ev({ title: "수학여행", startDate: "2026-11-18", endDate: "2026-11-20", category: "학교 행사" }),
    ev({ title: "회의", startDate: "2026-11-19", allDay: false, startTime: "15:00", endTime: "16:00" }),
  ];
  const todos = [{ id: "t", kind: "할 일", title: "보고서", dueDate: "2026-11-19", done: false, archived: false }, { id: "x", kind: "할 일", title: "보관함", dueDate: "2026-11-19", done: false, archived: true }];
  const changes = [{ id: "c", date: "2026-11-19", period: 3, kind: "보강", subject: "과학", className: "2-1" }];
  const map = entriesByDate(events, todos, changes, "2026-11-01", "2026-11-30", { todos: true, changes: true });
  assert.deepEqual(map.get("2026-11-19").map((e) => [e.kind, e.title, e.time, e.multiDay || ""]), [
    ["event", "수학여행", "", "middle"], ["event", "회의", "15:00~16:00", ""], ["change", "3교시 보강 · 과학 2-1", "", ""], ["todo", "보고서", "", ""],
  ]);
  assert.equal(map.get("2026-11-18")[0].multiDay, "start");
  assert.equal(map.get("2026-11-18")[0].time, "종일");
  assert.equal(map.get("2026-11-20")[0].multiDay, "end");
  const hidden = entriesByDate(events, todos, changes, "2026-11-19", "2026-11-19", { todos: false, changes: false });
  assert.equal(hidden.get("2026-11-19").length, 2, "끄면 일정만");
  const clipped = entriesByDate(events, [], [], "2026-11-19", "2026-11-19", { todos: false, changes: false });
  assert.equal(clipped.has("2026-11-18"), false, "범위 밖은 넣지 않음");
});

test("다가오는 일정: 진행 중인 여러 날 일정 포함, 시간 순", () => {
  const events = [
    ev({ title: "지난 일", startDate: "2026-11-01" }),
    ev({ title: "진행 중 연수", startDate: "2026-11-09", endDate: "2026-11-12" }),
    ev({ title: "오후 회의", startDate: "2026-11-11", allDay: false, startTime: "15:00" }),
    ev({ title: "아침 행사", startDate: "2026-11-11" }),
    ev({ title: "다음 달", startDate: "2026-12-11" }),
  ];
  assert.deepEqual(upcomingEvents(events, "2026-11-11").map((e) => e.title), ["진행 중 연수", "아침 행사", "오후 회의"]);
});

test("글자 표시와 입력 검사", () => {
  assert.equal(eventTime(ev({ allDay: false, startTime: "09:00" })), "09:00");
  assert.equal(rangeLabel(ev({ startDate: "2026-11-18", endDate: "2026-11-20" })), "11월 18일 ~ 11월 20일");
  assert.equal(dayLabel("2026-11-12", "2026-11-11"), "내일 · 11월 12일 (목)");
  assert.equal(reminderText([1440, 30]), "1일 전, 30분 전");
  assert.equal(eventProblem(ev({ title: " " })), "일정 제목을 입력해 주세요.");
  assert.equal(eventProblem(ev({ allDay: false })), "시작 시각을 고르거나 ‘종일’을 켜 주세요.");
  assert.equal(eventProblem(ev({ endDate: "2026-11-19" })), "끝 날짜가 시작 날짜보다 앞설 수 없습니다.");
  assert.equal(eventProblem(ev({})), "");
});
