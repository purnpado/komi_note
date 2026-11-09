import * as Dialog from "@radix-ui/react-dialog";
import { HelpGuide } from "../shared/HelpGuide";
import { pendingFollowUps, searchConsultations, studentStatus } from "./consultationState";
import "./consultation.css";
import { todayLocal } from "../shared/format";
import { useConsultationPage, followTypes, shortDate, Revisions, FollowUpStatus, ConsultationPageProps, firstTypes } from "./useConsultationPage";
import { ConsultationDialog } from "./ConsultationDialog";
export type { ConsultationPageProps } from "./useConsultationPage";

export function ConsultationPage({
  students,
  openStudent,
  initialStudentID = "",
  formatRecordedAt,
  confirm,
}: ConsultationPageProps) {
  const hookView = useConsultationPage({ students, openStudent, initialStudentID, formatRecordedAt, confirm });
  const { items, setItems, photos, setPhotos, selectedID, setSelectedID, mode, setMode, dialogOpen, setDialogOpen, draft, setDraft, editing, setEditing, followTarget, setFollowTarget, followDraft, setFollowDraft, expanded, setExpanded, notice, setNotice, busy, setBusy, view, setView, filter, setFilter, printFrom, setPrintFrom, printTo, setPrintTo, selected, records, roots, reload, choose, changeDialogOpen, descendants, save, saveFollow, remove, markDone, nameOf, printStudentLog, printSearchList, startFollow, startEdit } = hookView;
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">학생별 누적 기록</p>
          <h2>상담 기록</h2>
          <p>학생을 선택했을 때만 해당 학생의 상담 기록을 작성·조회합니다.</p>
        </div>
      </section>
      <HelpGuide
        title="상담 기록 처음 사용 안내"
        description="학생 카드를 먼저 선택해 해당 학생의 상담 흐름만 기록·조회합니다. 상담 내용은 교사 프로그램의 암호화 보관함에만 저장됩니다."
        steps={[
          {
            title: "학생 선택",
            detail: "학생 카드에서 상담 기록 또는 상담 조회를 선택하면 학생별 대화상자가 열립니다. 다른 학생의 기록은 함께 표시하지 않습니다.",
          },
          {
            title: "첫 상담 기록 저장",
            detail: "날짜·상담 종류·내용·필요한 후속 확인일을 입력해 저장합니다. 저장 뒤에는 해당 학생의 기록으로만 연결됩니다.",
          },
          {
            title: "후속 기록과 조회",
            detail:
              "원 상담에서 후속 기록을 이어 쓰고, 다음 확인 예정일을 정합니다. '확인할 일'에서 예정일이 다가오거나 지난 기록을 모아 보고, '찾기·목록 인쇄'에서 학생·유형·기간·낱말로 찾아 인쇄합니다. 학생 창의 '상담일지 인쇄'로 한 학생의 흐름을 인쇄합니다.",
          },
          {
            title: "수정·삭제 주의",
            detail:
              "고치면 고치기 전 내용이 '수정됨' 이력으로 남습니다. 원 상담을 삭제하면 연결된 후속 기록과 이력도 함께 삭제되며 되돌릴 수 없습니다. 인쇄물은 외부로 반출되지 않게 보관해 주세요.",
          },
        ]}
        note="상담 내용은 화면 공유·전자칠판·학생 기기에 표시하지 마세요. 작성 시각은 초 단위로 자동 기록됩니다."
      />
      {notice && !dialogOpen && <p className="app-toast">{notice}</p>}
      <div className="consult-view-switch" role="tablist" aria-label="상담 기록 보기">
        <button role="tab" aria-selected={view === "students"} className={view === "students" ? "active" : ""} onClick={() => setView("students")}>학생별</button>
        <button role="tab" aria-selected={view === "todo"} className={view === "todo" ? "active" : ""} onClick={() => setView("todo")}>
          확인할 일 {pendingFollowUps(items).length > 0 && <b>{pendingFollowUps(items).length}</b>}
        </button>
        <button role="tab" aria-selected={view === "search"} className={view === "search" ? "active" : ""} onClick={() => setView("search")}>찾기·목록 인쇄</button>
      </div>
      {view === "todo" && (
        <section className="panel consult-todo" role="tabpanel" aria-label="확인할 일">
          <p className="consult-muted">다음 확인 예정일이 있고 아직 확인하지 않은 기록입니다. 예정일이 이른 것부터 보입니다.</p>
          {pendingFollowUps(items).length === 0 ? (
            <p className="empty-state">확인할 후속 조치가 없습니다.</p>
          ) : (
            <ul>
              {pendingFollowUps(items).map((item) => (
                <li key={item.id} className={item.followUpDate < todayLocal() ? "overdue" : ""}>
                  <div>
                    <strong>{nameOf(item.studentId)}</strong>
                    <FollowUpStatus item={item} />
                    <small>{item.date} · {item.type}</small>
                    <p>{item.content}</p>
                  </div>
                  <div className="consult-todo-actions">
                    <button className="quiet-button" onClick={() => choose(item.studentId, "view")}>열기</button>
                    <button className="quiet-button consult-done-button" disabled={busy} onClick={() => void markDone(item, true)}>✓ 확인 완료</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {view === "search" && (() => {
        const found = searchConsultations(items, filter);
        const types = [...new Set([...firstTypes, ...followTypes, ...items.map((item) => item.type)])];
        return (
          <section className="panel consult-search" role="tabpanel" aria-label="찾기">
            <div className="consult-search-filters">
              <label>학생
                <select value={filter.studentId} onChange={(event) => setFilter({ ...filter, studentId: event.target.value })}>
                  <option value="">전체 학생</option>
                  {students.slice().sort((a, b) => a.number - b.number).map((student) => (
                    <option key={student.id} value={student.id}>{student.number}번 {student.name}</option>
                  ))}
                </select>
              </label>
              <label>유형
                <select value={filter.type} onChange={(event) => setFilter({ ...filter, type: event.target.value })}>
                  <option value="">전체 유형</option>
                  {types.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>시작일<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label>
              <label>끝일<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label>
              <label className="consult-search-query">낱말<input type="search" value={filter.query} placeholder="내용에서 찾기" onChange={(event) => setFilter({ ...filter, query: event.target.value })} /></label>
            </div>
            <div className="consult-search-bar">
              <span>{found.length}건</span>
              <button className="text-button" onClick={() => setFilter({ studentId: "", type: "", from: "", to: "", query: "" })}>조건 지우기</button>
              <button className="primary-button" disabled={found.length === 0} onClick={() => printSearchList(found)}>목록 인쇄</button>
            </div>
            <ul className="consult-search-results">
              {found.slice(0, 300).map((item) => (
                <li key={item.id}>
                  <button onClick={() => choose(item.studentId, "view")}>
                    <span>{item.date}</span>
                    <strong>{nameOf(item.studentId)}</strong>
                    <span className="consult-type-chip">{item.parentId ? "↳ " : ""}{item.type}</span>
                    <FollowUpStatus item={item} />
                    <p>{item.content}</p>
                  </button>
                </li>
              ))}
            </ul>
            {found.length > 300 && <p className="consult-muted">앞의 300건만 보입니다. 조건을 좁혀 주세요(인쇄는 전체).</p>}
          </section>
        );
      })()}
      {view === "students" && (
      <section className="consultation-card-grid">
        {students
          .slice()
          .sort((a, b) => a.number - b.number)
          .map((student) => {
            const status = studentStatus(items, student.id, todayLocal());
            return (
              <article
                className={
                  selectedID === student.id
                    ? "consultation-student-card selected"
                    : "consultation-student-card"
                }
                key={student.id}
              >
                <button
                  className="consultation-student-main"
                  onClick={() => choose(student.id, "view")}
                >
                  <i className="student-card-photo">
                    {photos[student.id] ? (
                      <img src={photos[student.id]} alt="" />
                    ) : (
                      student.name[0]
                    )}
                  </i>
                  <span>
                    <b>
                      {String(student.number).padStart(2, "0")}번 {student.name}
                    </b>
                    <small>
                      상담 기록 {status.total}건{status.lastDate ? ` · 마지막 ${shortDate(status.lastDate)}` : ""}
                    </small>
                    {(status.overdue > 0 || status.planned > 0) && (
                      <span className="consult-card-flags">
                        {status.overdue > 0 && <em className="overdue">확인 지남 {status.overdue}</em>}
                        {status.planned > 0 && <em>확인 예정 {status.planned}</em>}
                      </span>
                    )}
                  </span>
                </button>
                <div>
                  <button
                    className="quiet-button"
                    onClick={() => choose(student.id, "write")}
                  >
                    상담 기록
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => choose(student.id, "view")}
                  >
                    상담 조회
                  </button>
                </div>
              </article>
            );
          })}
      </section>
      )}
      <ConsultationDialog view={{ ...hookView, students, openStudent, initialStudentID, formatRecordedAt, confirm }} />
    </>
  );
}
