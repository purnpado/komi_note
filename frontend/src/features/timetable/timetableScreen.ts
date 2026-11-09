import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { todayLocal } from "../shared/format";
import {
  DAY_LABELS,
  cellAt,
  cellsBeyond,
  computePeriods,
  dropBeyond,
  lunchAfter,
  periodsError,
  setCell,
  type TimetableKind,
} from "./timetableState";
import { emptyChange, semesterLabel, shortDate } from "./useTimetablePage";
import type { TimetableView } from "./TimetablePage";

/** 시간표 화면의 계산(현재 학기·점심·교체 목록)과 칸·교시·교체 저장 처리. 시간표를 불러온 뒤에만 쓴다. */
export function timetableScreen(page: TimetableView, book: NonNullable<TimetableView["book"]>) {
  const {
    kind,
    view,
    setView,
    setFeedback,
    cellDraft,
    setCellDraft,
    setBellOpen,
    rule,
    setRule,
    periods,
    setPeriods,
    setBellError,
    changeDraft,
    setChangeDraft,
    editingChangeID,
    setEditingChangeID,
    setDialogError,
    persist,
    config,
  } = page;
  const current = book;
  const isActive = view.year === current.activeSchoolYear && view.semester === current.activeSemester;
  const lunch = lunchAfter(current);
  const kindLabel = kind === "teacher" ? "내 수업 시간표" : "우리 반 시간표";
  const classTitle = config?.grade && config?.classNumber ? `${config.grade}학년 ${config.classNumber}반` : "우리 반";

  function openCell(day: number, period: number) {
    const cell = cellAt(current, kind, day, period, view.year, view.semester);
    setDialogError("");
    setCellDraft({
      day,
      period,
      subject: cell?.subject || "",
      className: cell?.className || "",
      room: cell?.room || "",
      note: cell?.note || "",
      courseRosterId: cell?.courseRosterId || "",
    });
  }

  async function saveCell(clear: boolean) {
    if (!cellDraft) return;
    const draft = clear
      ? { ...cellDraft, subject: "", className: "", room: "", note: "", courseRosterId: "" }
      : cellDraft;
    const next = setCell(current, kind, view.year, view.semester, new models.TimetableCell(draft));
    const label = `${DAY_LABELS[draft.day - 1]}요일 ${draft.period}교시`;
    if (
      await persist(new models.TimetableBook(next), clear ? `${label}을 비웠습니다(공강).` : `${label}을 저장했습니다.`)
    )
      setCellDraft(null);
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
    const error = periods.length
      ? periodsError(periods)
      : "교시 시각을 먼저 계산해 주세요. 규칙을 넣고 [자동 계산]을 누르세요.";
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
    await persist(
      new models.TimetableBook({ ...current, activeSchoolYear: view.year, activeSemester: view.semester }),
      `${semesterLabel(view.year, view.semester)}를 지금 쓰는 시간표로 정했습니다. 대시보드가 이 학기 시간표를 보여 줍니다.`,
    );
  }

  async function saveChange() {
    const changes = current.changes.filter((item) => item.id !== editingChangeID);
    // 결강은 원래 수업을 취소하는 기록이므로, 숨겨진 과목·반 입력값은 저장하지 않는다.
    const draft =
      changeDraft.kind === "결강"
        ? { ...changeDraft, subject: "", className: "", room: "", courseRosterId: "" }
        : changeDraft;
    const next = new models.TimetableBook({ ...current, changes: [...changes, { ...draft, id: editingChangeID }] });
    if (
      await persist(
        next,
        `${shortDate(changeDraft.date)} ${changeDraft.period}교시 ${changeDraft.kind}을 저장했습니다.`,
      )
    ) {
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
    await persist(
      new models.TimetableBook({ ...current, changes: current.changes.filter((item) => item.id !== change.id) }),
      "교체·보강 기록을 지웠습니다.",
    );
  }

  const today = todayLocal();
  const upcoming = current.changes.filter((change) => change.date >= today);
  const past = current.changes.filter((change) => change.date < today).reverse();

  return {
    current,
    isActive,
    lunch,
    kindLabel,
    classTitle,
    openCell,
    saveCell,
    openBell,
    recalculate,
    saveBell,
    changeSemester,
    makeActive,
    saveChange,
    removeChange,
    today,
    upcoming,
    past,
  };
}
