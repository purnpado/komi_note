import assert from "node:assert/strict";
import test from "node:test";
import { REASON_CATEGORIES, reasonOptions, summariseAttendance } from "./attendanceReasonState.ts";
import { koreanDate } from "./attendanceUtils.ts";

test("사유 구분은 질병·미인정·기타·출석인정 네 개", () => {
  assert.deepEqual([...REASON_CATEGORIES], ["질병", "미인정", "기타", "출석인정"]);
  assert.deepEqual(reasonOptions("").map((item) => item.label), ["선택 안 함", "질병", "미인정", "기타", "출석인정"]);
});

test("예전 '직접 입력' 값은 그대로 보이고 고를 수 있다", () => {
  const options = reasonOptions("직접 입력");
  assert.equal(options.length, 6);
  assert.deepEqual(options[5], { value: "직접 입력", label: "예전 값: 직접 입력" });
  assert.equal(reasonOptions("질병").length, 5);
});

test("학생 상세 집계: 출석인정은 결석일수에서 빼고 사유별로 나눈다", () => {
  const summary = summariseAttendance([
    { status: "결석", reasonCategory: "질병" },
    { status: "결석", reasonCategory: "질병" },
    { status: "결석", reasonCategory: "미인정" },
    { status: "결석", reasonCategory: "출석인정" },
    { status: "결석", reasonCategory: "인정" },
    { status: "지각", reasonCategory: "" },
    { status: "조퇴", reasonCategory: "직접 입력" },
    { status: "교외체험학습", reasonCategory: "" },
  ]);
  const absent = summary.tallies.find((item) => item.status === "결석");
  assert.equal(absent.total, 3);
  assert.deepEqual(absent.byReason, [
    { label: "질병", count: 2 },
    { label: "미인정", count: 1 },
  ]);
  assert.deepEqual(summary.tallies.find((item) => item.status === "지각").byReason, [{ label: "사유 미입력", count: 1 }]);
  assert.deepEqual(summary.tallies.find((item) => item.status === "조퇴").byReason, [{ label: "예전 값", count: 1 }]);
  assert.equal(summary.tallies.find((item) => item.status === "결과").total, 0);
  assert.equal(summary.recognised, 2);
  assert.equal(summary.experience, 1);
});

test("서류 날짜는 앞자리 0 없이", () => {
  assert.equal(koreanDate("2026-01-05"), "2026년 1월 5일");
  assert.equal(koreanDate("2026-11-10"), "2026년 11월 10일");
  assert.equal(koreanDate("잘못된 값"), "잘못된 값");
});
