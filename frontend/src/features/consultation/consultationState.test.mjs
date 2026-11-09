import assert from "node:assert/strict";
import test from "node:test";
import { flowOrder, pendingFollowUps, searchConsultations, studentStatus } from "./consultationState.ts";

const base = { parentId: "", rootId: "", followUpDate: "", followUpDone: false, recordedAt: "", content: "", type: "학생 상담" };
const items = [
  { ...base, id: "r1", studentId: "s1", rootId: "r1", date: "2026-11-02", content: "교우 관계", followUpDate: "2026-11-05", followUpDone: true, recordedAt: "a" },
  { ...base, id: "c1", studentId: "s1", parentId: "r1", rootId: "r1", date: "2026-11-06", type: "보호자 통화", content: "통화함", followUpDate: "2026-11-20", recordedAt: "b" },
  { ...base, id: "r2", studentId: "s2", rootId: "r2", date: "2026-10-01", content: "진로 고민", followUpDate: "2026-11-01", recordedAt: "c" },
  { ...base, id: "r3", studentId: "s1", rootId: "r3", date: "2026-09-01", content: "학습 습관", recordedAt: "d" },
];

test("확인할 일은 미확인 예정일만, 이른 것부터", () => {
  assert.deepEqual(pendingFollowUps(items).map((item) => item.id), ["r2", "c1"]);
});

test("학생 상태: 지남·예정·마지막 상담일", () => {
  assert.deepEqual(studentStatus(items, "s1", "2026-11-09"), { total: 3, overdue: 0, planned: 1, lastDate: "2026-11-06" });
  assert.deepEqual(studentStatus(items, "s2", "2026-11-09"), { total: 1, overdue: 1, planned: 0, lastDate: "2026-10-01" });
  assert.deepEqual(studentStatus(items, "없음", "2026-11-09"), { total: 0, overdue: 0, planned: 0, lastDate: "" });
});

test("찾기: 학생·유형·기간·낱말", () => {
  const empty = { studentId: "", type: "", from: "", to: "", query: "" };
  assert.deepEqual(searchConsultations(items, empty).map((item) => item.id), ["c1", "r1", "r2", "r3"]);
  assert.deepEqual(searchConsultations(items, { ...empty, studentId: "s1", from: "2026-10-01" }).map((item) => item.id), ["c1", "r1"]);
  assert.deepEqual(searchConsultations(items, { ...empty, type: "보호자 통화" }).map((item) => item.id), ["c1"]);
  assert.deepEqual(searchConsultations(items, { ...empty, query: "진로" }).map((item) => item.id), ["r2"]);
  assert.deepEqual(searchConsultations(items, { ...empty, to: "2026-09-30" }).map((item) => item.id), ["r3"]);
});

test("상담일지 순서: 첫 상담 오래된 것부터, 후속 기록은 아래로, 기간 밖은 뺀다", () => {
  const s1 = items.filter((item) => item.studentId === "s1");
  assert.deepEqual(flowOrder(s1, "", "").map(({ item, depth }) => `${item.id}:${depth}`), ["r3:0", "r1:0", "c1:1"]);
  assert.deepEqual(flowOrder(s1, "2026-11-01", "").map(({ item }) => item.id), ["r1", "c1"]);
});
