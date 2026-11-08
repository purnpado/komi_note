import assert from "node:assert/strict";
import test from "node:test";
import { assignRoles, capacities, evaluate, groupCount, makeGroups, moveMember, pairKey, pairsInPlan, parseRoles, seededRandom, swapMembers } from "./groupingState.ts";

const pupils = Array.from({ length: 25 }, (_, index) => ({ key: `k${index + 1}`, number: String(index + 1), name: `학생${index + 1}` }));

test("모둠 수와 정원은 인원 차이 1명 이하로 나뉜다", () => {
  assert.equal(groupCount(25, "size", 4), 6);
  assert.equal(groupCount(22, "size", 4), 6);
  assert.equal(groupCount(3, "size", 4), 1);
  assert.equal(groupCount(25, "count", 6), 6);
  assert.equal(groupCount(5, "count", 9), 5);
  assert.equal(groupCount(25, "size", 0), 0);
  assert.deepEqual(capacities(25, 6), [5, 4, 4, 4, 4, 4]);
  assert.deepEqual(capacities(22, 6), [4, 4, 4, 4, 3, 3]);
});

test("25명을 6모둠으로 나누면 모두 한 번씩 들어가고 인원 차이가 1명 이하다", () => {
  const groups = makeGroups(pupils, { count: 6, separate: [], together: [], previous: new Set(), random: seededRandom(1) });
  const keys = groups.flat().map((pupil) => pupil.key).sort();
  assert.equal(keys.length, 25);
  assert.equal(new Set(keys).size, 25);
  const sizes = groups.map((group) => group.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
});

test("넣지 않을 학생·함께 넣을 학생 조건을 지킨다", () => {
  const separate = [{ a: "k1", b: "k2" }, { a: "k1", b: "k3" }, { a: "k2", b: "k3" }, { a: "k4", b: "k5" }];
  const together = [{ a: "k6", b: "k7" }, { a: "k7", b: "k8" }];
  for (let seed = 1; seed <= 20; seed++) {
    const groups = makeGroups(pupils, { count: 6, separate, together, previous: new Set(), random: seededRandom(seed) });
    const result = evaluate(groups.map((members) => ({ members })), separate, together, new Set());
    assert.equal(result.separateBroken.length, 0, `seed ${seed}`);
    assert.equal(result.togetherBroken.length, 0, `seed ${seed}`);
    assert.ok(result.spread <= 1, `seed ${seed}`);
  }
});

test("조건을 지킬 수 없으면 어긴 곳을 알려 준다", () => {
  const small = pupils.slice(0, 4);
  const separate = [{ a: "k1", b: "k2" }, { a: "k1", b: "k3" }, { a: "k2", b: "k3" }];
  const groups = makeGroups(small, { count: 2, separate, together: [], previous: new Set(), random: seededRandom(3) });
  const result = evaluate(groups.map((members) => ({ members })), separate, [], new Set());
  assert.equal(result.separateBroken.length, 1);
});

test("지난 모둠과 겹침을 줄인다", () => {
  const first = makeGroups(pupils, { count: 6, separate: [], together: [], previous: new Set(), random: seededRandom(5) });
  const previous = pairsInPlan(first.map((members) => ({ members })));
  const plain = evaluate(makeGroups(pupils, { count: 6, separate: [], together: [], previous: new Set(), random: seededRandom(9), attempts: 1 }).map((members) => ({ members })), [], [], previous).repeats;
  const avoided = evaluate(makeGroups(pupils, { count: 6, separate: [], together: [], previous, random: seededRandom(9) }).map((members) => ({ members })), [], [], previous).repeats;
  assert.ok(avoided <= plain);
  assert.ok(avoided <= 3, `겹침 ${avoided}`);
});

test("역할은 모둠마다 하나씩, 학생이 많으면 나머지는 빈칸", () => {
  const groups = assignRoles([pupils.slice(0, 4), pupils.slice(4, 6)], ["모둠장", "기록", "발표"], seededRandom(2));
  assert.deepEqual(groups[0].map((m) => m.role).filter(Boolean).sort(), ["기록", "모둠장", "발표"]);
  assert.equal(groups[0].filter((m) => !m.role).length, 1);
  assert.equal(groups[1].filter((m) => m.role).length, 2);
  assert.deepEqual(parseRoles("모둠장, 기록·발표,,모둠장"), ["모둠장", "기록", "발표"]);
});

test("옮기기와 맞바꾸기", () => {
  const drafts = [
    { name: "1모둠", members: [{ ...pupils[0], role: "모둠장" }, { ...pupils[1], role: "" }] },
    { name: "2모둠", members: [{ ...pupils[2], role: "기록" }] },
  ];
  const moved = moveMember(drafts, "k2", 1);
  assert.deepEqual(moved.map((g) => g.members.map((m) => m.key)), [["k1"], ["k3", "k2"]]);
  const swapped = swapMembers(drafts, "k1", "k3");
  assert.equal(swapped[0].members[0].key, "k3");
  assert.equal(swapped[0].members[0].role, "모둠장");
  assert.equal(swapped[1].members[0].key, "k1");
  assert.equal(swapped[1].members[0].role, "기록");
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
});
