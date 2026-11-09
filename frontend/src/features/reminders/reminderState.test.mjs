import assert from "node:assert/strict";
import test from "node:test";
import { inboxNote, inboxTarget, remindProblem } from "./reminderState.ts";

const item = (over) => ({ key: "k", kind: "일정", refId: "r", title: "회의", at: "", eventAt: "2026-11-09T14:30:00+09:00", missed: false, quiet: false, ...over });

test("알림 설명과 이동할 메뉴", () => {
  const note = inboxNote(item({ eventAt: new Date(2026, 10, 9, 14, 30).toISOString() }));
  assert.equal(note, "11월 9일 14:30 일정");
  assert.match(inboxNote(item({ missed: true, quiet: true })), /꺼져 있던 동안 지난 알림 · 조용한 시간$/);
  assert.equal(inboxTarget(item({})), "일정");
  assert.equal(inboxTarget(item({ kind: "할 일" })), "메모 · 할 일");
});

test("알림 시각 검사", () => {
  const now = new Date(2026, 10, 9, 14, 0);
  assert.equal(remindProblem("", now), "");
  assert.equal(remindProblem("2026-11-09T13:00", now), "알림 시각은 지금보다 뒤여야 합니다.");
  assert.equal(remindProblem("2026-11-09T15:00", now), "");
  assert.equal(remindProblem("이상한 값", now), "알림 시각을 확인해 주세요.");
});
