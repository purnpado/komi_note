import assert from "node:assert/strict";
import test from "node:test";
import { experienceOverLimitMessage, schoolYearOf } from "./attendanceUtils.ts";

test("학년도는 3월부터 다음 해 2월까지", () => {
  assert.equal(schoolYearOf("2026-03-02"), "2026");
  assert.equal(schoolYearOf("2026-12-31"), "2026");
  assert.equal(schoolYearOf("2027-02-12"), "2026");
  assert.equal(schoolYearOf("2026-02-27"), "2025");
  assert.equal(schoolYearOf(""), "");
});

test("교외체험학습 허용 일수 초과 안내", () => {
  assert.equal(experienceOverLimitMessage("가온", 5, 5, "학년"), "");
  assert.match(experienceOverLimitMessage("가온", 6, 5, "학년"), /6일째로 학년 허용 일수 5일/);
  assert.equal(experienceOverLimitMessage("가온", 9, 0, "학년"), "");
});
