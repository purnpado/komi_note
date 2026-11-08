import { Fragment, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GetTimetableBook, ListCourseRosters, SaveTimetableBook } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage, todayLocal } from "../shared/format";
import {
  CHANGE_KINDS,
  DAY_LABELS,
  cellAt,
  cellsBeyond,
  computePeriods,
  dropBeyond,
  lunchAfter,
  periodsError,
  rosterLabel,
  setCell,
  type TimetableKind,
} from "./timetableState";
import "./timetable.css";

type CellDraft = { day: number; period: number; subject: string; className: string; room: string; note: string; courseRosterId: string };
type ChangeDraft = Omit<models.TimetableChange, "id">;

const emptyChange = (date: string, target: TimetableKind): ChangeDraft => ({
  date, period: 1, kind: "교체", target, subject: "", className: "", room: "", note: "", courseRosterId: "",
});

function semesterLabel(year: string, semester: string) {
  return `${year}학년도 ${semester}학기`;
}

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${"일월화수목금토"[date.getDay()]})`;
}

// RosterPicker는 수업 명렬에서 반을 고르거나 직접 입력하게 합니다. 명렬 ID와 반 이름만 저장합니다.
function RosterPicker({ rosters, rosterID, className, onChange }: {
  rosters: models.CourseRoster[];
  rosterID: string;
  className: string;
  onChange: (rosterID: string, className: string) => void;
}) {
  const linked = rosters.find((roster) => roster.id === rosterID);
  return (
    <div className="timetable-field">
      <span>반 <HelpTip>수업 명렬에서 반을 고르면 대시보드에서 그 반의 수업 명렬과 평가로 바로 갈 수 있습니다. 명렬이 없으면 직접 적으세요.</HelpTip></span>
      <div className="timetable-roster-row">
        <select
          aria-label="수업 명렬에서 반 고르기"
          value={linked ? linked.id : ""}
          onChange={(event) => {
            const roster = rosters.find((item) => item.id === event.target.value);
            onChange(roster?.id || "", roster ? rosterLabel(roster) : className);
          }}
        >
          <option value="">직접 입력</option>
          {rosters.map((roster) => (
            <option key={roster.id} value={roster.id}>
              {roster.schoolYear}학년도 {rosterLabel(roster)} ({roster.students.length}명)
            </option>
          ))}
        </select>
        <input aria-label="반 이름" placeholder="예: 2-3" value={className} disabled={Boolean(linked)} onChange={(event) => onChange("", event.target.value)} />
      </div>
    </div>
  );
}

export function TimetablePage({ config, isHomeroomTeacher }: { config: models.ClassConfig | null; isHomeroomTeacher: boolean }) {
  const [book, setBook] = useState<models.TimetableBook | null>(null);
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [kind, setKind] = useState<TimetableKind>("teacher");
  const [view, setView] = useState({ year: "", semester: "" });
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [cellDraft, setCellDraft] = useState<CellDraft | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [rule, setRule] = useState<models.TimetableBellRule>(new models.TimetableBellRule());
  const [periods, setPeriods] = useState<models.TimetablePeriod[]>([]);
  const [bellError, setBellError] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  const [changeDraft, setChangeDraft] = useState<ChangeDraft>(emptyChange(todayLocal(), "teacher"));
  const [editingChangeID, setEditingChangeID] = useState("");
  const [showPast, setShowPast] = useState(false);
  // 창(Dialog)이 열려 있을 때 생긴 오류는 창 안에 보여 준다(본문 알림은 창에 가려 보이지 않음).
  const [dialogError, setDialogError] = useState("");
  const dialogOpen = Boolean(cellDraft) || bellOpen || changesOpen;

  useEffect(() => {
    let active = true;
    GetTimetableBook()
      .then((loaded) => {
        if (!active) return;
        const next = new models.TimetableBook(loaded);
        setBook(next);
        setView({ year: next.activeSchoolYear, semester: next.activeSemester });
        if (!next.periods.length) setNotice("먼저 [교시 시간 설정]에서 우리 학교 교시 시각을 넣어 주세요.");
      })
      .catch((error) => active && setNotice(errorMessage(error)));
    ListCourseRosters()
      .then((items) => active && setRosters((items || []).map((item) => new models.CourseRoster(item))))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isHomeroomTeacher && kind === "class") setKind("teacher");
  }, [isHomeroomTeacher, kind]);

  const yearOptions = useMemo(() => {
    const years = new Set<string>();
    const base = Number(config?.schoolYear || book?.activeSchoolYear || new Date().getFullYear());
    [base - 1, base, base + 1].forEach((year) => years.add(String(year)));
    (book?.timetables || []).forEach((table) => years.add(table.schoolYear));
    if (book?.activeSchoolYear) years.add(book.activeSchoolYear);
    return [...years].sort();
  }, [book, config?.schoolYear]);

  async function persist(next: models.TimetableBook, message: string) {
    setBusy(true);
    try {
      const saved = new models.TimetableBook(await SaveTimetableBook(next));
      setBook(saved);
      setDialogError("");
      setNotice(saved.periods.length ? "" : "먼저 [교시 시간 설정]에서 우리 학교 교시 시각을 넣어 주세요.");
      setFeedback(message);
      return true;
    } catch (error) {
      setFeedback("");
      if (dialogOpen) setDialogError(errorMessage(error));
      else setNotice(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!book) {
    return (
      <div className="timetable-page">
        <p className="timetable-notice" role="alert">{notice || "시간표를 불러오는 중입니다."}</p>
      </div>
    );
  }

  const current = book;
  const isActive = view.year === current.activeSchoolYear && view.semester === current.activeSemester;
  const lunch = lunchAfter(current);
  const kindLabel = kind === "teacher" ? "내 수업 시간표" : "우리 반 시간표";
  const classTitle = config?.grade && config?.classNumber ? `${config.grade}학년 ${config.classNumber}반` : "우리 반";

  function openCell(day: number, period: number) {
    const cell = cellAt(current, kind, day, period, view.year, view.semester);
    setDialogError("");
    setCellDraft({
      day, period,
      subject: cell?.subject || "", className: cell?.className || "", room: cell?.room || "",
      note: cell?.note || "", courseRosterId: cell?.courseRosterId || "",
    });
  }

  async function saveCell(clear: boolean) {
    if (!cellDraft) return;
    const draft = clear ? { ...cellDraft, subject: "", className: "", room: "", note: "", courseRosterId: "" } : cellDraft;
    const next = setCell(current, kind, view.year, view.semester, new models.TimetableCell(draft));
    const label = `${DAY_LABELS[draft.day - 1]}요일 ${draft.period}교시`;
    if (await persist(new models.TimetableBook(next), clear ? `${label}을 비웠습니다(공강).` : `${label}을 저장했습니다.`)) setCellDraft(null);
  }

  function openBell() {
    const saved = current.rule;
    setRule(new models.TimetableBellRule({ ...saved, periodCount: saved.periodCount || current.periods.length || 0 }));
    setPeriods(current.periods.map((period) => new models.TimetablePeriod(period)));
    setBellError("");
    setDialogError("");
    setBellOpen(true);
  }

  function recalculate() {
    const result = computePeriods(rule);
    setBellError(result.error);
    if (!result.error) setPeriods(result.periods.map((period) => new models.TimetablePeriod(period)));
  }

  async function saveBell() {
    const error = periods.length ? periodsError(periods) : "교시 시각을 먼저 계산해 주세요. 규칙을 넣고 [자동 계산]을 누르세요.";
    if (error) {
      setBellError(error);
      return;
    }
    let next = new models.TimetableBook({ ...current, rule: { ...rule, periodCount: periods.length }, periods });
    const lost = cellsBeyond(current, periods.length);
    if (lost > 0) {
      const ok = await confirmWithRadix({
        title: `${periods.length + 1}교시 이후 칸 ${lost}개를 지울까요?`,
        description: `교시 수를 ${periods.length}개로 줄이면 모든 학기 시간표와 날짜별 교체·보강에서 ${periods.length + 1}교시 이후에 적은 내용 ${lost}개가 지워집니다.`,
        actionLabel: "지우고 저장",
      });
      if (!ok) return;
      next = new models.TimetableBook(dropBeyond(next, periods.length));
    }
    if (await persist(next, `교시 시간을 저장했습니다(하루 ${periods.length}교시).`)) setBellOpen(false);
  }

  async function changeSemester(year: string, semester: string) {
    setView({ year, semester });
    setFeedback("");
  }

  async function makeActive() {
    await persist(new models.TimetableBook({ ...current, activeSchoolYear: view.year, activeSemester: view.semester }), `${semesterLabel(view.year, view.semester)}를 지금 쓰는 시간표로 정했습니다. 대시보드가 이 학기 시간표를 보여 줍니다.`);
  }

  async function saveChange() {
    const changes = current.changes.filter((item) => item.id !== editingChangeID);
    // 결강은 원래 수업을 취소하는 기록이므로, 숨겨진 과목·반 입력값은 저장하지 않는다.
    const draft = changeDraft.kind === "결강" ? { ...changeDraft, subject: "", className: "", room: "", courseRosterId: "" } : changeDraft;
    const next = new models.TimetableBook({ ...current, changes: [...changes, { ...draft, id: editingChangeID }] });
    if (await persist(next, `${shortDate(changeDraft.date)} ${changeDraft.period}교시 ${changeDraft.kind}을 저장했습니다.`)) {
      setEditingChangeID("");
      setChangeDraft(emptyChange(changeDraft.date, changeDraft.target as TimetableKind));
    }
  }

  async function removeChange(change: models.TimetableChange) {
    const ok = await confirmWithRadix({
      title: "이 교체·보강 기록을 지울까요?",
      description: `${shortDate(change.date)} ${change.period}교시 ${change.kind} 기록을 지웁니다. 기본 시간표는 바뀌지 않습니다.`,
      actionLabel: "지우기",
    });
    if (!ok) return;
    await persist(new models.TimetableBook({ ...current, changes: current.changes.filter((item) => item.id !== change.id) }), "교체·보강 기록을 지웠습니다.");
  }

  const today = todayLocal();
  const upcoming = current.changes.filter((change) => change.date >= today);
  const past = current.changes.filter((change) => change.date < today).reverse();

  return (
    <div className="timetable-page">
      <header className="timetable-hero">
        <div>
          <p className="eyebrow">수업용 · 암호화 보관</p>
          <h2>시간표</h2>
          <p>요일·교시별로 수업을 적어 두면 대시보드에 오늘 수업과 이번 주 시간표가 나옵니다.</p>
        </div>
        <div className="timetable-hero-actions">
          <button type="button" className="quiet-button" onClick={openBell}>교시 시간 설정</button>
          <button type="button" className="quiet-button" disabled={!current.periods.length} onClick={() => { setEditingChangeID(""); setChangeDraft(emptyChange(today, kind)); setDialogError(""); setChangesOpen(true); }}>날짜별 교체·보강</button>
        </div>
      </header>

      <HelpGuide
        title="시간표 사용 순서"
        description="학생 정보 없이 과목·반·교시 시각만 보관함에 암호화해 저장합니다."
        defaultOpen={!current.timetables.length}
        steps={[
          { title: "교시 시간 설정", detail: "1교시 시작 시각, 수업 길이, 쉬는 시간, 점심 위치·길이를 넣고 [자동 계산]을 누릅니다. 다른 교시만 따로 고칠 수도 있습니다." },
          { title: "내 수업 입력", detail: "표의 칸을 눌러 과목과 반을 적습니다. 수업 명렬에서 반을 고르면 대시보드에서 그 반 명렬·평가로 바로 갈 수 있습니다." },
          ...(isHomeroomTeacher ? [{ title: "우리 반 시간표", detail: "담임이면 [우리 반 시간표] 탭에 학급 시간표도 적어 둡니다. 대시보드에 우리 반 오늘 과목이 한 줄로 나옵니다." }] : []),
          { title: "학기 고르기", detail: "1학기·2학기 시간표를 따로 저장합니다. 새 학기가 되면 위에서 학기를 고르고 [지금 쓰는 시간표로 정하기]를 누릅니다." },
          { title: "교체·보강", detail: "특정 날짜만 바뀌는 수업은 [날짜별 교체·보강]에 적습니다. 그날 대시보드에만 반영되고 기본 시간표는 그대로입니다." },
        ]}
        note="시간표는 이 컴퓨터의 암호화 보관함에만 저장되고 밖으로 보내지 않습니다. 암호화 백업에 함께 들어갑니다."
      />

      {notice && <p className="timetable-notice" role="alert">{notice}</p>}
      {feedback && <p className="timetable-feedback" role="status">{feedback}</p>}

      <section className="panel timetable-panel">
        <div className="timetable-toolbar">
          <div className="timetable-tabs" role="tablist" aria-label="시간표 종류">
            <button type="button" role="tab" aria-selected={kind === "teacher"} className={kind === "teacher" ? "active" : ""} onClick={() => setKind("teacher")}>내 수업 시간표</button>
            {isHomeroomTeacher && (
              <button type="button" role="tab" aria-selected={kind === "class"} className={kind === "class" ? "active" : ""} onClick={() => setKind("class")}>우리 반 시간표 <small>{classTitle}</small></button>
            )}
          </div>
          <div className="timetable-semester">
            <label>
              <span className="sr-only">학년도</span>
              <select aria-label="학년도" value={view.year} onChange={(event) => void changeSemester(event.target.value, view.semester)}>
                {yearOptions.map((year) => <option key={year} value={year}>{year}학년도</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">학기</span>
              <select aria-label="학기" value={view.semester} onChange={(event) => void changeSemester(view.year, event.target.value)}>
                <option value="1">1학기</option>
                <option value="2">2학기</option>
              </select>
            </label>
            {isActive ? (
              <span className="timetable-active-badge">지금 쓰는 시간표</span>
            ) : (
              <button type="button" className="text-button" disabled={busy} onClick={() => void makeActive()}>지금 쓰는 시간표로 정하기</button>
            )}
          </div>
        </div>

        {!current.periods.length ? (
          <div className="timetable-empty">
            <strong>아직 교시 시간이 없습니다</strong>
            <p>학교마다 1교시 시작과 점심시간이 다르므로, 먼저 우리 학교 교시 시각을 넣어 주세요.</p>
            <button type="button" className="primary-button" onClick={openBell}>교시 시간 설정</button>
          </div>
        ) : (
          <div className="timetable-grid-wrap">
            <table className="timetable-grid" aria-label={`${semesterLabel(view.year, view.semester)} ${kindLabel}`}>
              <thead>
                <tr>
                  <th scope="col">교시</th>
                  {DAY_LABELS.map((day) => <th scope="col" key={day}>{day}</th>)}
                </tr>
              </thead>
              <tbody>
                {current.periods.map((period) => (
                  <Fragment key={period.number}>
                    <tr>
                      <th scope="row">
                        <b>{period.number}교시</b>
                        <small>{period.start}~{period.end}</small>
                      </th>
                      {DAY_LABELS.map((day, index) => {
                        const cell = cellAt(current, kind, index + 1, period.number, view.year, view.semester);
                        return (
                          <td key={day}>
                            <button
                              type="button"
                              className={cell ? "timetable-cell filled" : "timetable-cell"}
                              aria-label={`${day}요일 ${period.number}교시 ${cell ? `${cell.subject} ${cell.className}` : "비어 있음"} 고치기`}
                              onClick={() => openCell(index + 1, period.number)}
                            >
                              {cell ? (
                                <>
                                  <strong>{cell.subject || "(과목 없음)"}</strong>
                                  {(cell.className || cell.room) && <span>{[cell.className, cell.room].filter(Boolean).join(" · ")}</span>}
                                  {cell.note && <small>{cell.note}</small>}
                                  {cell.courseRosterId && <i aria-hidden="true" title="수업 명렬과 연결됨">명렬</i>}
                                </>
                              ) : (
                                <span className="timetable-cell-empty">＋</span>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                    {lunch === period.number && (
                      <tr className="timetable-lunch">
                        <th scope="row">점심</th>
                        <td colSpan={5}>{period.end} ~ {current.periods[period.number]?.start}</td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog.Root open={Boolean(cellDraft)} onOpenChange={(open) => !open && !busy && setCellDraft(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content timetable-dialog">
            {cellDraft && (
              <form onSubmit={(event) => { event.preventDefault(); void saveCell(false); }}>
                <Dialog.Title>{DAY_LABELS[cellDraft.day - 1]}요일 {cellDraft.period}교시</Dialog.Title>
                <Dialog.Description className="timetable-dialog-description">
                  {semesterLabel(view.year, view.semester)} · {kindLabel}. 모두 비우고 저장하면 공강이 됩니다.
                </Dialog.Description>
                <label className="timetable-field">
                  <span>과목</span>
                  <input autoFocus maxLength={40} placeholder={kind === "teacher" ? config?.teachingSubject || "예: 과학" : "예: 국어"} value={cellDraft.subject} onChange={(event) => setCellDraft({ ...cellDraft, subject: event.target.value })} />
                </label>
                {kind === "teacher" && (
                  <RosterPicker
                    rosters={rosters}
                    rosterID={cellDraft.courseRosterId}
                    className={cellDraft.className}
                    onChange={(courseRosterId, className) => setCellDraft({ ...cellDraft, courseRosterId, className })}
                  />
                )}
                <label className="timetable-field">
                  <span>교실 <small>(선택)</small></span>
                  <input maxLength={40} placeholder="예: 과학실" value={cellDraft.room} onChange={(event) => setCellDraft({ ...cellDraft, room: event.target.value })} />
                </label>
                <label className="timetable-field">
                  <span>메모 <small>(선택{kind === "class" ? ", 예: 담당 선생님" : ""})</small></span>
                  <input maxLength={200} value={cellDraft.note} onChange={(event) => setCellDraft({ ...cellDraft, note: event.target.value })} />
                </label>
                {dialogError && <p className="timetable-notice timetable-dialog-error" role="alert">{dialogError}</p>}
                <div className="dialog-actions">
                  <button type="button" className="danger-button" disabled={busy} onClick={() => void saveCell(true)}>칸 비우기</button>
                  <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
                  <button type="submit" className="primary-button" disabled={busy}>저장</button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={bellOpen} onOpenChange={(open) => !busy && setBellOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content timetable-dialog timetable-bell-dialog">
            <Dialog.Title>교시 시간 설정</Dialog.Title>
            <Dialog.Description className="timetable-dialog-description">
              우리 학교 규칙을 넣고 [자동 계산]을 누르세요. 계산한 뒤에 특정 교시 시각만 따로 고칠 수 있습니다(다시 [자동 계산]을 누르면 규칙대로 돌아갑니다). 모든 학기에 같이 쓰입니다.
            </Dialog.Description>
            <div className="timetable-rule-grid">
              <label className="timetable-field"><span>1교시 시작</span><input type="time" value={rule.firstStart} onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, firstStart: event.target.value }))} /></label>
              <label className="timetable-field"><span>하루 교시 수</span><input inputMode="numeric" value={rule.periodCount || ""} placeholder="예: 7" onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, periodCount: Number(event.target.value.replace(/\D/g, "")) || 0 }))} /></label>
              <label className="timetable-field"><span>수업 길이(분)</span><input inputMode="numeric" value={rule.lessonMinutes || ""} placeholder="예: 45" onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, lessonMinutes: Number(event.target.value.replace(/\D/g, "")) || 0 }))} /></label>
              <label className="timetable-field"><span>쉬는 시간(분)</span><input inputMode="numeric" value={String(rule.breakMinutes ?? "")} placeholder="예: 10" onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, breakMinutes: Number(event.target.value.replace(/\D/g, "")) || 0 }))} /></label>
              <label className="timetable-field">
                <span>점심 위치 <HelpTip>몇 교시가 끝난 뒤 점심을 먹는지 고릅니다. 점심이 없으면 "없음"을 고르세요.</HelpTip></span>
                <select value={rule.lunchAfter} onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, lunchAfter: Number(event.target.value) }))}>
                  <option value={0}>없음</option>
                  {Array.from({ length: Math.max(0, (rule.periodCount || 0) - 1) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}교시 뒤</option>)}
                </select>
              </label>
              <label className="timetable-field"><span>점심 길이(분)</span><input inputMode="numeric" disabled={!rule.lunchAfter} value={rule.lunchMinutes || ""} placeholder="예: 50" onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, lunchMinutes: Number(event.target.value.replace(/\D/g, "")) || 0 }))} /></label>
            </div>
            <button type="button" className="quiet-button timetable-compute" onClick={recalculate}>자동 계산</button>
            {(bellError || dialogError) && <p className="timetable-notice" role="alert">{bellError || dialogError}</p>}
            {periods.length > 0 && (
              <table className="timetable-period-table">
                <thead><tr><th>교시</th><th>시작</th><th>끝</th></tr></thead>
                <tbody>
                  {periods.map((period, index) => (
                    <tr key={period.number}>
                      <th scope="row">{period.number}교시</th>
                      <td><input type="time" aria-label={`${period.number}교시 시작`} value={period.start} onChange={(event) => setPeriods(periods.map((item, at) => at === index ? new models.TimetablePeriod({ ...item, start: event.target.value }) : item))} /></td>
                      <td><input type="time" aria-label={`${period.number}교시 끝`} value={period.end} onChange={(event) => setPeriods(periods.map((item, at) => at === index ? new models.TimetablePeriod({ ...item, end: event.target.value }) : item))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
              <button type="button" className="primary-button" disabled={busy || !periods.length} onClick={() => void saveBell()}>저장</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={changesOpen} onOpenChange={(open) => !busy && setChangesOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content timetable-dialog timetable-change-dialog">
            <Dialog.Title>날짜별 교체·보강</Dialog.Title>
            <Dialog.Description className="timetable-dialog-description">
              그날만 바뀌는 수업을 적습니다. 결강은 원래 수업을 취소로 표시하고, 교체·보강은 그 교시 수업을 바꾸거나 더합니다.
            </Dialog.Description>
            <form className="timetable-change-form" onSubmit={(event) => { event.preventDefault(); void saveChange(); }}>
              <label className="timetable-field"><span>날짜</span><input type="date" required value={changeDraft.date} onChange={(event) => setChangeDraft({ ...changeDraft, date: event.target.value })} /></label>
              <label className="timetable-field">
                <span>교시</span>
                <select value={changeDraft.period} onChange={(event) => setChangeDraft({ ...changeDraft, period: Number(event.target.value) })}>
                  {current.periods.map((period) => <option key={period.number} value={period.number}>{period.number}교시 ({period.start})</option>)}
                </select>
              </label>
              <label className="timetable-field">
                <span>종류</span>
                <select value={changeDraft.kind} onChange={(event) => setChangeDraft({ ...changeDraft, kind: event.target.value })}>
                  {CHANGE_KINDS.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              {isHomeroomTeacher && (
                <label className="timetable-field">
                  <span>어느 시간표</span>
                  <select value={changeDraft.target} onChange={(event) => setChangeDraft({ ...changeDraft, target: event.target.value, courseRosterId: "" })}>
                    <option value="teacher">내 수업</option>
                    <option value="class">우리 반</option>
                  </select>
                </label>
              )}
              {changeDraft.kind !== "결강" && (
                <>
                  <label className="timetable-field"><span>과목</span><input maxLength={40} value={changeDraft.subject} onChange={(event) => setChangeDraft({ ...changeDraft, subject: event.target.value })} /></label>
                  {changeDraft.target === "teacher" ? (
                    <RosterPicker rosters={rosters} rosterID={changeDraft.courseRosterId} className={changeDraft.className} onChange={(courseRosterId, className) => setChangeDraft({ ...changeDraft, courseRosterId, className })} />
                  ) : null}
                  <label className="timetable-field"><span>교실 <small>(선택)</small></span><input maxLength={40} value={changeDraft.room} onChange={(event) => setChangeDraft({ ...changeDraft, room: event.target.value })} /></label>
                </>
              )}
              <label className="timetable-field timetable-change-note"><span>메모 <small>(선택, 예: 출장·현장체험)</small></span><input maxLength={200} value={changeDraft.note} onChange={(event) => setChangeDraft({ ...changeDraft, note: event.target.value })} /></label>
              {dialogError && <p className="timetable-notice timetable-dialog-error" role="alert">{dialogError}</p>}
              <div className="timetable-change-submit">
                {editingChangeID && <button type="button" className="quiet-button" onClick={() => { setEditingChangeID(""); setChangeDraft(emptyChange(today, kind)); }}>새로 쓰기</button>}
                <button type="submit" className="primary-button" disabled={busy}>{editingChangeID ? "고친 내용 저장" : "추가"}</button>
              </div>
            </form>
            <div className="timetable-change-list">
              <h3>앞으로의 변경 <small>{upcoming.length}건</small></h3>
              {upcoming.length ? upcoming.map((change) => (
                <ChangeRow key={change.id} change={change} showTarget={isHomeroomTeacher} onEdit={() => { setEditingChangeID(change.id); setChangeDraft({ ...change }); }} onDelete={() => void removeChange(change)} />
              )) : <p className="timetable-muted">오늘부터 앞으로 적어 둔 변경이 없습니다.</p>}
              {past.length > 0 && (
                <>
                  <button type="button" className="text-button" aria-expanded={showPast} onClick={() => setShowPast((value) => !value)}>
                    {showPast ? "지난 변경 접기" : `지난 변경 ${past.length}건 보기`}
                  </button>
                  {showPast && past.map((change) => (
                    <ChangeRow key={change.id} change={change} showTarget={isHomeroomTeacher} onEdit={() => { setEditingChangeID(change.id); setChangeDraft({ ...change }); }} onDelete={() => void removeChange(change)} />
                  ))}
                </>
              )}
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild><button type="button" className="quiet-button">닫기</button></Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function ChangeRow({ change, showTarget, onEdit, onDelete }: { change: models.TimetableChange; showTarget: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="timetable-change-row">
      <span className={`timetable-change-kind kind-${change.kind}`}>{change.kind}</span>
      <div>
        <b>{shortDate(change.date)} {change.period}교시{showTarget ? ` · ${change.target === "class" ? "우리 반" : "내 수업"}` : ""}</b>
        <small>{[change.subject, change.className, change.room, change.note].filter(Boolean).join(" · ") || "원래 수업 취소"}</small>
      </div>
      <button type="button" className="text-button" onClick={onEdit}>고치기</button>
      <button type="button" className="text-button danger-text" onClick={onDelete}>지우기</button>
    </div>
  );
}
