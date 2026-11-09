import type { SurveyItem } from "./surveyTypes";

type Props = {
  items: SurveyItem[];
  defaultCount: (item: SurveyItem) => number;
  rosterName: (id?: string) => string;
  onNew: () => void;
  onOpen: (item: SurveyItem) => void;
  onEdit: (item: SurveyItem) => void;
  onCopy: (item: SurveyItem) => void;
  onDelete: (item: SurveyItem) => void;
};

const identity = (item: SurveyItem) => (item.audience === "교직원" ? (item.staffIdentityMode === "이름 입력" ? "이름 받기" : "익명") : item.anonymous ? "익명" : "실명");

export function SurveyList({ items, defaultCount, rosterName, onNew, onOpen, onEdit, onCopy, onDelete }: Props) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><p className="eyebrow">저장한 설문</p><h3>설문 목록</h3></div>
        <button className="primary-button" onClick={onNew}>＋ 새 설문 만들기</button>
      </div>
      <div className="survey-card-grid">
        {items.length === 0 ? <p className="empty-state">저장한 설문이 없습니다. ‘새 설문 만들기’로 시작하세요.</p> : items.map((item) => {
          const status = item.status || "준비";
          const live = status === "참여 대기" || status === "진행 중";
          const count = item.expectedParticipants || defaultCount(item);
          return (
            <article key={item.id} className="survey-card">
              <span className={`survey-status ${status}`}>{status}</span>
              <h4>{item.title}</h4>
              <p>
                {item.audience || "학생"} · {identity(item)} · 문항 {item.questions?.length || 0}개 · 응답 {item.responses?.length || 0}명{count ? ` / 대상 ${count}명` : ""}
                {item.scope === "수업용" && <><br />수업 반: {rosterName(item.targetRosterId)}</>}
              </p>
              <div>
                <button className="primary-button" onClick={() => onOpen(item)}>진행 · 결과</button>
                <button className="outline-button" disabled={status !== "준비"} title={status !== "준비" ? "시작한 설문은 복제해서 고칩니다" : undefined} onClick={() => onEdit(item)}>수정</button>
                <button className="outline-button" onClick={() => onCopy(item)}>복제</button>
                <button className="danger-button" disabled={live} onClick={() => onDelete(item)}>삭제</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
