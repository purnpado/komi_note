import assert from "node:assert/strict";
import test from "node:test";
import { addOptionAt, countImages, dataURLBytes, fitImageSize, moveOptionAt, removeOptionAt, savedOptions, setOptionImage } from "./surveyMediaState.ts";
import { builderProblems, changeType, duplicateQuestion, fromSavedQuestion, newQuestion, toSavedQuestion } from "./surveyBuilderState.ts";

const A = "a".repeat(32);
const B = "b".repeat(32);

test("보기를 더하고 지우고 옮기면 보기 그림도 따라간다", () => {
  let q = { options: ["가", "나"], optionImages: [A] };
  q = addOptionAt(q, 0, "새");
  assert.deepEqual(q, { options: ["가", "새", "나"], optionImages: [A, "", ""] });
  q = setOptionImage(q, 2, B);
  q = moveOptionAt(q, 2, 0);
  assert.deepEqual(q, { options: ["나", "가", "새"], optionImages: [B, A, ""] });
  q = removeOptionAt(q, 1);
  assert.deepEqual(q, { options: ["나", "새"], optionImages: [B, ""] });
});

test("저장할 때 빈 보기는 그 그림과 함께 빼고, 그림 없는 문항은 빈 목록", () => {
  assert.deepEqual(savedOptions("단일 선택", ["가", " ", "나"], [A, "", B]), { options: ["가", "나"], optionImages: [A, B] });
  assert.deepEqual(savedOptions("단일 선택", ["가", "나"], ["", ""]), { options: ["가", "나"], optionImages: [] });
  assert.deepEqual(savedOptions("목록 선택", ["가", "나"], [A, ""]), { options: ["가", "나"], optionImages: [] });
});

test("문항 그림·보기 그림은 저장·불러오기·복제·유형 바꾸기를 거쳐도 맞는다", () => {
  const q = { ...newQuestion("단일 선택", "k"), text: "고르기", imageId: A, optionImages: [B, ""] };
  const saved = toSavedQuestion(q);
  assert.equal(saved.imageId, A);
  assert.deepEqual(saved.optionImages, [B, ""]);
  const back = fromSavedQuestion(saved, "k2");
  assert.deepEqual(back.optionImages, [B, ""]);
  assert.deepEqual(duplicateQuestion([back], 0, "k3")[1].optionImages, [B, ""]);
  assert.deepEqual(changeType(back, "복수 선택").optionImages, [B, ""]);
  assert.deepEqual(changeType(back, "목록 선택").optionImages, []);
  assert.equal(changeType(back, "단답").imageId, A, "문항 그림은 유형을 바꿔도 남는다");
  assert.deepEqual(fromSavedQuestion({ text: "예전", type: "단일 선택", options: ["가", "나"] }, "old").optionImages, ["", ""]);
});

test("그림 수 20장 제한과 글 없는 그림 보기를 안내한다", () => {
  const many = Array.from({ length: 21 }, (_, i) => ({ ...newQuestion("단답", `k${i}`), text: "q", imageId: A }));
  assert.ok(builderProblems("제목", many).some((p) => p.includes("20장")));
  assert.equal(countImages(many.slice(0, 20)), 20);
  const blank = { ...newQuestion("단일 선택", "x"), text: "q", options: ["가", "나", ""], optionImages: ["", "", A] };
  assert.ok(builderProblems("제목", [blank]).some((p) => p.includes("글")));
  assert.equal(countImages([{ ...blank, type: "목록 선택" }]), 0, "목록 문항의 보기 그림은 세지 않는다");
});

test("긴 변 1280px로 비율을 지켜 줄이고, data URL 크기를 계산한다", () => {
  assert.deepEqual(fitImageSize(4000, 3000), { width: 1280, height: 960 });
  assert.deepEqual(fitImageSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitImageSize(1000, 5000), { width: 256, height: 1280 });
  assert.equal(dataURLBytes("data:image/jpeg;base64,QUJD"), 3);
  assert.equal(dataURLBytes("data:image/jpeg;base64,QUI="), 2);
});
