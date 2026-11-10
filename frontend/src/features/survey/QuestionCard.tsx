import { KeyboardEvent, useRef, useState } from "react";
import { HelpTip } from "../shared/HelpTip";
import { ImagePickButton, SurveyImage } from "./QuestionMedia";
import { type BuilderQuestion, type QuestionType, changeType, legacyScaleLabel, questionTypes, scaleOptions } from "./surveyBuilderState";
import { addOptionAt, alignedImages, imagePrivacyNote, moveOptionAt, optionImagesAllowed, removeOptionAt, setOptionImage } from "./surveyMediaState";

type Props = {
  question: BuilderQuestion;
  index: number;
  total: number;
  locked: boolean;
  dragOver: boolean;
  onChange: (next: BuilderQuestion) => void;
  /** 그림 올리기처럼 기다린 뒤 바꿀 때: 그 순간의 문항을 받아 고친다. */
  onUpdate: (update: (current: BuilderQuestion) => BuilderQuestion) => void;
  imagesLeft: number;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
};

const optionMark = (type: QuestionType, index: number) => (type === "복수 선택" ? "☐" : type === "목록 선택" ? `${index + 1}.` : "○");

export function QuestionCard({ question, index, total, locked, dragOver, onChange, onUpdate, imagesLeft, onMove, onDuplicate, onDelete, onDragStart, onDragEnter, onDragEnd }: Props) {
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [imageNotice, setImageNotice] = useState("");
  const set = (patch: Partial<BuilderQuestion>) => onChange({ ...question, ...patch });
  const hasOptions = ["단일 선택", "복수 선택", "목록 선택", "5점 척도"].includes(question.type);
  const optionCount = question.options.length + (question.allowOther ? 1 : 0);
  const withImages = optionImagesAllowed(question.type);
  const images = alignedImages(question.options, question.optionImages);

  function setOption(position: number, value: string) {
    set({ options: question.options.map((option, i) => (i === position ? value : option)) });
  }
  function addOption(after = question.options.length - 1) {
    set(addOptionAt(question, after, `보기 ${question.options.length + 1}`));
    window.setTimeout(() => optionRefs.current[after + 1]?.select(), 0);
  }
  function removeOption(position: number) {
    set(removeOptionAt(question, position));
  }
  function optionKey(event: KeyboardEvent<HTMLInputElement>, position: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      addOption(position);
    } else if (event.key === "Backspace" && !event.currentTarget.value && question.options.length > 1) {
      event.preventDefault();
      removeOption(position);
      window.setTimeout(() => optionRefs.current[Math.max(0, position - 1)]?.focus(), 0);
    } else if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const to = position + (event.key === "ArrowUp" ? -1 : 1);
      set(moveOptionAt(question, position, to));
      window.setTimeout(() => optionRefs.current[to]?.focus(), 0);
    }
  }

  return (
    <article
      className={`survey-question-card${dragOver ? " drag-over" : ""}`}
      aria-label={`${index + 1}번 문항`}
      onDragOver={(event) => { event.preventDefault(); onDragEnter(); }}
      onDrop={(event) => { event.preventDefault(); onDragEnd(); }}
    >
      <header className="question-card-head">
        <span
          className="question-drag"
          draggable={!locked}
          onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }}
          onDragEnd={onDragEnd}
          title="끌어서 순서 바꾸기"
          aria-hidden="true"
        >⠿</span>
        <b className="question-number">{index + 1}번</b>
        <label className="question-type">
          <span className="sr-only">문항 유형</span>
          <select value={question.type} disabled={locked} onChange={(event) => onChange(changeType(question, event.target.value as QuestionType))}>
            {questionTypes.map((item) => <option key={item.type} value={item.type}>{item.icon} {item.label}</option>)}
            {question.type === "5점 척도" && <option value="5점 척도">{legacyScaleLabel}</option>}
          </select>
        </label>
        <div className="question-card-tools">
          <button type="button" className="icon-button" disabled={locked || index === 0} onClick={() => onMove(index - 1)} aria-label={`${index + 1}번 문항 위로`}>↑</button>
          <button type="button" className="icon-button" disabled={locked || index === total - 1} onClick={() => onMove(index + 1)} aria-label={`${index + 1}번 문항 아래로`}>↓</button>
          <button type="button" className="quiet-button" disabled={locked} onClick={onDuplicate}>복제</button>
          <button type="button" className="quiet-button danger-text" disabled={locked} onClick={onDelete}>삭제</button>
        </div>
      </header>
      <input className="question-text" value={question.text} disabled={locked} maxLength={200} placeholder="질문을 입력해 주세요" aria-label={`${index + 1}번 질문`} onChange={(event) => set({ text: event.target.value })} />
      <textarea className="question-description" rows={1} value={question.description} disabled={locked} maxLength={500} placeholder="설명(선택) — 학생에게 보일 도움말" aria-label={`${index + 1}번 설명`} onChange={(event) => set({ description: event.target.value })} />
      <div className="question-image-row">
        {question.imageId ? (
          <>
            <SurveyImage imageId={question.imageId} alt={`${index + 1}번 문항 그림`} className="question-image" />
            <button type="button" className="quiet-button danger-text" disabled={locked} onClick={() => set({ imageId: "" })}>그림 빼기</button>
          </>
        ) : (
          <ImagePickButton label="＋ 문항 그림 넣기" ariaLabel={`${index + 1}번 문항 그림 넣기`} disabled={locked} imagesLeft={imagesLeft} onNotice={setImageNotice} onPicked={(imageId) => onUpdate((current) => ({ ...current, imageId }))} />
        )}
        {imageNotice && <p className="form-notice" role="alert">{imageNotice}</p>}
        <HelpTip>{`${imagePrivacyNote} 고른 그림은 휴대폰에서 빨리 열리게 자동으로 줄여 저장합니다.${withImages ? " 보기마다 그림을 붙이면 '그림 보고 고르기' 문항이 됩니다." : ""}`}</HelpTip>
      </div>

      {hasOptions && (
        <div className="question-options">
          {question.options.map((option, position) => (
            <div className={`question-option${withImages ? " with-image" : ""}`} key={position}>
              <span className="option-mark" aria-hidden="true">{optionMark(question.type, position)}</span>
              <input
                ref={(node) => { optionRefs.current[position] = node; }}
                value={option}
                disabled={locked}
                maxLength={100}
                aria-label={`${index + 1}번 문항 보기 ${position + 1}`}
                onChange={(event) => setOption(position, event.target.value)}
                onKeyDown={(event) => optionKey(event, position)}
              />
              {withImages && (images[position] ? (
                <span className="option-image">
                  <SurveyImage imageId={images[position]} alt={`보기 ${position + 1} 그림`} />
                  <button type="button" className="icon-button" disabled={locked} onClick={() => set(setOptionImage(question, position, ""))} aria-label={`보기 ${position + 1} 그림 빼기`}>⊖</button>
                </span>
              ) : (
                <ImagePickButton label="그림" ariaLabel={`보기 ${position + 1}에 그림 넣기`} className="quiet-button option-image-pick" disabled={locked} imagesLeft={imagesLeft} onNotice={setImageNotice} onPicked={(imageId) => onUpdate((current) => ({ ...current, ...setOptionImage(current, position, imageId) }))} />
              ))}
              <button type="button" className="icon-button" disabled={locked || question.options.length <= 1} onClick={() => removeOption(position)} aria-label={`보기 ${position + 1} 지우기`}>×</button>
            </div>
          ))}
          {question.allowOther && <div className="question-option other"><span className="option-mark" aria-hidden="true">{optionMark(question.type, question.options.length)}</span><span>기타(직접 입력)</span></div>}
          <div className="question-option-actions">
            <button type="button" className="text-button" disabled={locked || question.options.length >= 30} onClick={() => addOption()}>＋ 보기 추가</button>
            <HelpTip>보기 칸에서 Enter를 누르면 아래에 새 보기가 생깁니다. 빈 칸에서 Backspace는 그 보기를 지우고, Alt+↑↓는 보기 순서를 바꿉니다.</HelpTip>
          </div>
        </div>
      )}

      {question.type === "척도" && (
        <div className="question-scale">
          <label>단계
            <select value={question.scaleSteps} disabled={locked} onChange={(event) => set({ scaleSteps: Number(event.target.value) })}>
              <option value={5}>1 ~ 5</option>
              <option value={10}>1 ~ 10</option>
            </select>
          </label>
          <label>1의 이름<input value={question.scaleMinLabel} disabled={locked} maxLength={30} onChange={(event) => set({ scaleMinLabel: event.target.value })} /></label>
          <label>{question.scaleSteps === 10 ? 10 : 5}의 이름<input value={question.scaleMaxLabel} disabled={locked} maxLength={30} onChange={(event) => set({ scaleMaxLabel: event.target.value })} /></label>
          <div className="scale-preview" aria-hidden="true">{scaleOptions(question.scaleSteps).map((step) => <span key={step}>{step}</span>)}</div>
        </div>
      )}

      {question.type === "단답" && <div className="question-answer-preview" aria-hidden="true">짧은 답 칸(200자)</div>}
      {question.type === "서술" && <div className="question-answer-preview long" aria-hidden="true">긴 답 칸(2000자)</div>}

      <footer className="question-card-foot">
        {["단일 선택", "복수 선택", "목록 선택"].includes(question.type) && (
          <label className="inline-check"><input type="checkbox" checked={question.allowOther} disabled={locked} onChange={(event) => set({ allowOther: event.target.checked })} /> 기타(직접 입력) 칸</label>
        )}
        {question.type === "복수 선택" && (
          <label className="inline-select">최대
            <select value={question.maxChoices} disabled={locked} onChange={(event) => set({ maxChoices: Number(event.target.value) })}>
              <option value={0}>제한 없음</option>
              {Array.from({ length: Math.max(0, optionCount - 1) }, (_, i) => i + 1).map((count) => <option key={count} value={count}>{count}개까지</option>)}
            </select>
          </label>
        )}
        <label className="inline-check required-toggle"><input type="checkbox" checked={!question.optional} disabled={locked} onChange={(event) => set({ optional: !event.target.checked })} /> 꼭 답하기</label>
      </footer>
    </article>
  );
}
