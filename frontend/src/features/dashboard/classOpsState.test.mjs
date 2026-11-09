import assert from "node:assert/strict";
import test from "node:test";
import { ageLabel, daysBetween, latestPlan, planAge, upcomingBirthdays } from "./classOpsState.ts";

const s = (id, number, birthDate) => ({ id, number, name: `학생${number}`, birthDate });

test("오늘과 7일 안의 생일만 가까운 순서로, 같은 날은 번호순", () => {
  const list = upcomingBirthdays(
    [s("a", 3, "2013-11-09"), s("b", 1, "2013-11-16"), s("c", 2, "2013-11-17"), s("d", 4, "2013-11-09"), s("e", 5, "2013-11-08")],
    "2026-11-09",
  );
  assert.deepEqual(
    list.map((x) => [x.id, x.daysLeft]),
    [["a", 0], ["d", 0], ["b", 7]],
  );
  assert.equal(list[0].month, 11);
  assert.equal(list[0].day, 9);
});

test("연말에는 다음 해 1월 생일도 보인다", () => {
  const list = upcomingBirthdays([s("a", 1, "2013-01-02"), s("b", 2, "2013-12-30")], "2026-12-28");
  assert.deepEqual(
    list.map((x) => [x.id, x.daysLeft]),
    [["b", 2], ["a", 5]],
  );
});

test("2월 29일생은 평년에 2월 28일, 윤년에는 2월 29일", () => {
  const plain = upcomingBirthdays([s("a", 1, "2012-02-29")], "2027-02-25");
  assert.deepEqual([plain[0].month, plain[0].day, plain[0].daysLeft], [2, 28, 3]);
  const leap = upcomingBirthdays([s("a", 1, "2012-02-29")], "2028-02-25");
  assert.deepEqual([leap[0].month, leap[0].day, leap[0].daysLeft], [2, 29, 4]);
});

test("생년월일이 비었거나 잘못되면 뺀다", () => {
  assert.deepEqual(upcomingBirthdays([s("a", 1, ""), s("b", 2, "2013-13-01"), s("c", 3, "모름")], "2026-11-09"), []);
});

test("지난 날 수: 시작일이 있으면 시작일, 없으면 만든 날, 기간이 지나면 끝남", () => {
  assert.equal(daysBetween("2026-10-16", "2026-11-09"), 24);
  assert.deepEqual(planAge({ title: "자리", createdAt: "2026-11-02" }, "2026-11-09"), { days: 7, ended: false });
  assert.deepEqual(
    planAge({ title: "청소", createdAt: "2026-10-01", startDate: "2026-11-02", endDate: "2026-11-06" }, "2026-11-09"),
    { days: 7, ended: true },
  );
  assert.deepEqual(planAge({ title: "청소", createdAt: "2026-11-09", startDate: "2026-11-12" }, "2026-11-09"), {
    days: -3,
    ended: false,
  });
  assert.equal(ageLabel(-3, "편성한", "편성"), "3일 뒤 시작");
  assert.equal(ageLabel(0, "바꾼", "바꿈"), "오늘 바꿈");
  assert.equal(ageLabel(24, "바꾼", "바꿈"), "바꾼 지 24일");
});

test("가장 최근 편성", () => {
  assert.equal(latestPlan([]), null);
  assert.equal(latestPlan([{ title: "옛", createdAt: "2026-09-01T00:00:00Z" }, { title: "새", createdAt: "2026-11-01T00:00:00Z" }]).title, "새");
});
