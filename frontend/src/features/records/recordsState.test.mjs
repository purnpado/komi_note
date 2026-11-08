import assert from "node:assert/strict";
import test from "node:test";
import { availableTargets, charCount, checkText, entryStatus, measure, memberKey, neisBytes, parseMembers, progress, recordYears, sortMembers, tabs, visibleTabs } from "./recordsState.ts";

test("나이스 바이트는 한글 3, 영문·숫자·공백 1, 줄바꿈 2로 센다", () => {
  assert.equal(neisBytes(""), 0);
  assert.equal(neisBytes("가나다"), 9);
  assert.equal(neisBytes("abc 123"), 7);
  assert.equal(neisBytes("가\n나"), 8);
  assert.equal(neisBytes("가\r\n나"), 8);
  assert.equal(neisBytes("실험(A)."), 6 + 4);
});

test("글자 수는 공백·줄바꿈을 포함하고 한도는 바이트로 비교한다", () => {
  assert.equal(charCount("가 나\r\n다"), 5);
  const ok = measure("가".repeat(300), 300);
  assert.equal(ok.bytes, 900);
  assert.equal(ok.limitBytes, 900);
  assert.equal(ok.over, false);
  assert.equal(measure("가".repeat(300) + ".", 300).over, true);
  // 영문·숫자가 섞이면 글자 수가 한도를 넘어도 바이트로는 들어갈 수 있다
  assert.equal(measure("a".repeat(400), 300).over, false);
});

test("문장 점검: 학생 이름·기재 주의 표현·형식", () => {
  assert.deepEqual(checkText("", ["홍길동"]), []);
  const warnings = checkText("홍길동은 토익  점수가 높고 교외 대회에서 수상함", ["홍길동", "김"]);
  const text = warnings.map((item) => item.message).join("\n");
  assert.match(text, /학생 이름\(홍길동\)/);
  assert.match(text, /자격·어학 시험/);
  assert.match(text, /수상 실적/);
  assert.match(text, /교외 활동/);
  assert.match(text, /띄어쓰기가 두 번/);
  assert.match(text, /마침표로 끝나지 않습니다/);
  assert.deepEqual(checkText("실험 과정을 꼼꼼히 기록함.", ["홍길동"]), []);
  assert.ok(checkText("탐구함.\n발표함.", []).some((item) => item.message.includes("줄바꿈")));
});

test("작성 상태와 진행 현황", () => {
  assert.equal(entryStatus(undefined), "empty");
  assert.equal(entryStatus({ text: " ", reviewed: false, memos: [] }), "empty");
  assert.equal(entryStatus({ text: "", reviewed: false, memos: [{ text: "메모" }] }), "memo");
  assert.equal(entryStatus({ text: "문장.", reviewed: false, memos: [] }), "writing");
  assert.equal(entryStatus({ text: "문장.", reviewed: true, memos: [] }), "reviewed");
  assert.deepEqual(progress(["empty", "memo", "writing", "reviewed"]), { total: 4, written: 2, reviewed: 1 });
});

test("행동특성 탭과 우리 반 대상은 담임에게만 보인다", () => {
  assert.equal(visibleTabs(true).length, 4);
  assert.deepEqual(visibleTabs(false).map((tab) => tab.key), ["subject", "creative", "freeSemester"]);
  const creative = tabs.find((tab) => tab.key === "creative");
  assert.deepEqual(availableTargets(creative, false), ["list", "course"]);
  assert.deepEqual(availableTargets(creative, true), ["homeroom", "list", "course"]);
});

test("활동 명단 붙여 넣기: 엑셀 탭, 하이픈, 학번 다섯 자리, 머리글, 중복, 잘못된 줄", () => {
  const { members, errors } = parseMembers([
    "학년\t반\t번호\t이름",
    "2\t3\t05\t홍길동",
    "1-2-15 김가상",
    "20301 이나상",
    "2 3 5 홍길동",
    "아무거나",
    "",
  ].join("\n"));
  assert.deepEqual(members, [
    { grade: "2", className: "3", number: "5", name: "홍길동" },
    { grade: "1", className: "2", number: "15", name: "김가상" },
    { grade: "2", className: "3", number: "1", name: "이나상" },
  ]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /이미 있습니다/);
  assert.match(errors[1], /읽지 못했습니다/);
  assert.equal(memberKey(members[0]), "2-3-5|홍길동");
  assert.deepEqual(sortMembers(members).map((member) => member.name), ["김가상", "이나상", "홍길동"]);
});

test("학년도 목록은 설정 학년도와 기록 학년도를 합쳐 최신 먼저", () => {
  assert.deepEqual(recordYears("2026", ["2025", "2026", "x"]), ["2026", "2025"]);
  assert.equal(recordYears("", []).length, 1);
});
