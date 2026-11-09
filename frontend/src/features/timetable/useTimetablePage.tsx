import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GetTimetableBook, ListCourseRosters, SaveTimetableBook } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage, todayLocal } from "../shared/format";
import { rosterLabel, type TimetableKind } from "./timetableState";
import "./timetable.css";

export type CellDraft = {
  day: number;
  period: number;
  subject: string;
  className: string;
  room: string;
  note: string;
  courseRosterId: string;
};
export type ChangeDraft = Omit<models.TimetableChange, "id">;

export const emptyChange = (date: string, target: TimetableKind): ChangeDraft => ({
  date,
  period: 1,
  kind: "교체",
  target,
  subject: "",
  className: "",
  room: "",
  note: "",
  courseRosterId: "",
});

export function semesterLabel(year: string, semester: string) {
  return `${year}학년도 ${semester}학기`;
}

export function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}월 ${date.getDate()}일(${"일월화수목금토"[date.getDay()]})`;
}

// RosterPicker는 수업 명렬에서 반을 고르거나 직접 입력하게 합니다. 명렬 ID와 반 이름만 저장합니다.
export function RosterPicker({
  rosters,
  rosterID,
  className,
  onChange,
}: {
  rosters: models.CourseRoster[];
  rosterID: string;
  className: string;
  onChange: (rosterID: string, className: string) => void;
}) {
  const linked = rosters.find((roster) => roster.id === rosterID);
  return (
    <div className="timetable-field">
      <span>
        반{" "}
        <HelpTip>
          수업 명렬에서 반을 고르면 대시보드에서 그 반의 수업 명렬과 평가로 바로 갈 수 있습니다. 명렬이 없으면 직접
          적으세요.
        </HelpTip>
      </span>
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
        <input
          aria-label="반 이름"
          placeholder="예: 2-3"
          value={className}
          disabled={Boolean(linked)}
          onChange={(event) => onChange("", event.target.value)}
        />
      </div>
    </div>
  );
}

/** TimetablePage 화면의 상태·계산·처리 함수. 화면(JSX)은 TimetablePage.tsx에 있다. */
export function useTimetablePage({
  config,
  isHomeroomTeacher,
}: {
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
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
      setNotice(""); // C2(2026-11-10): 교시가 없을 때 안내는 표 안에서만 한 번 보인다
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

  return {
    book,
    setBook,
    rosters,
    setRosters,
    kind,
    setKind,
    view,
    setView,
    notice,
    setNotice,
    feedback,
    setFeedback,
    busy,
    setBusy,
    cellDraft,
    setCellDraft,
    bellOpen,
    setBellOpen,
    rule,
    setRule,
    periods,
    setPeriods,
    bellError,
    setBellError,
    changesOpen,
    setChangesOpen,
    changeDraft,
    setChangeDraft,
    editingChangeID,
    setEditingChangeID,
    showPast,
    setShowPast,
    dialogError,
    setDialogError,
    dialogOpen,
    yearOptions,
    persist,
  };
}
