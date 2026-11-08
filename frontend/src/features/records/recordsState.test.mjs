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

import { aiPrompt, changeRatio, cleanAiAnswer, diffText, filterPhrases, findNames, replaceName, suggestTags, tagCounts } from "./recordsState.ts";

test("태그 추천: 영역·과목·낱말은 미리 고르고 연도는 후보로만", () => {
  const tags = suggestTags("2026년 모둠 실험에서 원인을 스스로 찾아 발표함.", "subject", "과학");
  const picked = tags.filter((item) => item.picked).map((item) => item.tag);
  assert.deepEqual(picked, ["교과세특", "과학", "협업", "탐구", "자기주도", "의사소통", "문제해결"]);
  assert.deepEqual(tags.find((item) => item.tag === "2026년"), { tag: "2026년", picked: false });
  assert.deepEqual(suggestTags("성실함.", "behavior", "").map((item) => item.tag), ["행동특성및종합의견", "성실"]);
});

test("이름 찾기와 ○○로 바꾸기", () => {
  const hits = findNames("홍길동은 길동이와 홍길동 모둠에서", ["홍길동", "길동", "김", " "]);
  assert.deepEqual(hits, [{ name: "홍길동", count: 2 }]);
  assert.equal(replaceName("홍길동은 홍길동답게", "홍길동"), "○○은 ○○답게");
  assert.deepEqual(findNames("탐구함.", ["홍길동"]), []);
});

test("AI 요청 문구와 답 정리", () => {
  assert.match(aiPrompt("  문장.  "), /내용·표현·길이는 바꾸지 말고[\s\S]*\n\n문장\.$/);
  const polish = aiPrompt("문장.", "polish", 900);
  assert.match(polish, /원문에 없는 사실·활동·평가·수치를 더하지 마세요/);
  assert.match(polish, /900바이트\(한글 약 300자\)/);
  assert.match(polish, /\n\n문장\.$/);
  assert.equal(cleanAiAnswer("```\n고친 문장: \"실험을 완성함.\"\n```"), "실험을 완성함.");
  assert.equal(cleanAiAnswer("“탐구함.”"), "탐구함.");
  assert.equal(cleanAiAnswer("그냥 문장."), "그냥 문장.");
});

test("글자 비교: 띄어쓰기·마침표 고침을 찾고 바뀐 비율을 센다", () => {
  const parts = diffText("참여 하며 완성함", "참여하며 완성함.");
  assert.deepEqual(parts, [
    { kind: "same", text: "참여" },
    { kind: "del", text: " " },
    { kind: "same", text: "하며 완성함" },
    { kind: "add", text: "." },
  ]);
  assert.ok(changeRatio(parts) < 0.3);
  assert.ok(changeRatio(diffText("가나다라", "마바사아")) >= 1);
  assert.deepEqual(diffText("", "새"), [{ kind: "add", text: "새" }]);
});

test("보관 문장 찾기와 태그 개수", () => {
  const phrases = [
    { text: "모둠 실험을 이끎.", area: "subject", subject: "과학", tags: ["협업", "리더십"] },
    { text: "꾸준히 봉사함.", area: "behavior", subject: "", tags: ["성실", "협업"] },
  ];
  assert.equal(filterPhrases(phrases, "실험", "", []).length, 1);
  assert.equal(filterPhrases(phrases, "#협업", "", []).length, 2);
  assert.equal(filterPhrases(phrases, "", "behavior", []).length, 1);
  assert.equal(filterPhrases(phrases, "", "", ["협업", "리더십"]).length, 1);
  assert.equal(filterPhrases(phrases, "과학", "", []).length, 1);
  assert.deepEqual(tagCounts(phrases)[0], ["협업", 2]);
});
