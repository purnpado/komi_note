import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { useEffect, useMemo, useState } from "react";
import {
  GetAttendance,
  ListAllConsultations,
  ListAssessments,
  ListCourseRosters,
  ListSubmissionDocuments,
  ListSurveys,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { PageKey } from "../navigation/menuTypes";
import { toLocalDateString, todayLocal } from "../shared/format";
import { Attention, Quick } from "./DashboardWidgets";
import { DashboardTimetable } from "../timetable/DashboardTimetable";
import { MemoWidgets } from "../memo/MemoWidgets";
import { ScheduleWidget } from "../schedule/ScheduleWidget";
import { BudgetWidget } from "../budget/BudgetWidget";
import { ClassOpsWidget } from "./ClassOpsWidget";
import "./dashboard.css";

type StatProps = { icon: string; title: string; value: string; note: string; color: string; onClick?: () => void };

function Stat({ icon, title, value, note, color, onClick }: StatProps) {
  const body = (
    <>
      <span className={`stat-icon ${color}`}>{icon}</span>
      <div>
        <p>{title}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </>
  );
  return onClick ? (
    <button type="button" className="stat stat-button" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="stat">{body}</div>
  );
}

const WEEKDAYS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function greeting(hour: number) {
  if (hour < 11) return "좋은 아침입니다";
  if (hour < 17) return "좋은 오후입니다";
  return "오늘도 수고 많으셨습니다";
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

type AttentionItem = { student: models.Student; text: string; tag: string; action: () => void };
type TodoItem = { title: string; note: string; tag: string; action: () => void };

// 대시보드는 보관함의 실제 자료(학생·출결·상담·제출서류·평가·설문)만으로 오늘 확인할 일을 보여 준다.
export function DashboardPage({
  config,
  students,
  isHomeroomTeacher,
  navigate,
  openStudent,
  openConsultation,
}: {
  config: models.ClassConfig | null;
  students: models.Student[];
  isHomeroomTeacher: boolean;
  navigate: (page: PageKey) => void;
  openStudent: (student: models.Student) => void;
  openConsultation: (studentID: string) => void;
}) {
  const today = todayLocal();
  const now = new Date();
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const [attendance, setAttendance] = useState<models.AttendanceDay | null>(null);
  const [consultations, setConsultations] = useState<models.Consultation[]>([]);
  const [documents, setDocuments] = useState<models.SubmissionDocument[]>([]);
  const [assessmentCount, setAssessmentCount] = useState(0);
  const [courseCount, setCourseCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  // 다른 화면에서 출결·상담·제출서류·학생이 바뀌었다는 알림이 오면 다시 읽는다.
  const [version, setVersion] = useState(0);
  useVaultChanges([changeEvents.attendance, changeEvents.consultation, changeEvents.submissions, changeEvents.students, changeEvents.survey, changeEvents.courseRoster], () => setVersion((v) => v + 1));

  useEffect(() => {
    let active = true;
    const safe = <T,>(promise: Promise<T>, apply: (value: T) => void) =>
      promise.then((value) => active && apply(value)).catch(() => undefined);
    if (isHomeroomTeacher) {
      if (!weekend) void safe(GetAttendance(today), (day) => setAttendance(new models.AttendanceDay(day)));
      void safe(ListAllConsultations(), (items) => setConsultations((items || []).map((item) => new models.Consultation(item))));
      void safe(ListSubmissionDocuments(), (items) => setDocuments((items || []).map((item) => new models.SubmissionDocument(item))));
    }
    void safe(ListAssessments(), (items) => setAssessmentCount((items || []).length));
    void safe(ListCourseRosters(), (items) => setCourseCount((items || []).length));
    void safe(ListSurveys(), (items) => setSurveyCount((items || []).length));
    return () => {
      active = false;
    };
  }, [isHomeroomTeacher, today, weekend, version]);

  const studentByID = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const males = students.filter((student) => ["남", "남자", "남성"].includes(student.gender)).length;
  const females = students.filter((student) => ["여", "여자", "여성"].includes(student.gender)).length;

  const attendanceSummary = useMemo(() => {
    if (weekend) return { value: "주말", note: "평일에 출결을 입력합니다" };
    if (!attendance || !attendance.savedAt) return { value: "저장 전", note: "오늘 출결을 아직 저장하지 않았습니다" };
    const entries = attendance.entries || [];
    const count = (word: string) => entries.filter((entry) => (entry.status || "").includes(word)).length;
    const present = entries.filter((entry) => !entry.status || entry.status === "출석").length;
    return { value: `${present} / ${entries.length}`, note: `결석 ${count("결석")} · 지각 ${count("지각")} · 조퇴 ${count("조퇴")}` };
  }, [attendance, weekend]);

  // 상담 후속 조치: 완료하지 않았고 예정일이 오늘부터 7일 안이거나 이미 지난 기록
  const followUps = useMemo(
    () =>
      consultations
        .filter((item) => item.followUpDate && !item.followUpDone && item.followUpDate <= addDays(today, 7))
        .sort((left, right) => left.followUpDate.localeCompare(right.followUpDate)),
    [consultations, today],
  );

  // 제출서류: 마감이 지나지 않았거나 7일 안에 지난 서류 중 미제출 학생이 있는 것
  const openDocuments = useMemo(
    () =>
      documents
        .map((document) => {
          const submitted = new Set((document.statuses || []).filter((status) => status.status === "제출").map((status) => status.studentId));
          const missing = students.filter((student) => !submitted.has(student.id)).length;
          return { document, missing };
        })
        .filter(({ document, missing }) => missing > 0 && (!document.dueDate || document.dueDate >= addDays(today, -7)))
        .sort((left, right) => (left.document.dueDate || "9999").localeCompare(right.document.dueDate || "9999")),
    [documents, students, today],
  );

  const attention: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    for (const item of followUps) {
      const student = studentByID.get(item.studentId);
      if (!student) continue;
      const overdue = item.followUpDate < today;
      items.push({
        student,
        text: overdue ? `상담 후속 조치 예정일(${shortDate(item.followUpDate)})이 지났습니다` : `상담 후속 조치 예정일 ${shortDate(item.followUpDate)}`,
        tag: overdue ? "상담 지남" : "상담",
        action: () => openConsultation(student.id),
      });
    }
    for (const student of students) {
      if (items.length >= 6) break;
      const guardianPhone = student.fatherPhone || student.motherPhone || student.guardianPhone;
      if (!guardianPhone) items.push({ student, text: "보호자 연락처가 비어 있습니다", tag: "정보 확인", action: () => openStudent(student) });
      else if (!student.birthDate) items.push({ student, text: "생년월일이 비어 있습니다(학생 통계 만 나이 계산에 쓰임)", tag: "정보 확인", action: () => openStudent(student) });
    }
    return items.slice(0, 6);
  }, [followUps, students, studentByID, today, openConsultation, openStudent]);

  const todos: TodoItem[] = [];
  if (isHomeroomTeacher && !weekend && (!attendance || !attendance.savedAt)) {
    todos.push({ title: "오늘 출결 입력", note: "아직 저장하지 않았습니다", tag: "출결", action: () => navigate("출결 관리") });
  }
  for (const { document, missing } of openDocuments.slice(0, 4)) {
    const overdue = document.dueDate && document.dueDate < today;
    todos.push({
      title: document.title,
      note: `${document.dueDate ? `${overdue ? "마감 지남" : "마감"} ${shortDate(document.dueDate)} · ` : ""}미제출 ${missing}명`,
      tag: "제출서류",
      action: () => navigate("제출서류 관리"),
    });
  }

  const classLabel = isHomeroomTeacher
    ? config?.grade && config?.classNumber
      ? `${config.grade}학년 ${config.classNumber}반`
      : "우리 반"
    : config?.teachingSubject || "담당 수업";

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">{greeting(now.getHours())}</p>
          <h2>
            {classLabel}의 하루를
            <br />
            <em>차분하게</em> 시작해 볼까요?
          </h2>
          <p>보관함에 저장된 자료로 오늘 확인할 일을 모았습니다.</p>
        </div>
        <div className="hero-date">
          <strong>{now.getDate()}</strong>
          <span>{WEEKDAYS[now.getDay()]}</span>
          <small>
            {now.getMonth() + 1}월 {now.getDate()}일
          </small>
        </div>
      </section>
      <section className="summary-grid">
        {isHomeroomTeacher ? (
          <>
            <Stat icon="♙" title="우리 반 학생" value={`${students.length}명`} note={students.length ? `남 ${males}명 · 여 ${females}명` : "명렬표를 가져와 주세요"} color="mint" onClick={() => navigate("학생 명렬")} />
            <Stat icon="✓" title="오늘 출결" value={attendanceSummary.value} note={attendanceSummary.note} color="blue" onClick={() => navigate("출결 관리")} />
            <Stat icon="◌" title="상담 후속 조치" value={`${followUps.length}건`} note="7일 안 또는 지난 예정" color="yellow" onClick={() => navigate("상담 기록")} />
            <Stat icon="▤" title="제출서류" value={`${openDocuments.length}건`} note="미제출 학생이 있는 서류" color="purple" onClick={() => navigate("제출서류 관리")} />
          </>
        ) : (
          <>
            <Stat icon="♙" title="수업 명렬" value={`${courseCount}개`} note="평가 관리에서 만든 수업" color="mint" onClick={() => navigate("수업 명렬")} />
            <Stat icon="▤" title="수행평가" value={`${assessmentCount}개`} note="저장된 평가" color="blue" onClick={() => navigate("평가 관리")} />
            <Stat icon="▥" title="설문" value={`${surveyCount}개`} note="저장된 설문" color="yellow" onClick={() => navigate("설문 조사")} />
          </>
        )}
      </section>
      <DashboardTimetable today={today} isHomeroomTeacher={isHomeroomTeacher} navigate={navigate} />
      <ScheduleWidget today={today} onOpen={() => navigate("일정")} />
      <MemoWidgets today={today} onOpen={() => navigate("메모 · 할 일")} />
      <BudgetWidget onOpen={() => navigate("예산 관리")} />
      {isHomeroomTeacher && (
        <ClassOpsWidget
          students={students}
          onOpenSeating={() => navigate("자리배정")}
          onOpenCleaning={() => navigate("청소배정")}
        />
      )}
      {isHomeroomTeacher && (
        <section className="two-column">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">오늘 할 일</p>
                <h3>{weekend ? "다가오는 할 일" : `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAYS[now.getDay()]}`}</h3>
              </div>
            </div>
            {todos.length ? (
              <div className="attention">
                {todos.map((todo, index) => (
                  <button type="button" className="attention-row attention-button" key={`${todo.title}-${index}`} onClick={todo.action}>
                    <i className="avatar" aria-hidden="true">{todo.tag[0]}</i>
                    <div>
                      <b>{todo.title}</b>
                      <small>{todo.note}</small>
                    </div>
                    <span>{todo.tag}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="dashboard-empty">오늘 바로 처리할 일이 없습니다.</p>
            )}
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">놓치지 마세요</p>
                <h3>확인이 필요한 학생</h3>
              </div>
              <button type="button" className="text-button" onClick={() => navigate("학생 명렬")}>
                학생 명렬 →
              </button>
            </div>
            {attention.length ? (
              <div className="attention">
                {attention.map((item, index) => (
                  <Attention
                    key={`${item.student.id}-${index}`}
                    name={item.student.name}
                    num={String(item.student.number).padStart(2, "0")}
                    text={item.text}
                    tag={item.tag}
                    onClick={item.action}
                  />
                ))}
              </div>
            ) : (
              <p className="dashboard-empty">{students.length ? "지금 확인할 학생이 없습니다." : "학생 명렬을 먼저 가져와 주세요."}</p>
            )}
          </div>
        </section>
      )}
      <section className="panel quick-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">바로 시작</p>
            <h3>자주 쓰는 업무</h3>
          </div>
        </div>
        <div className="quick-actions">
          {isHomeroomTeacher ? (
            <>
              <Quick icon="⇧" title="학생 명렬 관리" text="명렬표 가져오기와 학생 정보" onClick={() => navigate("학생 명렬")} />
              <Quick icon="＋" title="상담 기록 남기기" text="학생별 누적 상담을 관리합니다" onClick={() => navigate("상담 기록")} />
              <Quick icon="▦" title="자리 배치 만들기" text="교실 구조에 학생을 배치합니다" onClick={() => navigate("자리배정")} />
              <Quick icon="▤" title="수행평가 입력하기" text="평가 항목과 점수를 기록합니다" onClick={() => navigate("평가 관리")} />
            </>
          ) : (
            <>
              <Quick icon="▤" title="수행평가 입력하기" text="나이스 파일을 가져와 점수를 기록합니다" onClick={() => navigate("평가 관리")} />
              <Quick icon="♙" title="수업 명렬 보기" text="반별 수업 명렬을 확인합니다" onClick={() => navigate("수업 명렬")} />
              <Quick icon="▥" title="설문 만들기" text="QR로 참여하는 설문을 엽니다" onClick={() => navigate("설문 조사")} />
              <Quick icon="⚙" title="환경 설정" text="담당 수업과 자동 잠금" onClick={() => navigate("환경 설정")} />
            </>
          )}
        </div>
      </section>
    </>
  );
}
