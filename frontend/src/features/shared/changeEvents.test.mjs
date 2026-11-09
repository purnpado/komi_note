import assert from "node:assert/strict";
import test from "node:test";
import { changeEvents, subscribeChanges } from "./changeEvents.ts";

function fakeBus() {
  const listeners = new Map();
  return {
    on(name, callback) {
      const list = listeners.get(name) || [];
      list.push(callback);
      listeners.set(name, list);
      return () => listeners.set(name, (listeners.get(name) || []).filter((item) => item !== callback));
    },
    emit(name, data) {
      for (const callback of listeners.get(name) || []) callback(data);
    },
    count(name) {
      return (listeners.get(name) || []).length;
    },
  };
}

test("여러 알림을 구독하고 받은 알림의 이름·종류·번호를 넘긴다", () => {
  const bus = fakeBus();
  const got = [];
  subscribeChanges(bus.on, [changeEvents.memo, changeEvents.schedule], (name, notice) => got.push([name, notice]));
  bus.emit("memo:변경", { kind: "추가", id: "m1" });
  bus.emit("schedule:변경", { kind: "삭제", id: "s1" });
  bus.emit("budget:변경", { kind: "추가" });
  assert.deepEqual(got, [
    ["memo:변경", { kind: "추가", id: "m1" }],
    ["schedule:변경", { kind: "삭제", id: "s1" }],
  ]);
});

test("해제하면 모든 구독이 풀리고 두 번 해제해도 괜찮다", () => {
  const bus = fakeBus();
  let calls = 0;
  const off = subscribeChanges(bus.on, ["memo:변경", "memo:변경", "budget:변경"], () => calls++);
  assert.equal(bus.count("memo:변경"), 1, "같은 이름은 한 번만 구독");
  off();
  off();
  assert.equal(bus.count("memo:변경"), 0);
  assert.equal(bus.count("budget:변경"), 0);
  bus.emit("memo:변경", {});
  assert.equal(calls, 0);
});

test("해제 뒤 늦게 도착한 알림은 무시한다", () => {
  let saved;
  const on = (_name, callback) => {
    saved = callback;
    return () => {};
  };
  let calls = 0;
  const off = subscribeChanges(on, ["memo:변경"], () => calls++);
  off();
  saved({ kind: "수정" });
  assert.equal(calls, 0);
});

test("알림 내용이 비었거나 이상해도 종류·번호만 꺼낸다", () => {
  const bus = fakeBus();
  const got = [];
  subscribeChanges(bus.on, ["memo:변경"], (_name, notice) => got.push(notice));
  bus.emit("memo:변경", null);
  bus.emit("memo:변경", { kind: 3, id: "x", title: "학생 이름" });
  assert.deepEqual(got.map((n) => [n.kind, n.id]), [[undefined, undefined], [undefined, "x"]]);
  assert.equal("title" in got[1], false, "다른 내용은 넘기지 않음");
});

test("Go app_events.go의 변경 알림 이름과 화면의 이름이 같다", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../../../../app_events.go", import.meta.url), "utf8");
  const goNames = [...source.matchAll(/^\s*event\w+\s*=\s*"([^"]+)"/gm)].map((match) => match[1]).sort();
  assert.deepEqual(Object.values(changeEvents).sort(), goNames);
});
