import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AddStudent,
  DeleteStudent,
  GetStudentPhoto,
  ListConsultations,
  ListStudentAttendance,
  SaveStudent,
  SaveStudentPhoto,
  SelectStudentPhoto,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import type { StudentDetailNavigationRequest } from "../shared/featureNavigation";
import { DeleteStudentDialog } from "./StudentsPage";
import "./students.css";
import "./student-detail.css";

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
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
  const [photo, setPhoto] = useState("");
  const [consultations, setConsultations] = useState<models.Consultation[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    models.AttendanceDay[]
  >([]);
  const [attendanceYear, setAttendanceYear] = useState("");
  const [attendanceSemester, setAttendanceSemester] = useState("전체");
  const [attendanceMonth, setAttendanceMonth] = useState("전체");
  const [consultationYear, setConsultationYear] = useState("");
  const [consultationSemester, setConsultationSemester] = useState("전체");
  const [consultationMonth, setConsultationMonth] = useState("전체");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyToast, setCopyToast] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function reload() {
    try {
      setPhoto(await GetStudentPhoto(student.id));
      setConsultations((await ListConsultations(student.id)) || []);
      setAttendanceRecords((await ListStudentAttendance(student.id)) || []);
    } catch (error) {
      setNotice(String(error));
    }
  }
  useEffect(() => {
    void reload();
  }, [student.id]);
  useEffect(() => {
    setAttendanceYear(config?.schoolYear ? String(config.schoolYear) : "");
    setAttendanceSemester("전체");
    setAttendanceMonth("전체");
  }, [student.id, config?.schoolYear]);
  useEffect(() => {
    setConsultationYear(config?.schoolYear ? String(config.schoolYear) : "");
    setConsultationSemester("전체");
    setConsultationMonth("전체");
  }, [student.id, config?.schoolYear]);
  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyToast]);
  const orderedStudents = [...students].sort(
    (left, right) => left.number - right.number,
  );
  const currentIndex = orderedStudents.findIndex(
    (item) => item.id === student.id,
  );
  const previousStudent =
    currentIndex > 0 ? orderedStudents[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < orderedStudents.length - 1
      ? orderedStudents[currentIndex + 1]
      : null;
  const age = () => {
    if (!student.birthDate) return "생년월일 미입력";
    const today = new Date();
    const birth = new Date(`${student.birthDate}T00:00:00`);
    let value = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() &&
        today.getDate() < birth.getDate())
    )
      value--;
    return `만 ${value}세`;
  };
  const attendanceYears = useMemo(
    () =>
      Array.from(
        new Set(attendanceRecords.map((item) => item.date.slice(0, 4))),
      )
        .sort()
        .reverse(),
    [attendanceRecords],
  );
  const attendanceEntries = useMemo(
    () =>
      attendanceRecords
        .map((item) => ({ day: item, entry: item.entries?.[0] }))
        .filter(
          (
            item,
          ): item is {
            day: models.AttendanceDay;
            entry: models.AttendanceEntry;
          } => Boolean(item.entry),
        ),
    [attendanceRecords],
  );
  const filteredAttendance = useMemo(
    () =>
      attendanceEntries.filter(({ day }) => {
        if (attendanceYear && day.date.slice(0, 4) !== attendanceYear)
          return false;
        if (
          attendanceMonth !== "전체" &&
          day.date.slice(5, 7) !== attendanceMonth
        )
          return false;
        if (attendanceSemester === "전체" || !config) return true;
        const start =
          attendanceSemester === "1학기"
            ? config.semester1StartDate
            : config.semester2StartDate;
        const end =
          attendanceSemester === "1학기"
            ? config.semester1EndDate
            : config.semester2EndDate;
        return !start || !end || (day.date >= start && day.date <= end);
      }),
    [
      attendanceEntries,
      attendanceYear,
      attendanceMonth,
      attendanceSemester,
      config,
    ],
  );
  const attendanceCounts = useMemo(
    () =>
      filteredAttendance.reduce(
        (counts, { entry }) => {
          counts[entry.status] = (counts[entry.status] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>,
      ),
    [filteredAttendance],
  );
  const experienceUsage = useMemo(
    () =>
      attendanceEntries.filter(
        ({ day, entry }) =>
          entry.status === "교외체험학습" &&
          (!config?.schoolYear || day.date.startsWith(`${config.schoolYear}-`)),
      ).length,
    [attendanceEntries, config?.schoolYear],
  );
  const semesterExperienceUsage = (semester: "1" | "2") =>
    attendanceEntries.filter(({ day, entry }) => {
      const start =
        semester === "1"
          ? config?.semester1StartDate
          : config?.semester2StartDate;
      const end =
        semester === "1" ? config?.semester1EndDate : config?.semester2EndDate;
      return (
        entry.status === "교외체험학습" &&
        Boolean(start && end && day.date >= start && day.date <= end)
      );
    }).length;
  const consultationYears = useMemo(
    () =>
      Array.from(new Set(consultations.map((item) => item.date.slice(0, 4))))
        .sort()
        .reverse(),
    [consultations],
  );
  const filteredConsultations = useMemo(
    () =>
      consultations.filter((item) => {
        if (consultationYear && item.date.slice(0, 4) !== consultationYear)
          return false;
        if (
          consultationMonth !== "전체" &&
          item.date.slice(5, 7) !== consultationMonth
        )
          return false;
        if (consultationSemester === "전체" || !config) return true;
        const start =
          consultationSemester === "1학기"
            ? config.semester1StartDate
            : config.semester2StartDate;
        const end =
          consultationSemester === "1학기"
            ? config.semester1EndDate
            : config.semester2EndDate;
        return !start || !end || (item.date >= start && item.date <= end);
      }),
    [
      consultations,
      consultationYear,
      consultationMonth,
      consultationSemester,
      config,
    ],
  );
  async function choosePhoto() {
    try {
      const path = await SelectStudentPhoto();
      if (!path) return;
      setBusy(true);
      await SaveStudentPhoto(student.id, path);
      await reloadStudents();
      await reload();
      setNotice("학생 사진을 암호화해 저장했습니다.");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function removeStudent() {
    try {
      setBusy(true);
      setDeleteNotice("");
      await DeleteStudent(student.id, deleteConfirmation);
      await deleted();
    } catch (error) {
      setDeleteNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  function closeDelete(open: boolean) {
    if (busy) return;
    setDeleteOpen(open);
    if (!open) {
      setDeleteConfirmation("");
      setDeleteNotice("");
    }
  }
  async function copyValue(label: string, text: string) {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        if (!document.execCommand("copy")) throw new Error("복사 실패");
        document.body.removeChild(area);
      }
      setCopyToast({ text: `${label}을(를) 복사했습니다.`, failed: false });
    } catch {
      setCopyToast({ text: `${label} 복사에 실패했습니다.`, failed: true });
    }
  }
  const value = (label: string, text: string, copyable = false) => (
    <button
      type="button"
      className={copyable && text ? "card-value copyable" : "card-value"}
      onClick={() => copyable && text && void copyValue(label, text)}
      disabled={!copyable || !text}
      title={copyable && text ? `${label} 클릭하여 복사` : undefined}
    >
      <span className="card-value-label">
        <small>{label}</small>
        {copyable && text && <span className="copy-badge">⧉ 복사</span>}
      </span>
      <strong>{text || "미입력"}</strong>
    </button>
  );
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
          {photo ? (
            <img src={photo} alt={`${student.name} 학생 사진`} />
          ) : (
            <span>{student.name[0]}</span>
          )}
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
          <button
            className="quiet-button"
            onClick={choosePhoto}
            disabled={busy}
          >
            ▣ 사진 파일 선택
          </button>
          <HelpTip>
            학생별 사진 파일을 선택하면 이 컴퓨터의 암호화 보관함에 저장됩니다.
          </HelpTip>
          <button className="primary-button" onClick={() => setEditing(true)}>
            기본정보 수정
          </button>
          <button
            className="quiet-button danger-button"
            onClick={() => setDeleteOpen(true)}
            disabled={busy}
          >
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
        <aside
          className={copyToast.failed ? "copy-toast failed" : "copy-toast"}
          role="status"
        >
          <span>{copyToast.failed ? "!" : "✓"}</span>
          <div>
            <strong>{copyToast.failed ? "복사 실패" : "복사 완료"}</strong>
            <small>{copyToast.text}</small>
          </div>
          <button
            type="button"
            onClick={() => setCopyToast(null)}
            aria-label="복사 안내 닫기"
          >
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
            detail:
              "사진 파일 선택과 기본정보 수정을 이용해 연락처·주소를 보완합니다.",
          },
          {
            title: "초록색 복사 표식 사용",
            detail:
              "생년월일·주소·연락처는 값을 클릭하면 복사되며, 복사 완료 안내가 표시됩니다.",
          },
          {
            title: "상담 내용 확인",
            detail:
              "상담 기록 요약과 최근 기록을 확인하고, 상담 기록 열기에서 새 기록과 후속 조치를 관리합니다.",
          },
          {
            title: "출결 기록 확인",
            detail:
              "출결 항목을 누르면 해당 날짜의 출결 입력 화면으로 바로 이동합니다.",
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
      <section className="student-card-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 누적</p>
              <h3>상담 기록</h3>
            </div>
            <span>{filteredConsultations.length}건</span>
          </div>
          <div className="attendance-filters consultation-summary-filters">
            <select
              value={consultationYear}
              onChange={(event) => setConsultationYear(event.target.value)}
            >
              <option value="">전체 학년도</option>
              {consultationYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
            <select
              value={consultationSemester}
              onChange={(event) => setConsultationSemester(event.target.value)}
            >
              <option>전체</option>
              <option>1학기</option>
              <option>2학기</option>
            </select>
            <select
              value={consultationMonth}
              onChange={(event) => setConsultationMonth(event.target.value)}
            >
              <option>전체</option>
              {Array.from({ length: 12 }, (_, index) =>
                String(index + 1).padStart(2, "0"),
              ).map((month) => (
                <option key={month} value={month}>
                  {Number(month)}월
                </option>
              ))}
            </select>
          </div>
          <div className="student-consultation-recent">
            {filteredConsultations.length === 0 ? (
              <p className="empty-state">선택한 기간의 상담 기록이 없습니다.</p>
            ) : (
              filteredConsultations.slice(0, 3).map((item) => (
                <article key={item.id}>
                  <time>{item.date}</time>
                  <b>
                    {item.parentId ? "↳ " : ""}
                    {item.type}
                  </b>
                  <p>{item.content}</p>
                </article>
              ))
            )}
          </div>
        </article>
        <article className="panel consultation-summary-card">
          <p className="eyebrow">상담 현황</p>
          <h3>상담 기록 요약</h3>
          <div className="consultation-summary-values">
            <span>
              전체 기록 <b>{consultations.length}건</b>
            </span>
            <span>
              상담 흐름{" "}
              <b>{consultations.filter((item) => !item.parentId).length}건</b>
            </span>
            <span>
              확인 필요{" "}
              <b>
                {
                  consultations.filter(
                    (item) => item.followUpDate && !item.followUpDone,
                  ).length
                }
                건
              </b>
            </span>
          </div>
          <p>상담 작성과 후속 기록은 상담 기록 메뉴에서 관리합니다.</p>
          <button
            className="primary-button"
            onClick={() =>
              requestNavigation({ destination: "상담 기록", studentID: student.id })
            }
          >
            상담 기록 열기 →
          </button>
        </article>
      </section>
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
          <p>
            {student.careerHope ||
              "아직 입력한 진로희망이 없습니다. 기본정보 수정에서 기록해 주세요."}
          </p>
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
            {student.note ||
              "등록된 특이사항이 없습니다. 알레르기, 건강, 교우관계, 지도 유의사항 등을 기록해 주세요."}
          </p>
        </article>
      </section>
      <section className="student-card-grid future-links">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 누적</p>
              <h3>출결</h3>
            </div>
            <button
              className="text-button"
              onClick={() =>
                requestNavigation({
                  destination: "출결 관리",
                  date: new Date().toISOString().slice(0, 10),
                })
              }
            >
              출결 관리 →
            </button>
          </div>
          <div className="attendance-filters">
            <select
              value={attendanceYear}
              onChange={(event) => setAttendanceYear(event.target.value)}
            >
              <option value="">전체 학년도</option>
              {attendanceYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
            <select
              value={attendanceSemester}
              onChange={(event) => setAttendanceSemester(event.target.value)}
            >
              <option>전체</option>
              <option>1학기</option>
              <option>2학기</option>
            </select>
            <select
              value={attendanceMonth}
              onChange={(event) => setAttendanceMonth(event.target.value)}
            >
              <option>전체</option>
              {Array.from({ length: 12 }, (_, index) =>
                String(index + 1).padStart(2, "0"),
              ).map((month) => (
                <option key={month} value={month}>
                  {Number(month)}월
                </option>
              ))}
            </select>
          </div>
          <div className="student-attendance-summary">
            <span>
              결석 <b>{attendanceCounts.결석 || 0}일</b>
            </span>
            <span>
              지각 <b>{attendanceCounts.지각 || 0}회</b>
            </span>
            <span>
              조퇴 <b>{attendanceCounts.조퇴 || 0}회</b>
            </span>
            <span>
              결과 <b>{attendanceCounts.결과 || 0}회</b>
            </span>
            <span>
              교외체험 <b>{attendanceCounts.교외체험학습 || 0}일</b>
            </span>
          </div>
          {config?.experienceLearningUnit === "학기" ? (
            <div className="experience-usage">
              <span>
                1학기{" "}
                <b>
                  {semesterExperienceUsage("1")} /{" "}
                  {config.semester1ExperienceLimit || 0}일
                </b>
              </span>
              <span>
                2학기{" "}
                <b>
                  {semesterExperienceUsage("2")} /{" "}
                  {config.semester2ExperienceLimit || 0}일
                </b>
              </span>
            </div>
          ) : (
            <div className="experience-usage">
              <span>
                교외체험학습{" "}
                <b>
                  {experienceUsage} / {config?.experienceLearningYearLimit || 0}
                  일
                </b>
                <small>
                  {" "}
                  · 잔여{" "}
                  {Math.max(
                    0,
                    (config?.experienceLearningYearLimit || 0) -
                      experienceUsage,
                  )}
                  일
                </small>
              </span>
            </div>
          )}
          <div className="student-attendance-list">
            {filteredAttendance.length === 0 ? (
              <p className="empty-state">
                선택한 기간의 비출석 기록이 없습니다.
              </p>
            ) : (
              filteredAttendance.map(({ day, entry }) => (
                <button
                  className={`student-attendance-record ${entry.status}`}
                  key={`${day.date}-${entry.studentId}`}
                  onClick={() =>
                    requestNavigation({ destination: "출결 관리", date: day.date })
                  }
                >
                  <time>
                    {entry.startDate || day.date}
                    {entry.endDate ? ` ~ ${entry.endDate}` : ""}
                  </time>
                  <strong>{entry.status}</strong>
                  <span>
                    {entry.status === "교외체험학습"
                      ? "학교장허가 교외체험학습"
                      : `${entry.reasonCategory || "사유 미입력"}${entry.reason ? ` · ${entry.reason}` : ""}`}
                  </span>
                  <small>
                    {entry.status === "결석"
                      ? `${entry.schoolDays || 1}일간`
                      : entry.status === "교외체험학습"
                        ? "1일 사용"
                        : entry.period || "교시 미입력"}
                  </small>
                </button>
              ))
            )}
          </div>
        </article>
        <article className="panel">
          <h3>수행평가 · 학교생활기록</h3>
          <p>평가와 창체·행동특성 기록을 학생별로 연결할 예정입니다.</p>
        </article>
      </section>
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

export function StudentEditor({
  student,
  students,
  navigate,
  mode = "edit",
  close,
  saved,
}: {
  student: models.Student;
  students: models.Student[];
  navigate: (student: models.Student) => void;
  mode?: "add" | "edit";
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(new models.Student(student));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const orderedStudents = [...students].sort(
    (left, right) => left.number - right.number,
  );
  const currentIndex = orderedStudents.findIndex(
    (item) => item.id === student.id,
  );
  const previousStudent =
    currentIndex > 0 ? orderedStudents[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < orderedStudents.length - 1
      ? orderedStudents[currentIndex + 1]
      : null;
  function moveTo(nextStudent: models.Student | null) {
    if (!nextStudent) return;
    if (mode === "edit" && JSON.stringify(draft) !== JSON.stringify(student)) {
      setNotice("수정 중인 내용을 먼저 저장하거나 취소해 주세요.");
      return;
    }
    navigate(nextStudent);
  }
  const phoneFields: (keyof models.Student)[] = [
    "studentPhone",
    "fatherPhone",
    "motherPhone",
    "guardianPhone",
  ];
  const input = (label: string, key: keyof models.Student, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(draft[key] || "")}
        onChange={(event) =>
          setDraft(
            new models.Student({
              ...draft,
              [key]: phoneFields.includes(key)
                ? formatPhone(event.target.value)
                : event.target.value,
            }),
          )
        }
      />
    </label>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setBusy(true);
      if (mode === "add") await AddStudent(draft);
      else await SaveStudent(draft);
      await saved();
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-layer">
      <button
        type="button"
        className="editor-nav editor-nav-previous"
        onClick={() => moveTo(previousStudent)}
        disabled={!previousStudent || busy}
        aria-label="이전 학생"
        title="이전 학생"
      >
        ‹
      </button>
      <form className="student-editor" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">암호화 학생 정보</p>
            <h3>
              {mode === "add"
                ? "학생 직접 추가"
                : `${draft.number}번 ${draft.name}`}
            </h3>
          </div>
          <button type="button" className="quiet-button" onClick={close}>
            닫기
          </button>
        </div>
        <div className="form-grid">
          {input("번호", "number", "number")}
          {input("성명", "name")}
          {input("성별", "gender")}
          {input("생년월일", "birthDate", "date")}
          {input("주소", "address")}
          {input("전입일", "transferInDate", "date")}
          {input("학생 휴대전화", "studentPhone")}
          {input("부 성명", "fatherName")}
          {input("부 휴대전화", "fatherPhone")}
          {input("모 성명", "motherName")}
          {input("모 휴대전화", "motherPhone")}
          {input("기타 보호자 성명", "guardianName")}
          {input("보호자 관계", "guardianRelationship")}
          {input("보호자 휴대전화", "guardianPhone")}
          <label>
            결석신고서 보호자 성명
            <select
              value={draft.documentGuardian || ""}
              onChange={(event) => setDraft(new models.Student({ ...draft, documentGuardian: event.target.value }))}
            >
              <option value="">자동 선택 (모 → 부 → 기타 보호자)</option>
              <option value="모">모 성명</option>
              <option value="부">부 성명</option>
              <option value="기타 보호자">기타 보호자 성명</option>
            </select>
          </label>
          {input("진로희망", "careerHope")}
          <label style={{ gridColumn: "1 / -1" }}>
            특이사항 · 지도 유의사항
            <textarea
              value={draft.note || ""}
              onChange={(event) =>
                setDraft(new models.Student({ ...draft, note: event.target.value }))
              }
              placeholder="알레르기, 건강 상태, 교우관계, 지도 유의사항 등 특이사항을 기록해 주세요."
              rows={3}
              style={{
                display: "block",
                boxSizing: "border-box",
                width: "100%",
                marginTop: "7px",
                padding: "11px 12px",
                border: "1px solid #dce3ea",
                borderRadius: "8px",
                background: "#fff",
                color: "#364656",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        </div>
        {notice && <p className="form-notice">{notice}</p>}
        <div className="editor-actions">
          <button type="button" className="quiet-button" onClick={close}>
            취소
          </button>
          <button className="primary-button" disabled={busy}>
            {busy
              ? "저장 중입니다"
              : mode === "add"
                ? "학생 추가"
                : "암호화 저장"}
          </button>
        </div>
      </form>
      <button
        type="button"
        className="editor-nav editor-nav-next"
        onClick={() => moveTo(nextStudent)}
        disabled={!nextStudent || busy}
        aria-label="다음 학생"
        title="다음 학생"
      >
        ›
      </button>
    </div>
  );
}


