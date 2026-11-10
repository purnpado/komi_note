import assert from "node:assert/strict";
import test from "node:test";
import { activeSectionId, nextTabIndex } from "./sectionTabsState.ts";

test("바로가기 탭은 기준선을 지난 마지막 구역을 강조한다", () => {
  const sections = [{ id: "a", top: -300 }, { id: "b", top: 40 }, { id: "c", top: 600 }];
  assert.equal(activeSectionId(sections, 100, false), "b");
  assert.equal(activeSectionId(sections, 0, false), "a");
  assert.equal(activeSectionId([{ id: "a", top: 200 }, { id: "b", top: 900 }], 100, false), "a", "아무것도 안 지났으면 첫 구역");
  assert.equal(activeSectionId(sections, 100, true), "c", "맨 아래면 마지막 구역");
  assert.equal(activeSectionId([], 100, false), "");
});

test("화살표·Home·End로 탭을 옮기고 끝에서 처음으로 돈다", () => {
  assert.equal(nextTabIndex(0, 3, "ArrowRight"), 1);
  assert.equal(nextTabIndex(2, 3, "ArrowRight"), 0);
  assert.equal(nextTabIndex(0, 3, "ArrowLeft"), 2);
  assert.equal(nextTabIndex(1, 3, "End"), 2);
  assert.equal(nextTabIndex(1, 3, "Home"), 0);
  assert.equal(nextTabIndex(1, 3, "Enter"), -1);
});
