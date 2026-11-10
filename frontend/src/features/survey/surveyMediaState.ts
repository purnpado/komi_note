// 설문 그림(문항 그림·보기 그림)의 순수 계산. 그림 파일은 Go 보관함에 두고 여기서는 그림 번호만 다룬다.
// 보기 그림은 보기와 같은 순서·같은 길이로 맞춰 두어, 보기를 더하거나 지우거나 옮길 때 그림도 함께 따라간다.

import type { BuilderQuestion } from "./surveyBuilderState";

/** 설문 하나에 넣을 수 있는 그림 수(Go `survey.MaxImages`와 같아야 함). */
export const MAX_SURVEY_IMAGES = 20;
/** 휴대폰에서 빨리 열리도록 긴 변을 이 크기로 줄인다. */
export const IMAGE_LONG_SIDE = 1280;
/** 줄인 뒤에도 이보다 크면 저장하지 않는다(Go와 같은 2MB). */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export const imagePrivacyNote = "학생 얼굴·이름이 보이는 사진은 넣지 마세요. 그림은 이 컴퓨터에 암호화해 두고, 설문 회차 동안 참여한 기기에서만 보입니다.";

/** 보기마다 그림을 붙일 수 있는 유형(목록·척도는 그림을 보일 자리가 없다). */
export function optionImagesAllowed(type: string) {
  return type === "단일 선택" || type === "복수 선택";
}

/** 보기 수에 맞춘 보기 그림 목록(모자라면 "", 넘치면 자름). */
export function alignedImages(options: string[], images: string[] | undefined) {
  return options.map((_, index) => images?.[index] || "");
}

type OptionPart = Pick<BuilderQuestion, "options" | "optionImages">;

export function addOptionAt(question: OptionPart, after: number, text: string): OptionPart {
  const options = [...question.options];
  const images = alignedImages(question.options, question.optionImages);
  options.splice(after + 1, 0, text);
  images.splice(after + 1, 0, "");
  return { options, optionImages: images };
}

export function removeOptionAt(question: OptionPart, position: number): OptionPart {
  const images = alignedImages(question.options, question.optionImages);
  return { options: question.options.filter((_, i) => i !== position), optionImages: images.filter((_, i) => i !== position) };
}

export function moveOptionAt(question: OptionPart, from: number, to: number): OptionPart {
  const size = question.options.length;
  if (from === to || from < 0 || to < 0 || from >= size || to >= size) return question;
  const options = [...question.options];
  const images = alignedImages(question.options, question.optionImages);
  const [option] = options.splice(from, 1);
  const [image] = images.splice(from, 1);
  options.splice(to, 0, option);
  images.splice(to, 0, image);
  return { options, optionImages: images };
}

export function setOptionImage(question: OptionPart, position: number, imageId: string): OptionPart {
  const images = alignedImages(question.options, question.optionImages);
  images[position] = imageId;
  return { options: question.options, optionImages: images };
}

/** 저장할 보기와 보기 그림: 빈 보기는 그 그림과 함께 뺀다. 그림이 하나도 없으면 빈 목록. */
export function savedOptions(type: string, options: string[], images: string[] | undefined) {
  const aligned = alignedImages(options, images);
  const kept = options.map((option, index) => ({ text: option.trim(), image: aligned[index] })).filter((item) => item.text);
  const optionImages = optionImagesAllowed(type) && kept.some((item) => item.image) ? kept.map((item) => item.image) : [];
  return { options: kept.map((item) => item.text), optionImages };
}

/** 설문 전체 그림 수(같은 그림을 두 번 써도 따로 센다 — Go 검사와 같음). */
export function countImages(questions: Pick<BuilderQuestion, "type" | "imageId" | "options" | "optionImages">[]) {
  return questions.reduce((sum, question) => {
    const optionImages = optionImagesAllowed(question.type) ? alignedImages(question.options, question.optionImages).filter(Boolean).length : 0;
    return sum + (question.imageId ? 1 : 0) + optionImages;
  }, 0);
}

/** 긴 변이 limit을 넘으면 비율을 지켜 줄인 크기. */
export function fitImageSize(width: number, height: number, limit = IMAGE_LONG_SIDE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= limit) return { width: Math.round(width), height: Math.round(height) };
  const scale = limit / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** data URL의 실제 바이트 수(base64 길이로 계산). */
export function dataURLBytes(dataURL: string) {
  const comma = dataURL.indexOf(",");
  const body = comma >= 0 ? dataURL.slice(comma + 1) : dataURL;
  const padding = body.endsWith("==") ? 2 : body.endsWith("=") ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}
