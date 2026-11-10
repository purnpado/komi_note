import { FormEvent, useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { SaveSurvey } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { QuestionCard } from "./QuestionCard";
import { SurveyPreview } from "./SurveyPreview";
import { type BuilderQuestion, type QuestionType, builderProblems, duplicateQuestion, fromSavedQuestion, moveItem, newQuestion, questionTypes, toSavedQuestion } from "./surveyBuilderState";
import { type SurveyScope, surveyTemplates } from "./surveyTemplates";
import { MAX_SURVEY_IMAGES, countImages } from "./surveyMediaState";
import type { SurveyItem } from "./surveyTypes";
import "./survey-builder.css";

type Props = {
  scope: SurveyScope;
  audience: "학생" | "교직원";
  editing: SurveyItem | null;
  copyFrom: SurveyItem | null;
  rosters: models.CourseRoster[];
  homeroomCount: number;
  onSaved: (saved: SurveyItem, message: string) => void;
  onCancel: () => void;
};

export function SurveyBuilder({ scope, audience, editing, copyFrom, rosters, homeroomCount, onSaved, onCancel }: Props) {
  const nextKey = useRef(0);
  const makeKey = () => `q${++nextKey.current}`;
  const source = editing || copyFrom;
  const [title, setTitle] = useState(source ? (copyFrom ? `${source.title} (복사)` : source.title) : "");
  const [description, setDescription] = useState(source?.description || "");
  const [anonymous, setAnonymous] = useState(source ? source.anonymous : true);
  const [expected, setExpected] = useState(source?.expectedParticipants || 0);
  const [staffIdentityMode, setStaffIdentityMode] = useState<"익명" | "이름 입력">(source?.staffIdentityMode === "이름 입력" ? "이름 입력" : "익명");
  const [targetRosterId, setTargetRosterId] = useState(source?.targetRosterId || "");
  const [questions, setQuestions] = useState<BuilderQuestion[]>(() =>
    source?.questions?.length
      ? source.questions.map((question) => ({ ...fromSavedQuestion(question, makeKey()), id: copyFrom ? undefined : question.id }))
      : [{ ...newQuestion("단일 선택", makeKey()), text: "" }],
  );
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const listEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => setProblems([]), [title, questions]);

  const roster = rosters.find((item) => item.id === targetRosterId);
  const defaultCount = audience === "교직원" ? 0 : scope === "수업용" && roster ? roster.students.filter((s) => !s.status || s.status === "재학").length : homeroomCount;

  function addQuestion(type: QuestionType) {
    setQuestions((list) => [...list, newQuestion(type, makeKey())]);
    window.setTimeout(() => listEnd.current?.previousElementSibling?.querySelector<HTMLInputElement>(".question-text")?.focus(), 0);
  }
  function applyTemplate(template: (typeof surveyTemplates)[number]) {
    setTitle(template.title);
    setQuestions(template.questions.map((question) => fromSavedQuestion(question, makeKey())));
    setNotice(`‘${template.name}’ 틀을 불러왔습니다. 문항은 자유롭게 고칠 수 있습니다.`);
  }
  function finishDrag() {
    if (dragIndex !== null && overIndex !== null) setQuestions((list) => moveItem(list, dragIndex, overIndex));
    setDragIndex(null);
    setOverIndex(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found = builderProblems(title, questions);
    if (scope === "수업용" && audience === "학생" && !targetRosterId) found.unshift("참여할 수업 반을 골라 주세요.");
    if (found.length) {
      setProblems(found);
      return;
    }
    try {
      setBusy(true);
      const saved = await SaveSurvey(new models.Survey({
        ...(editing || {}),
        id: editing?.id || "",
        responses: editing?.responses || [],
        title, description, scope, audience, anonymous, targetRosterId,
        staffIdentityMode: audience === "교직원" ? staffIdentityMode : "",
        expectedParticipants: expected,
        questions: questions.map(toSavedQuestion),
      }));
      onSaved(saved as unknown as SurveyItem, editing ? "설문을 수정했습니다." : "설문을 저장했습니다.");
    } catch (error) {
      setProblems([errorMessage(error)]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel survey-builder">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{editing ? "준비 설문 수정" : copyFrom ? "설문 복제" : "새 설문"}</p>
          <h3>{title.trim() || "설문 만들기"}</h3>
        </div>
        <button type="button" className="outline-button" onClick={() => setPreviewOpen(true)}>휴대폰 화면 미리보기</button>
      </div>
      {!editing && !copyFrom && (
        <section className="survey-template-picker">
          <div><b>{scope} 설문 틀</b><p>용도에 맞는 틀을 고른 뒤 문항을 고치세요.</p></div>
          <div className="survey-template-grid">
            {surveyTemplates.filter((template) => template.scopes.includes(scope)).map((template) => (
              <button type="button" key={template.name} onClick={() => applyTemplate(template)}><strong>{template.name}</strong><small>{template.description}</small></button>
            ))}
          </div>
        </section>
      )}
      <form className="survey-builder-form" onSubmit={save}>
        <section className="survey-meta-card">
          <input className="survey-title-input" value={title} maxLength={100} placeholder="설문 제목" aria-label="설문 제목" onChange={(event) => setTitle(event.target.value)} />
          <textarea className="survey-description-input" rows={2} value={description} maxLength={1000} placeholder="설문 설명(선택) — 학생 화면 맨 위에 보입니다" aria-label="설문 설명" onChange={(event) => setDescription(event.target.value)} />
          <div className="survey-meta-grid">
            {scope === "수업용" && audience === "학생" && (
              <label>참여할 수업 반
                <select value={targetRosterId} onChange={(event) => setTargetRosterId(event.target.value)}>
                  <option value="">수업 반 고르기</option>
                  {rosters.map((item) => <option key={item.id} value={item.id}>{item.schoolYear}학년도 {item.className} ({item.students.filter((s) => !s.status || s.status === "재학").length}명)</option>)}
                </select>
                <small>{rosters.length ? "학생은 이 반의 번호와 이름으로 참여합니다." : "수업 명렬이 없습니다. 평가 관리에서 나이스 파일을 가져오면 수업 반이 생깁니다."}</small>
              </label>
            )}
            {audience === "학생" && scope !== "수업용" && <p className="survey-identity-note">학생은 우리 반 번호와 이름으로 참여합니다.</p>}
            <label>참여 대상 인원
              <input type="number" min="0" value={expected} onChange={(event) => setExpected(Math.max(0, Number(event.target.value) || 0))} />
              <small>{audience === "학생" ? `0이면 명렬 인원(${defaultCount}명)을 씁니다.` : "선택 사항입니다. 0이면 인원을 표시하지 않습니다."}</small>
            </label>
            {audience === "학생" ? (
              <label className="inline-check">
                <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} /> 익명 설문
                <HelpTip>전자칠판·학생 화면에는 이름 없이 집계만 보입니다. 교사 화면에서는 누가 답했는지 확인할 수 있습니다.</HelpTip>
              </label>
            ) : (
              <label className="inline-check">
                <input type="checkbox" checked={staffIdentityMode === "이름 입력"} onChange={(event) => setStaffIdentityMode(event.target.checked ? "이름 입력" : "익명")} /> 응답자 이름 받기
                <HelpTip>켜면 교직원이 이름을 입력하고 교사 화면에서 이름과 답을 봅니다. 끄면 이름 없이 익명으로 참여합니다.</HelpTip>
              </label>
            )}
          </div>
        </section>

        <div className="survey-question-list">
          {questions.map((question, index) => (
            <QuestionCard
              key={question.key}
              question={question}
              index={index}
              total={questions.length}
              locked={busy}
              dragOver={overIndex === index && dragIndex !== null && dragIndex !== index}
              onChange={(next) => setQuestions((list) => list.map((item) => (item.key === question.key ? next : item)))}
              onUpdate={(update) => setQuestions((list) => list.map((item) => (item.key === question.key ? update(item) : item)))}
              imagesLeft={MAX_SURVEY_IMAGES - countImages(questions)}
              onMove={(to) => setQuestions((list) => moveItem(list, index, to))}
              onDuplicate={() => setQuestions((list) => duplicateQuestion(list, index, makeKey()))}
              onDelete={() => setDeleteIndex(index)}
              onDragStart={() => setDragIndex(index)}
              onDragEnter={() => setOverIndex(index)}
              onDragEnd={finishDrag}
            />
          ))}
          <div ref={listEnd} />
        </div>

        <div className="survey-add-bar" role="group" aria-label="문항 추가">
          <b>문항 추가</b>
          {questionTypes.map((item) => (
            <button type="button" key={item.type} title={item.hint} disabled={questions.length >= 50} onClick={() => addQuestion(item.type)}><span aria-hidden="true">{item.icon}</span> {item.label}</button>
          ))}
        </div>

        {problems.length > 0 && (
          <div className="survey-problems" role="alert"><b>저장하기 전에 확인해 주세요</b><ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>
        )}
        {notice && <p className="form-notice">{notice}</p>}
        <div className="survey-editor-actions">
          <button type="button" className="quiet-button" onClick={onCancel}>취소</button>
          <button className="primary-button" disabled={busy}>{busy ? "저장 중…" : editing ? "수정 저장" : "설문 저장"}</button>
        </div>
      </form>

      <SurveyPreview open={previewOpen} onOpenChange={setPreviewOpen} title={title} description={description} questions={questions.map(toSavedQuestion)} />
      <AlertDialog.Root open={deleteIndex !== null} onOpenChange={(open) => { if (!open) setDeleteIndex(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>{deleteIndex !== null ? `${deleteIndex + 1}번 문항을 지울까요?` : "문항 지우기"}</AlertDialog.Title>
            <AlertDialog.Description>{deleteIndex !== null && questions[deleteIndex]?.text ? `“${questions[deleteIndex].text}” 문항과 보기를 지웁니다.` : "이 문항과 보기를 지웁니다."} 저장하기 전이라면 취소로 되돌릴 수 없습니다.</AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button">취소</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => { if (deleteIndex !== null) setQuestions((list) => list.filter((_, i) => i !== deleteIndex)); setDeleteIndex(null); }}>문항 지우기</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
