// 설문 빌더의 순수 계산: 문항 카드 만들기·바꾸기·옮기기·검사, 결과 집계. 화면·Wails 호출은 여기 두지 않는다.

import { MAX_SURVEY_IMAGES, alignedImages, countImages, optionImagesAllowed, savedOptions } from "./surveyMediaState.ts";

export type QuestionType = "단일 선택" | "복수 선택" | "목록 선택" | "단답" | "서술" | "척도" | "5점 척도";

export const questionTypes: { type: QuestionType; label: string; icon: string; hint: string }[] = [
  { type: "단일 선택", label: "하나 고르기", icon: "◉", hint: "보기 중 하나만 고릅니다." },
  { type: "복수 선택", label: "여러 개 고르기", icon: "☑", hint: "해당하는 보기를 여러 개 고릅니다. 최대 개수를 정할 수 있습니다." },
  { type: "목록 선택", label: "목록에서 고르기", icon: "▾", hint: "보기가 많을 때 펼침 목록으로 고릅니다." },
  { type: "척도", label: "척도", icon: "①", hint: "1~5 또는 1~10 중 숫자를 고릅니다. 양 끝 이름을 붙일 수 있습니다." },
  { type: "단답", label: "짧은 답", icon: "▭", hint: "한 줄로 짧게 씁니다(200자)." },
  { type: "서술", label: "긴 답", icon: "▤", hint: "여러 줄로 자유롭게 씁니다(2000자)." },
];

export const legacyScaleLabel = "5점 척도(예전 방식)";

export function typeLabel(type: string) {
  if (type === "5점 척도") return legacyScaleLabel;
  return questionTypes.find((item) => item.type === type)?.label || "하나 고르기";
}

export type BuilderQuestion = {
  key: string;
  id?: string;
  text: string;
  type: QuestionType;
  options: string[];
  description: string;
  optional: boolean;
  allowOther: boolean;
  maxChoices: number;
  scaleSteps: number;
  scaleMinLabel: string;
  scaleMaxLabel: string;
  /** 문항 그림 번호(없으면 ""), 보기 그림 번호(보기와 같은 순서). */
  imageId: string;
  optionImages: string[];
};

export type SavedQuestion = {
  id?: string; text: string; type?: string; options?: string[]; description?: string; optional?: boolean;
  allowOther?: boolean; maxChoices?: number; scaleSteps?: number; scaleMinLabel?: string; scaleMaxLabel?: string;
  imageId?: string; optionImages?: string[];
};

export const isChoice = (type: string) => ["단일 선택", "복수 선택", "목록 선택", "척도", "5점 척도"].includes(type);
export const isText = (type: string) => type === "단답" || type === "서술";
const hasOptionList = (type: string) => ["단일 선택", "복수 선택", "목록 선택", "5점 척도"].includes(type);

export function scaleOptions(steps: number) {
  return Array.from({ length: steps === 10 ? 10 : 5 }, (_, index) => String(index + 1));
}

export function newQuestion(type: QuestionType, key: string): BuilderQuestion {
  return {
    key, text: "", type, description: "", optional: false, allowOther: false, maxChoices: 0,
    options: hasOptionList(type) ? ["보기 1", "보기 2"] : [],
    scaleSteps: type === "척도" ? 5 : 0, scaleMinLabel: type === "척도" ? "전혀 아니다" : "", scaleMaxLabel: type === "척도" ? "매우 그렇다" : "",
    imageId: "", optionImages: [],
  };
}

/** 유형을 바꿀 때 고르기 유형끼리는 보기를 그대로 두고, 글 답으로 바꾸면 보기를 비운다. */
export function changeType(question: BuilderQuestion, type: QuestionType): BuilderQuestion {
  const next = { ...question, type };
  if (hasOptionList(type)) {
    next.options = hasOptionList(question.type) && question.options.length ? [...question.options] : ["보기 1", "보기 2"];
  } else {
    next.options = [];
  }
  // 보기를 그대로 두는 그림 가능 유형끼리만 보기 그림을 지킨다(목록·척도·글 답으로 바꾸면 비움).
  next.optionImages = optionImagesAllowed(type) && hasOptionList(question.type) && question.options.length ? alignedImages(next.options, question.optionImages) : [];
  if (type !== "복수 선택") next.maxChoices = 0;
  if (!hasOptionList(type) || type === "5점 척도") next.allowOther = false;
  if (type === "척도") {
    next.scaleSteps = question.scaleSteps === 10 ? 10 : 5;
    next.scaleMinLabel = question.scaleMinLabel || "전혀 아니다";
    next.scaleMaxLabel = question.scaleMaxLabel || "매우 그렇다";
  } else {
    next.scaleSteps = 0; next.scaleMinLabel = ""; next.scaleMaxLabel = "";
  }
  return next;
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function duplicateQuestion(list: BuilderQuestion[], index: number, key: string): BuilderQuestion[] {
  const source = list[index];
  if (!source) return list;
  const copy: BuilderQuestion = { ...source, key, id: undefined, options: [...source.options], optionImages: [...source.optionImages], text: source.text ? `${source.text} (복사)` : "" };
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}

export function fromSavedQuestion(question: SavedQuestion, key: string): BuilderQuestion {
  const type = (question.type || "단일 선택") as QuestionType;
  return {
    key, id: question.id, text: question.text || "", type, description: question.description || "",
    optional: !!question.optional, allowOther: !!question.allowOther, maxChoices: question.maxChoices || 0,
    options: type === "척도" ? [] : [...(question.options || [])],
    scaleSteps: type === "척도" ? (question.scaleSteps === 10 ? 10 : 5) : 0,
    scaleMinLabel: question.scaleMinLabel || "", scaleMaxLabel: question.scaleMaxLabel || "",
    imageId: question.imageId || "",
    optionImages: optionImagesAllowed(type) ? alignedImages(question.options || [], question.optionImages || undefined) : [],
  };
}

export function toSavedQuestion(question: BuilderQuestion): SavedQuestion {
  const kept = savedOptions(question.type, question.options, question.optionImages);
  return {
    id: question.id, text: question.text.trim(), type: question.type, description: question.description.trim(),
    optional: question.optional, allowOther: question.allowOther, maxChoices: question.maxChoices,
    imageId: question.imageId || "", optionImages: question.type === "척도" ? [] : kept.optionImages,
    options: question.type === "척도" ? scaleOptions(question.scaleSteps) : kept.options,
    scaleSteps: question.scaleSteps, scaleMinLabel: question.scaleMinLabel.trim(), scaleMaxLabel: question.scaleMaxLabel.trim(),
  };
}

/** 저장 전에 화면에서 먼저 알려 줄 문제 목록(Go에서도 다시 검사한다). */
export function builderProblems(title: string, questions: BuilderQuestion[]): string[] {
  const problems: string[] = [];
  if (!title.trim()) problems.push("설문 제목을 입력해 주세요.");
  if (questions.length === 0) problems.push("문항을 한 개 이상 추가해 주세요.");
  questions.forEach((question, index) => {
    const label = `${index + 1}번 문항`;
    if (!question.text.trim()) problems.push(`${label}의 질문을 입력해 주세요.`);
    if (hasOptionList(question.type)) {
      const options = question.options.map((option) => option.trim()).filter(Boolean);
      const minimum = question.allowOther ? 1 : 2;
      if (options.length < minimum) problems.push(`${label}에 보기를 두 개 이상 적어 주세요.`);
      if (new Set(options).size !== options.length) problems.push(`${label}에 같은 보기가 있습니다.`);
      if (options.some((option) => option.startsWith("기타:"))) problems.push(`${label}의 보기는 '기타:'로 시작할 수 없습니다. '기타(직접 입력)'를 켜 주세요.`);
      const images = alignedImages(question.options, question.optionImages);
      if (optionImagesAllowed(question.type) && question.options.some((option, i) => !option.trim() && images[i])) problems.push(`${label}의 그림을 넣은 보기에 글(예: 1번 그림)도 써 주세요.`);
    }
  });
  if (countImages(questions) > MAX_SURVEY_IMAGES) problems.push(`그림은 설문 하나에 ${MAX_SURVEY_IMAGES}장까지 넣을 수 있습니다.`);
  return problems;
}

export type SurveyResponseLike = { studentId: string; respondentName?: string; answers?: Record<string, string>; multiAnswers?: Record<string, string[]>; submittedAt?: string };
export type ResultRow = { option: string; count: number; percent: number };
export type QuestionResult = { question: SavedQuestion; kind: "choice" | "text"; answered: number; rows: ResultRow[]; average: number | null; texts: string[]; others: string[] };

/** 문항별 결과: 고르기는 보기별 수·비율(기타는 묶음), 척도는 평균, 글 답은 목록. */
export function summarizeResults(questions: SavedQuestion[], responses: SurveyResponseLike[]): QuestionResult[] {
  return questions.map((question) => {
    const type = question.type || "단일 선택";
    const qid = question.id || "";
    const values = responses.map((response) => (type === "복수 선택" ? response.multiAnswers?.[qid] || [] : response.answers?.[qid] ? [response.answers[qid]] : []));
    const answered = values.filter((list) => list.length > 0).length;
    if (isText(type)) {
      return { question, kind: "text", answered, rows: [], average: null, texts: values.flat(), others: [] };
    }
    const options = [...(question.options || []), ...(question.allowOther ? ["기타"] : [])];
    const counts = new Map(options.map((option) => [option, 0]));
    const others: string[] = [];
    for (const value of values.flat()) {
      if (value.startsWith("기타: ")) {
        others.push(value.slice(4));
        if (counts.has("기타")) counts.set("기타", (counts.get("기타") || 0) + 1);
      } else if (counts.has(value)) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const rows = options.map((option) => ({ option, count: counts.get(option) || 0, percent: answered ? Math.round(((counts.get(option) || 0) / answered) * 100) : 0 }));
    let average: number | null = null;
    if (type === "척도" || type === "5점 척도") {
      const scores = values.flat().map((value) => Number.parseInt(value, 10)).filter((score) => Number.isFinite(score));
      average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
    }
    return { question, kind: "choice", answered, rows, average, texts: [], others };
  });
}

/** 교사 화면에 보일 응답자 이름. 수업 반 학생은 번호에 이름이 들어 있다. */
export function respondentLabel(response: SurveyResponseLike, nameByStudentID: Map<string, string>, anonymous: boolean, staff: boolean) {
  if (staff) return response.respondentName || "익명 응답";
  const id = response.studentId || "";
  if (!id) return "명렬에서 빠진 학생";
  if (id.startsWith("course|")) {
    const [, , number, name] = id.split("|");
    return `${number}번 ${name}`;
  }
  return nameByStudentID.get(id) || (anonymous ? "익명 응답" : "학생 정보 없음");
}

export function answerText(response: SurveyResponseLike, question: SavedQuestion) {
  const qid = question.id || "";
  return response.answers?.[qid] || response.multiAnswers?.[qid]?.join(", ") || "미응답";
}
