import assert from "node:assert/strict";
import test from "node:test";
import { dashboardMemos, dueLabel, filterCounts, filterMemos, groupTodos, parseTags, sortMemos, tagList, weekEnd } from "./memoState.ts";

const base = { body: "", color: "기본", tags: [], pinned: false, archived: false, done: false, createdAt: "", updatedAt: "2026-11-01" };
const item = (over) => ({ ...base, id: over.title, kind: "할 일", ...over });
// 2026-11-11은 수요일
const today = "2026-11-11";
const items = [
  item({ title: "지난 일", dueDate: "2026-11-09" }),
  item({ title: "오늘 일", dueDate: today, dueTime: "15:00", priority: "높음" }),
  item({ title: "금요일 일", dueDate: "2026-11-13" }),
  item({ title: "다음 주 일", dueDate: "2026-11-18" }),
  item({ title: "날짜 없음" }),
  item({ title: "끝낸 일", done: true, dueDate: today }),
  item({ title: "보관한 일", archived: true }),
  item({ title: "회의 메모", kind: "메모", tags: ["업무", "회의"], pinned: true, updatedAt: "2026-10-01" }),
  item({ title: "상담 메모", kind: "메모", body: "학부모 통화", tags: ["업무"], updatedAt: "2026-11-05" }),
];
const titles = (list) => list.map((i) => i.title);

test("이번 주 끝은 일요일", () => {
  assert.equal(weekEnd(today), "2026-11-15");
  assert.equal(weekEnd("2026-11-15"), "2026-11-15");
});

test("거르기: 종류·오늘·이번 주·완료·보관", () => {
  assert.deepEqual(titles(filterMemos(items, "오늘", today)), ["지난 일", "오늘 일"]);
  assert.deepEqual(titles(filterMemos(items, "이번 주", today)), ["지난 일", "오늘 일", "금요일 일"]);
  assert.deepEqual(titles(filterMemos(items, "완료", today)), ["끝낸 일"]);
  assert.deepEqual(titles(filterMemos(items, "보관", today)), ["보관한 일"]);
  assert.deepEqual(titles(filterMemos(items, "메모", today)), ["회의 메모", "상담 메모"]);
  assert.equal(filterMemos(items, "전체", today).length, 7, "완료·보관 빼고");
  assert.equal(filterCounts(items, today)["할 일"], 5);
});

test("찾기와 태그", () => {
  assert.deepEqual(titles(filterMemos(items, "전체", today, "학부모")), ["상담 메모"]);
  assert.deepEqual(titles(filterMemos(items, "전체", today, "", "회의")), ["회의 메모"]);
  assert.deepEqual(tagList(items), [{ tag: "업무", count: 2 }, { tag: "회의", count: 1 }]);
  assert.deepEqual(parseTags("#업무, 학부모 상담,업무\n"), ["업무", "학부모 상담"]);
});

test("메모는 고정 먼저, 할 일은 마감 묶음", () => {
  assert.deepEqual(titles(sortMemos(items.filter((i) => i.kind === "메모"))), ["회의 메모", "상담 메모"]);
  const groups = groupTodos(items.filter((i) => i.kind === "할 일" && !i.archived), today);
  assert.deepEqual(groups.map((g) => [g.label, titles(g.items)]), [
    ["마감 지남", ["지난 일"]], ["오늘", ["오늘 일"]], ["이번 주", ["금요일 일"]], ["나중", ["다음 주 일"]], ["날짜 없음", ["날짜 없음"]], ["완료", ["끝낸 일"]],
  ]);
});

test("마감 표시 글자", () => {
  assert.equal(dueLabel(item({ dueDate: today, dueTime: "15:00" }), today), "오늘 15:00");
  assert.equal(dueLabel(item({ dueDate: "2026-11-12" }), today), "내일");
  assert.equal(dueLabel(item({ dueDate: "2026-11-08" }), today), "3일 지남");
  assert.equal(dueLabel(item({ dueDate: "2026-11-20" }), today), "11월 20일 · 9일 남음");
  assert.equal(dueLabel(item({}), today), "");
});

test("대시보드: 오늘까지 할 일과 고정 메모", () => {
  const view = dashboardMemos(items, today);
  assert.deepEqual(titles(view.todayTodos), ["지난 일", "오늘 일"]);
  assert.deepEqual(titles(view.pinned), ["회의 메모"]);
  assert.equal(view.openTodoCount, 5);
});
