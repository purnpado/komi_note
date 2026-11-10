import { useMemo } from "react";
import { SurveyImage } from "./QuestionMedia";
import { answerText, respondentLabel, summarizeResults, typeLabel } from "./surveyBuilderState";
import type { SurveyItem } from "./surveyTypes";
import type { SavedQuestion } from "./surveyBuilderState";

/** 결과 줄의 보기 그림(기타 줄에는 없음). */
function optionImage(question: SavedQuestion, option: string) {
  const index = (question.options || []).indexOf(option);
  return index >= 0 ? question.optionImages?.[index] || "" : "";
}

type Props = { survey: SurveyItem; nameByStudentID: Map<string, string>; formatRecordedAt: (value: string) => string };

/** 교사 화면 결과: 문항별 집계와 응답자별 답(전자칠판에는 나가지 않음). */
export function SurveyResults({ survey, nameByStudentID, formatRecordedAt }: Props) {
  const results = useMemo(() => summarizeResults(survey.questions, survey.responses || []), [survey]);
  const staff = survey.audience === "교직원";
  return (
    <>
      <section className="survey-results">
        <h4>문항별 결과 <small>응답 {survey.responses?.length || 0}명</small></h4>
        {results.map((result, index) => (
          <article key={result.question.id || index}>
            <b>{index + 1}. {result.question.text} <small>{typeLabel(result.question.type || "")} · 답한 사람 {result.answered}명</small></b>
            {result.question.imageId && <SurveyImage imageId={result.question.imageId} alt={`${index + 1}번 문항 그림`} className="result-question-image" />}
            {result.average !== null && <p className="survey-scale-average">평균 <strong>{result.average.toFixed(2)}</strong>점</p>}
            {result.rows.map((row) => (
              <div key={row.option} className="survey-result-row">
                <span>{optionImage(result.question, row.option) && <SurveyImage imageId={optionImage(result.question, row.option)} alt={row.option} className="result-option-image" />}{row.option}</span>
                <span className="survey-result-bar" aria-hidden="true"><i style={{ width: `${row.percent}%` }} /></span>
                <strong>{row.count}명</strong>
                <em>{row.percent}%</em>
              </div>
            ))}
            {result.others.length > 0 && <p className="survey-other-answers">기타: {result.others.join(" · ")}</p>}
            {result.kind === "text" && (
              result.texts.length ? <ul className="survey-text-answers">{result.texts.map((text, i) => <li key={i}>{text}</li>)}</ul> : <p className="survey-text-answer-count">아직 쓴 답이 없습니다.</p>
            )}
          </article>
        ))}
      </section>
      {(survey.responses?.length || 0) > 0 && (
        <section className="survey-response-list">
          <h4>교사용 {staff ? "응답" : "학생별 응답"} 확인</h4>
          <p className="survey-teacher-only">이 내용은 암호화 보관함의 교사 화면에서만 보이며 전자칠판에는 공개되지 않습니다.</p>
          {survey.responses.map((response, index) => (
            <div key={`${response.studentId}-${index}`}>
              <b>{respondentLabel(response, nameByStudentID, survey.anonymous, staff)}</b>
              <span>
                {survey.questions.map((question, questionIndex) => `${questionIndex + 1}. ${answerText(response, question)}`).join(" · ")}
                <small>{response.submittedAt ? formatRecordedAt(response.submittedAt) : ""}</small>
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
