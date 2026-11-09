import "../shared/dialog-parts.css";
import "./students.css";
import "./student-detail.css";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import type { StudentDetailNavigationRequest } from "../shared/featureNavigation";
import { DeleteStudentDialog } from "./StudentDialogs";
import { todayLocal } from "../shared/format";
import { StudentEditor } from "./StudentEditor";
import { useStudentCard } from "./useStudentCard";
import { StudentAttendancePanel } from "./StudentAttendancePanel";
import { StudentConsultationSummary } from "./StudentConsultationSummary";
export { formatPhone } from "./useStudentCard";

export function StudentCard({
  student,
  close,
  students,
  navigate,
  config,
  requestNavigation,
  reloadStudents,
  deleted,
  displayGender,
}: {
  student: models.Student;
  close: () => void;
  students: models.Student[];
  navigate: (student: models.Student) => void;
  config: models.ClassConfig | null;
  requestNavigation: (request: StudentDetailNavigationRequest) => void;
  reloadStudents: () => Promise<void>;
  deleted: () => Promise<void>;
  displayGender: (gender: string) => string;
}) {
  const view = useStudentCard({
    student,
    close,
    students,
    navigate,
    config,
    requestNavigation,
    reloadStudents,
    deleted,
    displayGender,
  });
  const {
    photo,
    setPhoto,
    consultations,
    setConsultations,
    attendanceRecords,
    setAttendanceRecords,
    attendanceYear,
    setAttendanceYear,
    attendanceSemester,
    setAttendanceSemester,
    attendanceMonth,
    setAttendanceMonth,
    consultationYear,
    setConsultationYear,
    consultationSemester,
    setConsultationSemester,
    consultationMonth,
    setConsultationMonth,
    editing,
    setEditing,
    notice,
    setNotice,
    copyToast,
    setCopyToast,
    deleteOpen,
    setDeleteOpen,
    deleteConfirmation,
    setDeleteConfirmation,
    deleteNotice,
    setDeleteNotice,
    busy,
    setBusy,
    reload,
    orderedStudents,
    currentIndex,
    previousStudent,
    nextStudent,
    age,
    attendanceYears,
    attendanceEntries,
    filteredAttendance,
    attendanceCounts,
    experienceUsage,
    semesterExperienceUsage,
    consultationYears,
    filteredConsultations,
    choosePhoto,
    removeStudent,
    closeDelete,
    copyValue,
    value,
  } = view;
  return (
    <>
      <section className="card-back">
        <button className="quiet-button detail-back-button" onClick={close}>
          ← 학생 명렬로 돌아가기
        </button>
      </section>
      <section className="student-hero">
        <button
          type="button"
          className="student-nav student-nav-previous"
          onClick={() => previousStudent && navigate(previousStudent)}
          disabled={!previousStudent}
          aria-label="이전 학생"
          title="이전 학생"
        >
          ‹
        </button>
        <div className="student-photo">
          {photo ? <img src={photo} alt={`${student.name} 학생 사진`} /> : <span>{student.name[0]}</span>}
        </div>
        <div>
          <p className="eyebrow">학생 상세정보 · 암호화 보관</p>
          <h2>
            {String(student.number).padStart(2, "0")}번 {student.name}
          </h2>
          <p>
            {displayGender(student.gender) || "성별 미입력"} · {age()}
          </p>
        </div>
        <div className="student-hero-actions">
          <button className="quiet-button" onClick={choosePhoto} disabled={busy}>
            ▣ 사진 파일 선택
          </button>
          <HelpTip>학생별 사진 파일을 선택하면 이 컴퓨터의 암호화 보관함에 저장됩니다.</HelpTip>
          <button className="primary-button" onClick={() => setEditing(true)}>
            기본정보 수정
          </button>
          <button className="quiet-button danger-button" onClick={() => setDeleteOpen(true)} disabled={busy}>
            학생 정보 삭제
          </button>
        </div>
        <button
          type="button"
          className="student-nav student-nav-next"
          onClick={() => nextStudent && navigate(nextStudent)}
          disabled={!nextStudent}
          aria-label="다음 학생"
          title="다음 학생"
        >
          ›
        </button>
      </section>
      {notice && <p className="save-notice">{notice}</p>}
      {copyToast && (
        <aside className={copyToast.failed ? "copy-toast failed" : "copy-toast"} role="status">
          <span>{copyToast.failed ? "!" : "✓"}</span>
          <div>
            <strong>{copyToast.failed ? "복사 실패" : "복사 완료"}</strong>
            <small>{copyToast.text}</small>
          </div>
          <button type="button" onClick={() => setCopyToast(null)} aria-label="복사 안내 닫기">
            ×
          </button>
        </aside>
      )}
      <DeleteStudentDialog
        student={deleteOpen ? student : null}
        busy={busy}
        confirmation={deleteConfirmation}
        notice={deleteNotice}
        changeConfirmation={setDeleteConfirmation}
        changeOpen={closeDelete}
        submit={removeStudent}
      />
      <HelpGuide
        title="학생 상세정보 활용"
        description="학생별 기본정보, 연락처, 사진, 상담 기록과 출결 누계를 한 화면에서 확인합니다."
        steps={[
          {
            title: "사진과 기본정보 보완",
            detail: "사진 파일 선택과 기본정보 수정을 이용해 연락처·주소를 보완합니다.",
          },
          {
            title: "초록색 복사 표식 사용",
            detail: "생년월일·주소·연락처는 값을 클릭하면 복사되며, 복사 완료 안내가 표시됩니다.",
          },
          {
            title: "상담 내용 확인",
            detail: "상담 기록 요약과 최근 기록을 확인하고, 상담 기록 열기에서 새 기록과 후속 조치를 관리합니다.",
          },
          {
            title: "출결 기록 확인",
            detail: "출결 항목을 누르면 해당 날짜의 출결 입력 화면으로 바로 이동합니다.",
          },
        ]}
        note="좌우 화살표로 번호순 다음 학생으로 이동할 수 있습니다."
      />
      <section className="student-card-grid">
        <article className="panel">
          <div className="panel-heading">
            <h3>기본 인적 사항</h3>
          </div>
          <div className="value-grid">
            {value("번호", String(student.number))}
            {value("성명", student.name)}
            {value("성별", displayGender(student.gender))}
            {value("생년월일", student.birthDate, true)}
            {value("주소", student.address, true)}
          </div>
        </article>
        <article className="panel">
          <div className="panel-heading">
            <h3>연락처 · 보호자</h3>
          </div>
          <div className="value-grid">
            {value("학생 휴대전화", student.studentPhone, true)}
            {value("부 성명", student.fatherName, true)}
            {value("부 휴대전화", student.fatherPhone, true)}
            {value("모 성명", student.motherName, true)}
            {value("모 휴대전화", student.motherPhone, true)}
            {value("기타 보호자 성명", student.guardianName, true)}
            {value("보호자 관계", student.guardianRelationship)}
            {value("보호자 휴대전화", student.guardianPhone, true)}
            {value("결석신고서 보호자", student.documentGuardian || "자동 선택 (모 → 부 → 기타 보호자)")}
          </div>
        </article>
      </section>
      <StudentConsultationSummary
        view={{
          ...view,
          student,
          close,
          students,
          navigate,
          config,
          requestNavigation,
          reloadStudents,
          deleted,
          displayGender,
        }}
      />
      <section className="student-card-grid">
        <article className="panel career-hope-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 기록</p>
              <h3>진로희망</h3>
            </div>
            <button className="text-button" onClick={() => setEditing(true)}>
              수정 →
            </button>
          </div>
          <p>{student.careerHope || "아직 입력한 진로희망이 없습니다. 기본정보 수정에서 기록해 주세요."}</p>
        </article>
        <article className="panel career-hope-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 기록</p>
              <h3>특이사항 · 지도 유의사항</h3>
            </div>
            <button className="text-button" onClick={() => setEditing(true)}>
              수정 →
            </button>
          </div>
          <p>
            {student.note || "등록된 특이사항이 없습니다. 알레르기, 건강, 교우관계, 지도 유의사항 등을 기록해 주세요."}
          </p>
        </article>
      </section>
      <StudentAttendancePanel
        view={{
          ...view,
          student,
          close,
          students,
          navigate,
          config,
          requestNavigation,
          reloadStudents,
          deleted,
          displayGender,
        }}
      />
      {editing && (
        <StudentEditor
          student={student}
          students={students}
          navigate={navigate}
          close={() => setEditing(false)}
          saved={async () => {
            await reloadStudents();
            setEditing(false);
          }}
        />
      )}
    </>
  );
}
