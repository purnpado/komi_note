import assert from "node:assert/strict";
import test from "node:test";
import { KOREAN_PUBLIC_HOLIDAYS, hasHolidayTable, mergeHolidays, publicHolidaysForSchoolYear } from "./koreanHolidays.ts";

test("학년도(3월~다음 해 2월) 평일 공휴일만 고른다", () => {
  const list = publicHolidaysForSchoolYear("2026");
  assert.ok(list.every((item) => item.date >= "2026-03-01" && item.date <= "2027-02-29"));
  const dates = list.map((item) => item.date);
  assert.ok(dates.includes("2026-10-09"), "한글날(금)");
  assert.ok(dates.includes("2026-10-05"), "개천절 대체공휴일(월)");
  assert.ok(dates.includes("2027-02-09"), "다음 해 2월 설날 대체공휴일");
  assert.ok(!dates.includes("2026-10-03"), "토요일 개천절은 뺀다");
  assert.ok(!dates.includes("2026-02-17"), "앞 학년도 설날은 뺀다");
});

test("표의 날짜는 모두 올바른 형식이고 중복이 없다", () => {
  const seen = new Set();
  for (const item of KOREAN_PUBLIC_HOLIDAYS) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!seen.has(item.date), item.date);
    seen.add(item.date);
  }
});

test("합칠 때 이미 있는 날짜는 교사가 적은 이름을 지킨다", () => {
  const { list, addedCount } = mergeHolidays(
    [{ date: "2026-10-09", name: "한글날(학교 행사)" }, { date: "2026-11-20", name: "재량휴업일" }],
    [{ date: "2026-10-09", name: "한글날" }, { date: "2026-10-05", name: "대체공휴일(개천절)" }],
  );
  assert.equal(addedCount, 1);
  assert.deepEqual(list.map((item) => item.date), ["2026-10-05", "2026-10-09", "2026-11-20"]);
  assert.equal(list[1].name, "한글날(학교 행사)");
});

test("표가 없는 학년도는 알 수 있다", () => {
  assert.equal(hasHolidayTable("2026"), true);
  assert.equal(hasHolidayTable("2030"), false);
});
