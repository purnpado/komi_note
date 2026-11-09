import { AddStudentDialog } from "./AddStudentDialog";
import { AssessmentList } from "./AssessmentList";
import { copy, useAssessmentPage, type Props } from "./useAssessmentPage";
import { AssessmentWorkspace } from "./AssessmentWorkspace";
import { AssessmentDialogs } from "./AssessmentDialogs";
import { AssessmentReviewDialogs } from "./AssessmentReviewDialogs";
import "./assessment.css";
import "./assessment-area.css";

export function AssessmentPage({ config }: Props) {
  const view = useAssessmentPage(config);
  const {
    items,
    selected,
    setSelected,
    addStudentOpen,
    setAddStudentOpen,
    notice,
    setNotice,
    configSummary,
    load,
    chooseImport,
  } = view;

  return (
    <div className="assessment-page">
      <section className="assessment-hero">
        <div>
          <p className="eyebrow">수업용 · 암호화 보관함 저장</p>
          <h2>수행평가 관리</h2>
          <p>나이스 명렬·영역 총점은 가져오고, 각 영역의 세부 기준과 학생 점수는 한 영역씩 입력합니다.</p>
        </div>
        <div className="assessment-hero-actions">
          <span className="assessment-config">
            현재 수업 <strong>{configSummary}</strong>
          </span>
          <button className="primary-button assessment-import-button" onClick={() => void chooseImport()}>
            나이스 파일 가져오기
          </button>
        </div>
      </section>
      <details className="first-use-guide assessment-guide">
        <summary>처음 사용 안내</summary>
        <ol>
          <li>나이스 수행평가 파일을 반별로 가져옵니다.</li>
          <li>평가 영역을 하나 고른 뒤 세부 기준과 점수를 입력·저장합니다.</li>
          <li>영역별 QR과 전자칠판은 해당 영역의 점수만 분리해 표시합니다.</li>
        </ol>
      </details>
      {notice && (
        <div className="assessment-notice" role="status">
          <span>{notice}</span>
          <button className="quiet-button" onClick={() => setNotice("")}>
            확인
          </button>
        </div>
      )}
      <div className="assessment-layout">
        <aside className="assessment-list panel" aria-label="수행평가 목록">
          <div className="assessment-list-heading">
            <div>
              <p>저장된 수행평가</p>
              <h3>평가 목록</h3>
            </div>
            <span>{items.length}</span>
          </div>
          {items.length === 0 ? (
            <p className="empty-note">아직 가져온 수행평가가 없습니다.</p>
          ) : (
            <AssessmentList items={items} selected={selected} onSelect={(item) => setSelected(copy(item))} />
          )}
        </aside>
        <AssessmentWorkspace view={view} />
      </div>
      {selected && (
        <AddStudentDialog
          open={addStudentOpen}
          assessment={selected}
          onOpenChange={setAddStudentOpen}
          onAdded={(next, message) => {
            void load(next.id);
            setNotice(message);
          }}
        />
      )}
      <AssessmentDialogs view={view} />
      <AssessmentReviewDialogs view={view} />
    </div>
  );
}
