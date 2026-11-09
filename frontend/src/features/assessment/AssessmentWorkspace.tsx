import { SendCourseRosterDialog } from "./SendCourseRosterDialog";
import { ScoreTable } from "./ScoreTable";
import { criteriaMaxSum, visibleCriteria } from "./assessmentScores";
import { GradeSelect } from "./AssessmentList";
import { main as models } from "../../../wailsjs/go/models";
import type { AssessmentView } from "./useAssessmentPage";
import { StatCard } from "./AssessmentParts";

/** 평가 관리 오른쪽 작업 구역: 평가 요약, 영역 탭, 점수표, 학생 이의함. */
export function AssessmentWorkspace({ view }: { view: AssessmentView }) {
  const {
    selected,
    setSelected,
    setDomainID,
    setAddStudentOpen,
    setNotice,
    busy,
    title,
    setCriterionOpen,
    setAnswering,
    setReasoning,
    setDeleteOpen,
    setDeletingObjection,
    activeDomain,
    chooseImport,
    unsaved,
    save,
    startQR,
    startAnswerQR,
    openBoard,
    answer,
    criteria,
    missing,
    pending,
  } = view;
  return (
    <main className="assessment-workspace">
      {selected && activeDomain ? (
        <>
          <section className="panel assessment-header">
            <div className="assessment-title-editor">
              <p className="eyebrow">
                {selected.subject} · {selected.className} · 수업 명렬 {selected.students.length}명
              </p>
              <GradeSelect
                value={selected.grade || ""}
                onChange={(grade) => setSelected(new models.Assessment({ ...selected, grade }))}
              />
              <label>
                평가 이름
                <input
                  value={selected.title}
                  onChange={(event) => setSelected(new models.Assessment({ ...selected, title: event.target.value }))}
                />
              </label>
            </div>
            <div className="assessment-actions">
              <SendCourseRosterDialog key={selected.id} assessment={selected} onComplete={setNotice} />
              <button className="quiet-button" onClick={() => void startQR()}>
                학생 QR 열기
              </button>
              <button className="quiet-button" onClick={() => void openBoard()}>
                전자칠판 열기
              </button>
              <button
                className="quiet-button"
                onClick={() => {
                  if (unsaved) {
                    setNotice("저장하지 않은 점수가 있습니다. 먼저 [점수 저장]을 눌러 주세요.");
                    return;
                  }
                  setAddStudentOpen(true);
                }}
              >
                ＋ 전입생 추가
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void save()}>
                점수 저장
              </button>
              <button className="danger-button" onClick={() => setDeleteOpen(true)}>
                삭제
              </button>
            </div>
          </section>
          <section className="assessment-stat-grid">
            <StatCard
              title="수업 명렬"
              value={`${selected.students.length}명`}
              note="나이스 파일에서 등록"
              tone="blue"
            />
            <StatCard
              title="현재 영역 미입력"
              value={`${missing}건`}
              note={`${activeDomain.name} 기준`}
              tone={missing ? "orange" : "green"}
            />
            <StatCard
              title="답변 대기 이의"
              value={`${pending}건`}
              note="교사만 열람"
              tone={pending ? "orange" : "green"}
            />
          </section>
          <section className="panel assessment-section">
            <div className="assessment-section-heading">
              <div>
                <p>01 · 영역 선택</p>
                <h3>평가 영역과 세부 기준</h3>
                <span>학생 QR도 현재 선택한 영역만 보여 줍니다.</span>
              </div>
            </div>
            <div className="assessment-domain-tabs" role="tablist">
              {selected.domains.map((domain) => (
                <button
                  key={domain.id}
                  role="tab"
                  aria-selected={domain.id === activeDomain.id}
                  className={domain.id === activeDomain.id ? "active" : ""}
                  onClick={() => setDomainID(domain.id)}
                >
                  <strong>{domain.name}</strong>
                  <small>
                    {domain.maxScore}점 · 기준 {visibleCriteria(domain).length}개
                  </small>
                </button>
              ))}
            </div>
            <div className="assessment-domain-focus">
              <div>
                <p className="eyebrow">현재 영역</p>
                <h4>
                  {activeDomain.name} <span>{activeDomain.maxScore}점</span>
                </h4>
                <p className="assessment-imported-score">
                  나이스 원본 총점은 참고용으로 보관되며 세부 기준 점수에는 포함하지 않습니다.
                </p>
                {criteria.length ? (
                  <ul>
                    {criteria.map((criterion) => (
                      <li key={criterion.id}>
                        {criterion.name}
                        <small>
                          {criterion.maxScore}점{criterion.note ? ` · ${criterion.note}` : ""}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-note">세부 기준을 추가하면 학생별 점수와 채점 사유를 입력할 수 있습니다.</p>
                )}
              </div>
              <button className="quiet-button" onClick={() => setCriterionOpen(true)}>
                세부 기준 추가
              </button>
            </div>
          </section>
          <section className="panel assessment-section assessment-score-panel">
            <div className="assessment-section-heading">
              <div>
                <p>02 · {activeDomain.name}</p>
                <h3>학생별 세부 점수 입력</h3>
                <span>세부 기준 점수와 채점 사유를 입력합니다. 빈칸은 미입력입니다.</span>
              </div>
              <b className="assessment-count-badge">{activeDomain.maxScore}점 만점</b>
            </div>
            {!criteria.length && (
              <p className="empty-note">
                세부 기준이 없어도 학생 확인 상태를 볼 수 있습니다. 기준을 추가하면 점수를 입력할 수 있습니다.
              </p>
            )}
            {unsaved && (
              <p className="assessment-unsaved" role="status">
                저장하지 않은 변경이 있습니다. [점수 저장]을 눌러야 학생 QR 화면에 반영됩니다.
              </p>
            )}
            {criteria.length > 0 && criteriaMaxSum(activeDomain) > activeDomain.maxScore && (
              <p className="assessment-unsaved" role="alert">
                세부 기준 만점 합계({criteriaMaxSum(activeDomain)}점)가 영역 만점({activeDomain.maxScore}점)보다 큽니다.
                기준 만점을 확인해 주세요.
              </p>
            )}
            <ScoreTable assessment={selected} domain={activeDomain} onChange={setSelected} onReason={setReasoning} />
          </section>
          <section className="panel assessment-section">
            <div className="assessment-section-heading">
              <div>
                <p>03 · 학생 이의</p>
                <h3>이의함</h3>
                <span>학생 이의와 답변은 전자칠판에 표시하지 않습니다.</span>
              </div>
              <div className="assessment-section-actions">
                <b className="assessment-count-badge">{pending}건 대기</b>
                <button className="quiet-button" onClick={() => void startAnswerQR()}>
                  답변 재확인 QR
                </button>
              </div>
            </div>
            {selected.objections.length === 0 ? (
              <p className="empty-note">제출된 이의가 없습니다.</p>
            ) : (
              <div className="objection-list">
                {selected.objections.map((objection) => {
                  const student = selected.students.find((item) => item.id === objection.studentId);
                  const studentName = `${student?.number ?? ""}번 ${student?.name ?? "학생"}`;
                  return (
                    <article key={objection.id}>
                      <header>
                        <strong>{studentName}</strong>
                        <span>{objection.status}</span>
                      </header>
                      <p>{objection.content}</p>
                      {objection.answer ? (
                        <>
                          <p className="answer">답변: {objection.answer}</p>
                          {objection.status === "답변 완료" && (
                            <button
                              className="danger-button assessment-objection-delete"
                              onClick={() => setDeletingObjection({ id: objection.id, studentName })}
                            >
                              이의 삭제
                            </button>
                          )}
                        </>
                      ) : (
                        <button className="quiet-button" onClick={() => setAnswering({ id: objection.id, value: "" })}>
                          답변 작성
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel empty-assessment">
          <h3>나이스 수행평가 파일을 가져와 시작하세요</h3>
          <p>파일의 과목·반·번호·성명과 영역 점수가 수업 최소 명렬이 됩니다.</p>
          <button className="primary-button" onClick={() => void chooseImport()}>
            나이스 파일 가져오기
          </button>
        </section>
      )}
    </main>
  );
}
