import "./students.css";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { StudentEditor } from "./StudentEditor";
import { ResetStudentsDialog, DeleteStudentDialog, AcademicChangeDialog } from "./StudentDialogs";
import { useStudentsPage, StudentRosterIcon } from "./useStudentsPage";

export function StudentsPage({
  students,
  reloadStudents,
  openStudent,
  displayGender,
}: {
  students: models.Student[];
  reloadStudents: () => Promise<void>;
  openStudent: (student: models.Student) => void;
  displayGender: (gender: string) => string;
}) {
  const {
    search,
    setSearch,
    preview,
    setPreview,
    path,
    setPath,
    notice,
    setNotice,
    busy,
    setBusy,
    resetOpen,
    setResetOpen,
    confirmation,
    setConfirmation,
    resetNotice,
    setResetNotice,
    deleteTarget,
    setDeleteTarget,
    deleteConfirmation,
    setDeleteConfirmation,
    deleteNotice,
    setDeleteNotice,
    academicChanges,
    setAcademicChanges,
    academicTarget,
    setAcademicTarget,
    academicStatus,
    setAcademicStatus,
    academicDate,
    setAcademicDate,
    academicConfirmation,
    setAcademicConfirmation,
    academicNotice,
    setAcademicNotice,
    adding,
    setAdding,
    photos,
    setPhotos,
    rosterView,
    setRosterView,
    filtered,
    reloadAcademicChanges,
    age,
    state,
    selectFile,
    importRoster,
    resetStudents,
    closeReset,
    deleteStudent,
    closeDelete,
    processAcademicChange,
    closeAcademicChange,
    newStudent,
  } = useStudentsPage({ students, reloadStudents, openStudent, displayGender });
  return (
    <div className="students-page">
      <section className="page-intro page-head">
        <div>
          <StudentRosterIcon />
          <p className="eyebrow">학생 개인정보는 암호화되어 저장됩니다</p>
          <h2>학생 명렬과 기본 정보</h2>
          <p>학생을 누르면 학생 상세정보를 확인하고 수정할 수 있습니다.</p>
        </div>
        <div className="page-actions">
          <button className="quiet-button" onClick={() => setAdding(true)} disabled={busy}>
            ＋ 학생 직접 추가
          </button>
          <button className="primary-button" onClick={selectFile} disabled={busy}>
            ⇧ 명렬표 가져오기
          </button>
          <HelpTip>나이스 명렬표에서 성별·생년월일·주소를 선택해 추가한 뒤 내려받은 엑셀 파일을 선택합니다.</HelpTip>
          {/* B5(2026-11-09): 되돌릴 수 없는 버튼은 줄 끝에 둔다 */}
          <button className="quiet-button danger-button" onClick={() => setResetOpen(true)} disabled={busy}>
            학생 명렬 초기화
          </button>
        </div>
      </section>
      <HelpGuide
        title="학생 관리 처음 사용 안내"
        description="명렬을 한 번 등록하면 학생별 기본정보, 사진, 학적변동과 통계를 같은 암호화 보관함에서 관리합니다."
        steps={[
          {
            title: "명렬 등록 방식 선택",
            detail: "나이스 엑셀 명렬표를 가져오거나, 학생 직접 추가로 최소 정보부터 등록합니다.",
          },
          {
            title: "나이스 명렬표 준비",
            detail: "명렬표 내용 선택에서 성별·생년월일·주소를 체크한 뒤 추가를 누르고 선택 자료 추가를 적용합니다.",
          },
          {
            title: "가져오기 전 미리보기",
            detail:
              "번호·성명·성별·생년월일·주소가 포함된 엑셀 파일을 선택하고, 인식한 학생 수와 경고를 먼저 확인합니다.",
          },
          {
            title: "상세정보 보완과 안전한 관리",
            detail:
              "학생 카드를 눌러 연락처·진로희망·사진을 필요한 범위에서만 보완하고, 전출·졸업 등은 학적변동으로 처리합니다.",
          },
        ]}
        note="학생 정보와 사진은 이 기기의 암호화 보관함에 저장됩니다. 실제 학생 정보가 든 엑셀 파일·사진을 다른 사람과 공유하거나 저장소에 올리지 마세요."
      />
      {notice && (
        <p className="app-toast" role="status">
          ✓ {notice}
        </p>
      )}
      {preview && (
        <section className="panel import-preview">
          <div className="panel-heading">
            <div>
              <h3>가져오기 전 확인</h3>
              <p>{(preview.students || []).length}명을 읽었습니다. 학년·반은 경고 확인에만 쓰고 저장하지 않습니다.</p>
            </div>
            <button className="quiet-button" onClick={() => setPreview(null)}>
              취소
            </button>
          </div>
          <p className="muted-copy">인식한 열: {(preview.headers || []).join(" · ")}</p>
          {(preview.warnings || []).length > 0 && (
            <div className="warning-box">
              {(preview.warnings || []).map((warning) => (
                <p key={warning}>⚠ {warning}</p>
              ))}
            </div>
          )}
          <div className="preview-list">
            {(preview.students || []).slice(0, 5).map((student) => (
              <span key={student.number}>
                {student.number}번 {student.name} · {displayGender(student.gender) || "성별 미입력"} ·{" "}
                {student.birthDate || "생년월일 미입력"}
              </span>
            ))}
            {(preview.students || []).length > 5 && <span>외 {(preview.students || []).length - 5}명</span>}
          </div>
          <button className="primary-button" onClick={importRoster} disabled={busy}>
            {busy ? "암호화 저장 중입니다" : "확인 후 암호화 보관함에 저장"}
          </button>
        </section>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="search-box">
            ⌕{" "}
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="번호 또는 학생 이름 검색"
            />
          </div>
          <span className="local-status">
            <i />
            {students.length}명 저장됨
          </span>
          <div className="view-toggle" aria-label="학생 명렬 보기 방식">
            <button className={rosterView === "카드" ? "active" : ""} onClick={() => setRosterView("카드")}>
              카드
            </button>
            <button className={rosterView === "목록" ? "active" : ""} onClick={() => setRosterView("목록")}>
              목록
            </button>
          </div>
        </div>
        {rosterView === "목록" ? (
          <div className="student-table">
            <div className="table-head">
              <span>번호</span>
              <span>학생</span>
              <span>성별</span>
              <span>기본정보 상태</span>
              <span />
            </div>
            {filtered.map((student) => (
              <div className="student-row-wrap" key={student.id}>
                <button className="student-row" onClick={() => openStudent(student)}>
                  <span>{String(student.number).padStart(2, "0")}</span>
                  <strong>
                    <i className="avatar">
                      {photos[student.id] ? <img src={photos[student.id]} alt="" /> : student.name[0]}
                    </i>
                    {student.name}
                    <small>{age(student.birthDate)}</small>
                    {student.transferInDate && <small className="transfer-badge">전입 {student.transferInDate}</small>}
                  </strong>
                  <span>{displayGender(student.gender) || "-"}</span>
                  <span className={state(student) === "연락처 입력 완료" ? "status good" : "status warning"}>
                    {state(student)}
                  </span>
                  <span>›</span>
                </button>
                <button type="button" className="student-delete-button" onClick={() => setDeleteTarget(student)}>
                  삭제
                </button>
                <button type="button" className="student-status-button" onClick={() => setAcademicTarget(student)}>
                  학적변동
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="empty-state">아직 저장된 학생이 없습니다. 나이스 명렬표를 가져오거나 직접 추가해 주세요.</p>
            )}
          </div>
        ) : (
          <div className="student-directory-grid">
            {filtered.map((student) => (
              <article className="student-directory-card" key={student.id}>
                <button className="student-directory-main" onClick={() => openStudent(student)}>
                  <i className="student-card-photo">
                    {photos[student.id] ? <img src={photos[student.id]} alt="" /> : student.name[0]}
                  </i>
                  <span className="student-directory-info">
                    <span className="student-directory-name-row">
                      <span className="student-card-number">{String(student.number).padStart(2, "0")}번</span>
                      <strong className="student-card-name">{student.name}</strong>
                      {student.transferInDate && (
                        <small className="transfer-badge">전입 {student.transferInDate}</small>
                      )}
                    </span>
                    <small className="student-card-meta">
                      {displayGender(student.gender) || "성별 미입력"} · {age(student.birthDate)}
                    </small>
                    <small
                      className={
                        state(student) === "연락처 입력 완료"
                          ? "student-card-status status good"
                          : "student-card-status status warning"
                      }
                    >
                      {state(student)}
                    </small>
                    {student.note && (
                      // 화면 공유·전자칠판에 비치지 않도록 내용은 상세정보에서만 보여 준다
                      <small className="student-card-note-flag">📌 특이사항 있음</small>
                    )}
                  </span>
                </button>
                <div className="student-directory-actions">
                  <button className="quiet-button" onClick={() => openStudent(student)}>
                    상세정보
                  </button>
                  <button className="quiet-button" onClick={() => setAcademicTarget(student)}>
                    학적변동
                  </button>
                </div>
              </article>
            ))}
            {filtered.length === 0 && <p className="empty-state">검색 조건에 맞는 학생이 없습니다.</p>}
          </div>
        )}
      </section>
      <ResetStudentsDialog
        open={resetOpen}
        busy={busy}
        confirmation={confirmation}
        notice={resetNotice}
        studentCount={students.length}
        changeConfirmation={setConfirmation}
        changeOpen={closeReset}
        submit={resetStudents}
      />
      <DeleteStudentDialog
        student={deleteTarget}
        busy={busy}
        confirmation={deleteConfirmation}
        notice={deleteNotice}
        changeConfirmation={setDeleteConfirmation}
        changeOpen={closeDelete}
        submit={deleteStudent}
      />
      <AcademicChangeDialog
        student={academicTarget}
        status={academicStatus}
        date={academicDate}
        confirmation={academicConfirmation}
        notice={academicNotice}
        busy={busy}
        changeStatus={setAcademicStatus}
        changeDate={setAcademicDate}
        changeConfirmation={setAcademicConfirmation}
        changeOpen={closeAcademicChange}
        submit={processAcademicChange}
      />
      {academicChanges.length > 0 && (
        <section className="panel academic-history-panel">
          <div className="panel-heading">
            <div>
              <h3>학적변동 학생</h3>
              <p>개인정보를 삭제하고 이름·종류·처리일만 보관합니다.</p>
            </div>
            <span className="local-status">
              <i />
              {academicChanges.length}명
            </span>
          </div>
          <div className="academic-history-list">
            {academicChanges.map((change) => (
              <div className="academic-history-row" key={change.id}>
                <strong>{change.name}</strong>
                <span>{change.status}</span>
                <time>{change.processedDate}</time>
                <small>상세정보 없음</small>
              </div>
            ))}
          </div>
        </section>
      )}
      {adding && (
        <StudentEditor
          student={newStudent}
          students={students}
          navigate={openStudent}
          mode="add"
          close={() => setAdding(false)}
          saved={async () => {
            await reloadStudents();
            setAdding(false);
            setNotice("학생 정보를 암호화 보관함에 추가했습니다.");
          }}
        />
      )}
    </div>
  );
}
