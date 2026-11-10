import assert from "node:assert/strict";
import test from "node:test";
import {
  groupOfPage, hideableMenus, isGroupOpen, openGroupForPage, parseOpenGroup, toggleHiddenMenu, toggleOpenGroup, visibleGroups, visibleMenus,
} from "./sidebarState.ts";

test("한 번에 한 묶음만 펼치고 '오늘'은 늘 펼친다", () => {
  assert.equal(toggleOpenGroup(null, "수업용"), "수업용");
  assert.equal(toggleOpenGroup("수업용", "업무용"), "업무용");
  assert.equal(toggleOpenGroup("업무용", "업무용"), null);
  assert.equal(toggleOpenGroup("업무용", "오늘"), "업무용");
  assert.equal(isGroupOpen("오늘", null), true);
  assert.equal(isGroupOpen("담임용", "수업용"), false);
});

test("화면을 옮기면 그 화면이 든 묶음을 펼친다", () => {
  assert.equal(groupOfPage("자리배정"), "담임용");
  assert.equal(openGroupForPage("업무용", "시간표"), "수업용");
  assert.equal(openGroupForPage("업무용", "대시보드"), "업무용");
  assert.equal(openGroupForPage("업무용", "환경 설정"), "업무용");
  assert.equal(parseOpenGroup("수업용"), "수업용");
  assert.equal(parseOpenGroup("오늘"), null);
  assert.equal(parseOpenGroup("엉뚱함"), null);
});

test("숨긴 메뉴와 역할을 반영하고, 대시보드는 숨길 수 없다", () => {
  const keys = visibleMenus(true, ["예산 관리", "대시보드"]).map((item) => item.key);
  assert.ok(keys.includes("대시보드"));
  assert.ok(!keys.includes("예산 관리"));
  assert.ok(!visibleMenus(false).some((item) => item.key === "학생 명렬"), "교과 교사는 담임용 메뉴가 없다");
  assert.deepEqual(visibleGroups(visibleMenus(false)), ["오늘", "수업용", "업무용"]);
  const allWork = ["설문 조사", "메모 · 할 일", "일정", "예산 관리"];
  assert.ok(!visibleGroups(visibleMenus(true, allWork)).includes("업무용"), "모두 숨기면 묶음도 숨긴다");
  assert.ok(!hideableMenus(true).some((item) => item.key === "대시보드"));
  assert.equal(hideableMenus(false).some((item) => item.homeroomOnly), false);
  assert.deepEqual(toggleHiddenMenu(["일정"], "일정"), []);
  assert.deepEqual(toggleHiddenMenu([], "일정"), ["일정"]);
  assert.deepEqual(toggleHiddenMenu([], "대시보드"), []);
});
