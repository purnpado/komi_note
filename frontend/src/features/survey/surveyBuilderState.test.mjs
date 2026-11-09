import assert from "node:assert/strict";
import test from "node:test";
import {
  builderProblems, changeType, duplicateQuestion, fromSavedQuestion, moveItem, newQuestion, respondentLabel,
  scaleOptions, summarizeResults, toSavedQuestion, typeLabel,
} from "./surveyBuilderState.ts";

test("새 문항은 유형에 맞는 기본값을 갖는다", () => {
  assert.deepEqual(newQuestion("복수 선택", "a").options, ["보기 1", "보기 2"]);
  assert.deepEqual(newQuestion("서술", "b").options, []);
  const scale = newQuestion("척도", "c");
  assert.equal(scale.scaleSteps, 5);
  assert.equal(scale.scaleMinLabel, "전혀 아니다");
});

test("유형을 바꾸면 고르기끼리는 보기를 지키고 글 답은 비운다", () => {
  const single = { ...newQuestion("단일 선택", "a"), options: ["봄", "여름", "가을"], allowOther: true };
  const multi = changeType(single, "복수 선택");
  assert.deepEqual(multi.options, ["봄", "여름", "가을"]);
  assert.equal(multi.allowOther, true);
  const text = changeType({ ...multi, maxChoices: 2 }, "단답");
  assert.deepEqual(text.options, []);
  assert.equal(text.maxChoices, 0);
  assert.equal(text.allowOther, false);
  const back = changeType(text, "목록 선택");
  assert.deepEqual(back.options, ["보기 1", "보기 2"]);
  const scale = changeType(single, "척도");
  assert.deepEqual(scale.options, []);
  assert.equal(scale.scaleSteps, 5);
  assert.equal(scale.allowOther, false);
});

test("옮기기·복제는 순서와 새 번호를 지킨다", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b"], 0, 5), ["a", "b"], "범위를 벗어나면 그대로");
  const list = [{ ...newQuestion("단일 선택", "k1"), id: "saved", text: "질문" }];
  const copied = duplicateQuestion(list, 0, "k2");
  assert.equal(copied.length, 2);
  assert.equal(copied[1].key, "k2");
  assert.equal(copied[1].id, undefined, "복제본은 새 문항으로 저장");
  assert.equal(copied[1].text, "질문 (복사)");
  copied[1].options.push("새 보기");
  assert.equal(list[0].options.length, 2, "원본 보기는 바뀌지 않음");
});

test("저장 형식으로 바꾸고 다시 불러와도 같다", () => {
  const scale = { ...newQuestion("척도", "a"), text: " 만족도 ", scaleSteps: 10 };
  const saved = toSavedQuestion(scale);
  assert.equal(saved.text, "만족도");
  assert.deepEqual(saved.options, scaleOptions(10));
  const loaded = fromSavedQuestion({ ...saved, id: "q1" }, "k");
  assert.equal(loaded.id, "q1");
  assert.equal(loaded.scaleSteps, 10);
  assert.deepEqual(loaded.options, []);
  const legacy = fromSavedQuestion({ id: "old", text: "예전", type: "5점 척도", options: ["1점", "2점"] }, "k2");
  assert.equal(legacy.type, "5점 척도");
  assert.equal(typeLabel("5점 척도"), "5점 척도(예전 방식)");
  assert.deepEqual(toSavedQuestion({ ...newQuestion("단일 선택", "x"), text: "q", options: [" 가 ", "", "나"] }).options, ["가", "나"]);
});

test("저장 전 문제를 번호와 함께 알려 준다", () => {
  const problems = builderProblems("", [
    { ...newQuestion("단일 선택", "a"), options: ["가"] },
    { ...newQuestion("복수 선택", "b"), text: "질문", options: ["가", "가"] },
    { ...newQuestion("단일 선택", "c"), text: "기타", options: ["기타: 직접"], allowOther: true },
  ]);
  assert.ok(problems.includes("설문 제목을 입력해 주세요."));
  assert.ok(problems.includes("1번 문항의 질문을 입력해 주세요."));
  assert.ok(problems.includes("1번 문항에 보기를 두 개 이상 적어 주세요."));
  assert.ok(problems.includes("2번 문항에 같은 보기가 있습니다."));
  assert.ok(problems.some((p) => p.startsWith("3번 문항의 보기는 '기타:'")));
  assert.deepEqual(builderProblems("제목", [{ ...newQuestion("단답", "d"), text: "소감" }]), []);
});

test("결과 집계: 기타 묶음·척도 평균·글 답 목록", () => {
  const questions = [
    { id: "s", text: "계절", type: "단일 선택", options: ["봄", "여름"], allowOther: true },
    { id: "m", text: "활동", type: "복수 선택", options: ["가", "나"] },
    { id: "c", text: "만족", type: "척도", options: scaleOptions(5) },
    { id: "t", text: "소감", type: "서술", options: [] },
  ];
  const responses = [
    { studentId: "1", answers: { s: "봄", c: "4", t: "좋아요" }, multiAnswers: { m: ["가", "나"] } },
    { studentId: "2", answers: { s: "기타: 겨울", c: "2" }, multiAnswers: { m: ["가"] } },
    { studentId: "3", answers: {}, multiAnswers: {} },
  ];
  const [season, activity, scale, text] = summarizeResults(questions, responses);
  assert.deepEqual(season.rows.map((r) => [r.option, r.count, r.percent]), [["봄", 1, 50], ["여름", 0, 0], ["기타", 1, 50]]);
  assert.deepEqual(season.others, ["겨울"]);
  assert.equal(activity.answered, 2);
  assert.deepEqual(activity.rows.map((r) => r.count), [2, 1]);
  assert.equal(scale.average, 3);
  assert.equal(text.kind, "text");
  assert.deepEqual(text.texts, ["좋아요"]);
});

test("응답자 이름: 담임 반·수업 반·교직원·익명", () => {
  const names = new Map([["s1", "1번 가온"]]);
  assert.equal(respondentLabel({ studentId: "s1" }, names, false, false), "1번 가온");
  assert.equal(respondentLabel({ studentId: "course|r1|7|나래" }, names, false, false), "7번 나래");
  assert.equal(respondentLabel({ studentId: "staff|김|김선생", respondentName: "김선생" }, names, false, true), "김선생");
  assert.equal(respondentLabel({ studentId: "staff-anon-x" }, names, true, true), "익명 응답");
  assert.equal(respondentLabel({ studentId: "" }, names, false, false), "명렬에서 빠진 학생");
});
