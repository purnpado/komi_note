import assert from "node:assert/strict";
import test from "node:test";
import { confirmationStatus, mergeAssessmentEvent } from "./assessmentState.ts";

test("학생 확인 이벤트는 입력 중인 점수와 제목을 보존하고 확인 이력을 갱신한다", () => {
  const current = { id: "one", title: "수정 중", scores: [{ studentId: "s", value: 7 }], domains: [{ name: "수정 기준" }], history: [], objections: [] };
  const fresh = { id: "one", title: "저장된 이전 제목", scores: [{ studentId: "s", value: 2 }], domains: [], history: [{ type: "확인완료", domainId: "d1", studentId: "s" }], objections: [] };
  const merged = mergeAssessmentEvent(current, fresh);
  assert.equal(merged.title, "수정 중");
  assert.equal(merged.scores[0].value, 7);
  assert.equal(merged.domains[0].name, "수정 기준");
  assert.equal(confirmationStatus(merged, "d1", "s").type, "confirmed");
  assert.equal(confirmationStatus(merged, "d2", "s").type, "pending");
});

test("영역별 이의와 이전 영역 불명 이력을 구분한다", () => {
  const assessment = { history: [{ type: "확인완료", studentId: "s" }], objections: [{ studentId: "s", domainId: "d2" }] };
  assert.equal(confirmationStatus(assessment, "d1", "s").type, "unknown");
  assert.equal(confirmationStatus(assessment, "d2", "s").type, "objection");
  assert.equal(confirmationStatus(assessment, "d2", "other").type, "pending");
});
