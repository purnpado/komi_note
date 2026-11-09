import * as AlertDialog from "@radix-ui/react-alert-dialog";
import type { SavedQuestion } from "./surveyBuilderState";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; questions: SavedQuestion[] };

function PreviewBody({ question, index }: { question: SavedQuestion; index: number }) {
  const name = `preview-${index}`;
  const options = question.options || [];
  switch (question.type) {
    case "단답":
      return <input type="text" placeholder="짧은 답" />;
    case "서술":
      return <textarea rows={3} placeholder="긴 답" />;
    case "목록 선택":
      return <select defaultValue=""><option value="">골라 주세요</option>{options.map((o) => <option key={o}>{o}</option>)}{question.allowOther && <option>기타(직접 입력)</option>}</select>;
    case "척도":
      return (
        <>
          <div className="preview-scale">{options.map((o) => <label key={o}><input type="radio" name={name} />{o}</label>)}</div>
          {(question.scaleMinLabel || question.scaleMaxLabel) && <div className="preview-scale-ends"><span>{question.scaleMinLabel}</span><span>{question.scaleMaxLabel}</span></div>}
        </>
      );
    default: {
      const kind = question.type === "복수 선택" ? "checkbox" : "radio";
      return (
        <>
          {kind === "checkbox" && <p className="preview-hint">{question.maxChoices ? `최대 ${question.maxChoices}개까지 고를 수 있어요.` : "해당하는 것을 모두 골라 주세요."}</p>}
          {options.map((o) => <label className="preview-option" key={o}><input type={kind} name={name} /> <span>{o}</span></label>)}
          {question.allowOther && <label className="preview-option"><input type={kind} name={name} /> <span>기타(직접 입력)</span></label>}
        </>
      );
    }
  }
}

/** 학생 휴대폰에 보이는 모양을 미리 본다. 응답은 저장되지 않는다. */
export function SurveyPreview({ open, onOpenChange, title, description, questions }: Props) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content survey-preview-dialog">
          <AlertDialog.Title>학생 휴대폰 화면 미리보기</AlertDialog.Title>
          <AlertDialog.Description>눌러 볼 수 있지만 응답은 저장되지 않습니다.</AlertDialog.Description>
          <div className="student-survey-preview phone">
            <p className="eyebrow">꼬미노트 교실 참여</p>
            <h3>{title.trim() || "설문 제목"}</h3>
            {description.trim() && <p className="preview-description">{description}</p>}
            {questions.length === 0 ? <p className="empty-state">문항을 추가하면 미리보기가 보입니다.</p> : questions.map((question, index) => (
              <fieldset key={index}>
                <legend>{index + 1}. {question.text || "(질문 없음)"}{!question.optional && <span className="required-mark" aria-label="필수"> *</span>}</legend>
                {question.description && <p className="preview-description">{question.description}</p>}
                <PreviewBody question={question} index={index} />
              </fieldset>
            ))}
            <button type="button" className="primary-button">응답 제출</button>
          </div>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild><button className="primary-button">미리보기 닫기</button></AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
