import { useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteStudent, GetStudentPhoto, ImportRoster, ListAcademicChanges, PreviewRoster, ProcessAcademicChange, ResetStudents, SelectRosterFile } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { StudentEditor } from "./StudentDetail";
import "./students.css";

function StudentRosterIcon() {
  return (
    <svg className="students-title-icon" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="16" r="7" />
      <path d="M6 37c1.8-7 6.1-10 12-10s10.2 3 12 10" />
      <path d="M31 15h11M31 22h11M31 29h8" />
    </svg>
  );
}
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
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<models.RosterPreview | null>(null);
  const [path, setPath] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<models.Student | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [academicChanges, setAcademicChanges] = useState<
    models.AcademicChange[]
  >([]);
  const [academicTarget, setAcademicTarget] = useState<models.Student | null>(
    null,
  );
  const [academicStatus, setAcademicStatus] = useState("전출");
  const [academicDate, setAcademicDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [academicConfirmation, setAcademicConfirmation] = useState("");
  const [academicNotice, setAcademicNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [rosterView, setRosterView] = useState<"목록" | "카드">("카드");
  const filtered = useMemo(
    () =>
      (students || []).filter(
        (student) =>
          student.name.includes(search) ||
          String(student.number).includes(search),
      ),
    [students, search],
  );
  useEffect(() => {
    let active = true;
    void Promise.all(
      (students || [])
        .filter((student) => student.hasPhoto)
        .map(
          async (student) =>
            [student.id, await GetStudentPhoto(student.id)] as const,
        ),
    )
      .then((items) => {
        if (active)
          setPhotos(Object.fromEntries(items.filter(([, photo]) => photo)));
      })
      .catch(() => {
        if (active) setPhotos({});
      });
    return () => {
      active = false;
    };
  }, [students]);
  useEffect(() => {
    void reloadAcademicChanges();
  }, []);
  async function reloadAcademicChanges() {
    try {
      setAcademicChanges((await ListAcademicChanges()) || []);
    } catch (error) {
      setNotice(String(error));
    }
  }
  const age = (birthDate: string) => {
    if (!birthDate) return "생년월일 미입력";
    const today = new Date();
    const birth = new Date(`${birthDate}T00:00:00`);
    let value = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() < birth.getDate())
    )
      value--;
    return `만 ${value}세`;
  };
  const state = (student: models.Student) =>
    student.studentPhone &&
    (student.fatherPhone || student.motherPhone || student.guardianPhone)
      ? "연락처 입력 완료"
      : "연락처 보완 필요";
  async function selectFile() {
    try {
      const selectedPath = await SelectRosterFile();
      if (!selectedPath) return;
      setBusy(true);
      const nextPreview = new models.RosterPreview(
        await PreviewRoster(selectedPath),
      );
      nextPreview.headers = nextPreview.headers || [];
      nextPreview.students = nextPreview.students || [];
      nextPreview.warnings = nextPreview.warnings || [];
      setPath(selectedPath);
      setPreview(nextPreview);
      setNotice("");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function importRoster() {
    try {
      setBusy(true);
      const result = await ImportRoster(path);
      await reloadStudents();
      setPreview(null);
      setNotice(
        `${result.added}명 추가, ${result.updated}명 갱신 · 총 ${result.total}명 암호화 저장 완료`,
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function resetStudents() {
    try {
      setBusy(true);
      setResetNotice("");
      const count = await ResetStudents(confirmation);
      await reloadStudents();
      setNotice(`${count}명의 학생 명렬과 연결 기록을 초기화했습니다.`);
      setResetOpen(false);
      setConfirmation("");
    } catch (error) {
      setResetNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  function closeReset(open: boolean) {
    if (busy) return;
    setResetOpen(open);
    if (!open) {
      setConfirmation("");
      setResetNotice("");
    }
  }
  async function deleteStudent() {
    if (!deleteTarget) return;
    try {
      setBusy(true);
      setDeleteNotice("");
      await DeleteStudent(deleteTarget.id, deleteConfirmation);
      await reloadStudents();
      setNotice(
        `${deleteTarget.number}번 ${deleteTarget.name} 학생 정보를 삭제했습니다.`,
      );
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (error) {
      setDeleteNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  function closeDelete(open: boolean) {
    if (busy) return;
    if (!open) {
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setDeleteNotice("");
    }
  }
  async function processAcademicChange() {
    if (!academicTarget) return;
    try {
      setBusy(true);
      setAcademicNotice("");
      await ProcessAcademicChange(
        academicTarget.id,
        academicStatus,
        academicDate,
        academicConfirmation,
      );
      await reloadStudents();
      await reloadAcademicChanges();
      setNotice(`${academicTarget.name} 학생의 학적변동을 처리했습니다.`);
      setAcademicTarget(null);
      setAcademicConfirmation("");
    } catch (error) {
      setAcademicNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  function closeAcademicChange(open: boolean) {
    if (busy) return;
    if (!open) {
      setAcademicTarget(null);
      setAcademicConfirmation("");
      setAcademicNotice("");
      setAcademicStatus("전출");
      setAcademicDate(new Date().toISOString().slice(0, 10));
    }
  }
  const newStudent = new models.Student({
    number:
      Math.max(0, ...(students || []).map((student) => student.number)) + 1,
    name: "",
    gender: "",
    birthDate: "",
    address: "",
    transferInDate: "",
  });
  return (
    <div className="students-page">
      <section className="page-intro">
        <div>
          <StudentRosterIcon />
          <p className="eyebrow">학생 개인정보는 암호화되어 저장됩니다</p>
          <h2>학생 명렬과 기본 정보</h2>
          <p>학생을 누르면 학생 상세정보를 확인하고 수정할 수 있습니다.</p>
        </div>
        <div className="page-actions">
          <button
            className="quiet-button danger-button"
            onClick={() => setResetOpen(true)}
            disabled={busy}
          >
            학생 명렬 초기화
          </button>
          <button
            className="quiet-button"
            onClick={() => setAdding(true)}
            disabled={busy}
          >
            ＋ 학생 직접 추가
          </button>
          <button
            className="primary-button"
            onClick={selectFile}
            disabled={busy}
          >
            ⇧ 명렬표 가져오기
          </button>
          <HelpTip>
            나이스 명렬표에서 성별·생년월일·주소를 선택해 추가한 뒤 내려받은
            엑셀 파일을 선택합니다.
          </HelpTip>
        </div>
      </section>
      <HelpGuide
        title="학생 관리 처음 사용 안내"
        description="명렬을 한 번 등록하면 학생별 기본정보, 사진, 학적변동과 통계를 같은 암호화 보관함에서 관리합니다."
        steps={[
          {
            title: "명렬 등록 방식 선택",
            detail:
              "나이스 엑셀 명렬표를 가져오거나, 학생 직접 추가로 최소 정보부터 등록합니다.",
          },
          {
            title: "나이스 명렬표 준비",
            detail:
              "명렬표 내용 선택에서 성별·생년월일·주소를 체크한 뒤 추가를 누르고 선택 자료 추가를 적용합니다.",
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
              <p>
                {(preview.students || []).length}명을 읽었습니다. 학년·반은 경고
                확인에만 쓰고 저장하지 않습니다.
              </p>
            </div>
            <button className="quiet-button" onClick={() => setPreview(null)}>
              취소
            </button>
          </div>
          <p className="muted-copy">
            인식한 열: {(preview.headers || []).join(" · ")}
          </p>
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
                {student.number}번 {student.name} ·{" "}
                {displayGender(student.gender) || "성별 미입력"} ·{" "}
                {student.birthDate || "생년월일 미입력"}
              </span>
            ))}
            {(preview.students || []).length > 5 && (
              <span>외 {(preview.students || []).length - 5}명</span>
            )}
          </div>
          <button
            className="primary-button"
            onClick={importRoster}
            disabled={busy}
          >
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
            <button
              className={rosterView === "카드" ? "active" : ""}
              onClick={() => setRosterView("카드")}
            >
              카드
            </button>
            <button
              className={rosterView === "목록" ? "active" : ""}
              onClick={() => setRosterView("목록")}
            >
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
                <button
                  className="student-row"
                  onClick={() => openStudent(student)}
                >
                  <span>{String(student.number).padStart(2, "0")}</span>
                  <strong>
                    <i className="avatar">
                      {photos[student.id] ? (
                        <img src={photos[student.id]} alt="" />
                      ) : (
                        student.name[0]
                      )}
                    </i>
                    {student.name}
                    <small>{age(student.birthDate)}</small>
                    {student.transferInDate && (
                      <small className="transfer-badge">
                        전입 {student.transferInDate}
                      </small>
                    )}
                  </strong>
                  <span>{displayGender(student.gender) || "-"}</span>
                  <span
                    className={
                      state(student) === "연락처 입력 완료"
                        ? "status good"
                        : "status warning"
                    }
                  >
                    {state(student)}
                  </span>
                  <span>›</span>
                </button>
                <button
                  type="button"
                  className="student-delete-button"
                  onClick={() => setDeleteTarget(student)}
                >
                  삭제
                </button>
                <button
                  type="button"
                  className="student-status-button"
                  onClick={() => setAcademicTarget(student)}
                >
                  학적변동
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="empty-state">
                아직 저장된 학생이 없습니다. 나이스 명렬표를 가져오거나 직접
                추가해 주세요.
              </p>
            )}
          </div>
        ) : (
          <div className="student-directory-grid">
            {filtered.map((student) => (
              <article className="student-directory-card" key={student.id}>
                <button
                  className="student-directory-main"
                  onClick={() => openStudent(student)}
                >
                  <i className="student-card-photo">
                    {photos[student.id] ? (
                      <img src={photos[student.id]} alt="" />
                    ) : (
                      student.name[0]
                    )}
                  </i>
                  <span className="student-directory-info">
                    <span className="student-directory-name-row">
                      <span className="student-card-number">
                        {String(student.number).padStart(2, "0")}번
                      </span>
                      <strong className="student-card-name">{student.name}</strong>
                      {student.transferInDate && (
                        <small className="transfer-badge">
                          전입 {student.transferInDate}
                        </small>
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
                      <div className="student-card-note" title={student.note}>
                        📌 {student.note}
                      </div>
                    )}
                  </span>
                </button>
                <div className="student-directory-actions">
                  <button
                    className="quiet-button"
                    onClick={() => openStudent(student)}
                  >
                    상세정보
                  </button>
                  <button
                    className="quiet-button"
                    onClick={() => setAcademicTarget(student)}
                  >
                    학적변동
                  </button>
                </div>
              </article>
            ))}
            {filtered.length === 0 && (
              <p className="empty-state">검색 조건에 맞는 학생이 없습니다.</p>
            )}
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

function ResetStudentsDialog({
  open,
  busy,
  confirmation,
  notice,
  studentCount,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  open: boolean;
  busy: boolean;
  confirmation: string;
  notice: string;
  studentCount: number;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학생 명렬을 초기화할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            저장된 학생 {studentCount}명의 기본정보와 사진, 상담 기록이 모두
            삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="dialog-safe-note">
            <b>유지되는 정보</b>
            <span>
              학급 기본 설정, 마스터 비밀번호, 복구 파일은 삭제하지 않습니다.
            </span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학생 명렬 초기화"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={busy || confirmation !== "학생 명렬 초기화"}
            >
              {busy ? "초기화 중입니다" : "학생 명렬 초기화"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function DeleteStudentDialog({
  student,
  busy,
  confirmation,
  notice,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  student: models.Student | null;
  busy: boolean;
  confirmation: string;
  notice: string;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={student !== null} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학생 정보를 삭제할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            {student?.number}번 {student?.name} 학생의 개인정보와 사진, 상담
            기록이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="dialog-safe-note">
            <b>삭제되는 정보</b>
            <span>주소, 연락처, 사진, 상담 기록을 포함한 학생 상세정보</span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학생 삭제"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={busy || confirmation !== "학생 삭제"}
            >
              {busy ? "삭제 중입니다" : "학생 정보 삭제"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function AcademicChangeDialog({
  student,
  status,
  date,
  confirmation,
  notice,
  busy,
  changeStatus,
  changeDate,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  student: models.Student | null;
  status: string;
  date: string;
  confirmation: string;
  notice: string;
  busy: boolean;
  changeStatus: (value: string) => void;
  changeDate: (value: string) => void;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={student !== null} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학적변동을 처리할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            {student?.number}번 {student?.name} 학생의
            상세정보·사진·연락처·주소·상담 기록을 삭제하고 최소 학적 이력만
            남깁니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="academic-dialog-fields">
            <label className="dialog-label">
              학적변동 종류
              <select
                value={status}
                onChange={(event) => changeStatus(event.target.value)}
              >
                <option value="전출">전출</option>
                <option value="유예">유예</option>
                <option value="자퇴">자퇴</option>
                <option value="면제">면제</option>
                <option value="정원외">정원외</option>
                <option value="조기졸업">조기졸업</option>
              </select>
            </label>
            <label className="dialog-label">
              학적 처리일
              <input
                type="date"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
              />
            </label>
          </div>
          <div className="dialog-safe-note">
            <b>처리 후 보존되는 정보</b>
            <span>
              학생 이름·학적변동 종류·학적 처리일만 남고, 상세보기는 제공하지
              않습니다.
            </span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학적변동 처리"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={
                busy || confirmation !== "학적변동 처리" || !status || !date
              }
            >
              {busy ? "처리 중입니다" : "학적변동 처리"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}



