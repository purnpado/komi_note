import type { Dispatch, SetStateAction } from "react";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  DeleteAttendanceTemplate,
  ExportAttendanceHWPX,
  GetAttendance,
  GetAttendanceDocumentPeriod,
  ListAttendanceTemplates,
  SaveAttendance,
  SaveAttendancePDF,
  SaveAttendanceTemplate,
  SaveAttendanceTemplateCustomValues,
  SaveAttendanceTemplateMappings,
  SelectAttendanceTemplateFile,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { DocumentPointLayout } from "./attendanceTypes";
import { koreanDate, parseHWPXCustomValues } from "./attendanceUtils";

import { errorMessage, toLocalDateString, todayLocal } from "../shared/format";
import { useAttendanceDocuments } from "./useAttendanceDocuments";
export type UseAttendanceParams = {
  students: models.Student[];
  config: models.ClassConfig | null;
  initialDate?: string;
};

// 주말 날짜는 출결을 입력하지 않으므로, 주말이면 방향(-1: 이전, 1: 다음)으로 가장 가까운 평일을 고릅니다.
export function nearestWeekday(value: string, direction: -1 | 1 = -1): string {
  const next = new Date(`${value}T12:00:00`);
  while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + direction);
  return toLocalDateString(next);
}

function isWeekend(value: string) {
  const day = new Date(`${value}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** useAttendanceDocuments(서식·서류 출력)에 넘기는 값 */
export type UseAttendanceShared = {
  config: models.ClassConfig | null;
  date: string;
  day: models.AttendanceDay | null;
  setNotice: Dispatch<SetStateAction<string>>;
  attendanceTab: "출결 입력" | "출결 서식" | "출결 서류 출력";
  studentByID: Map<string, models.Student>;
};

export function useAttendance({ students, config, initialDate = "" }: UseAttendanceParams) {
  const [date, setDate] = useState(() => nearestWeekday(todayLocal()));
  const [day, setDay] = useState<models.AttendanceDay | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [attendanceTab, setAttendanceTab] = useState<"출결 입력" | "출결 서식" | "출결 서류 출력">("출결 입력");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const studentByID = useMemo(() => new Map((students || []).map((student) => [student.id, student])), [students]);
  const weekday = (value: string) => {
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    return labels[new Date(`${value}T12:00:00`).getDay()];
  };
  const resizeReason = (element: HTMLTextAreaElement) => {
    if (!element.value.trim()) {
      element.style.height = "42px";
      return;
    }
    element.style.height = "auto";
    element.style.height = `${Math.max(42, element.scrollHeight)}px`;
  };
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLTextAreaElement>(".attendance-editor-row textarea").forEach(resizeReason);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [day]);
  async function loadAttendance() {
    if (isWeekend(date)) {
      setDay(null);
      setNotice("주말에는 출결을 입력하지 않습니다. 평일 날짜를 골라 주세요.");
      return;
    }
    try {
      setBusy(true);
      const next = new models.AttendanceDay(await GetAttendance(date));
      next.entries = next.entries || [];
      setDay(next);
      setNotice(
        date !== todayLocal() && isWeekend(todayLocal()) && date === nearestWeekday(todayLocal())
          ? "오늘은 주말이라 가장 가까운 평일의 출결을 보여 줍니다."
          : "",
      );
    } catch (error) {
      setDay(null);
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void loadAttendance();
  }, [date]);
  // 학생 명렬(전입·학적변동)이 바뀌면 출결 명단을 다시 읽는다. 입력 중 덮어쓰지 않도록 출결 알림은 받지 않는다.
  useVaultChanges([changeEvents.students], () => void loadAttendance());
  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);
  useEffect(() => {
    ListAttendanceTemplates()
      .then((items) => setTemplates(items || []))
      .catch(() => undefined);
  }, []);
  // 이전·다음 버튼은 주말을 건너뛰어 평일끼리 이동합니다.
  function moveDate(offset: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + offset);
    setDate(nearestWeekday(toLocalDateString(next), offset < 0 ? -1 : 1));
  }
  function updateEntry(studentID: string, updates: Partial<models.AttendanceEntry>) {
    if (!day) return;
    setDay(
      new models.AttendanceDay({
        ...day,
        entries: day.entries.map((entry) => {
          if (entry.studentId !== studentID) return entry;
          const next = { ...entry, ...updates };
          if (next.status === "출석") {
            next.reasonCategory = "";
            next.reason = "";
          }
          return next;
        }),
      }),
    );
  }
  function markAllPresent() {
    if (!day) return;
    setDay(
      new models.AttendanceDay({
        ...day,
        entries: day.entries.map((entry) => ({
          ...entry,
          status: "출석",
          reasonCategory: "",
          reason: "",
        })),
      }),
    );
  }
  async function saveAttendance() {
    if (!day) return;
    try {
      setBusy(true);
      const saved = new models.AttendanceDay(await SaveAttendance(day));
      saved.entries = saved.entries || [];
      setDay(saved);
      setNotice(`${date} 출결을 암호화 보관함에 저장했습니다.`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const summary = useMemo(() => {
    const counts: Record<string, number> = {
      출석: 0,
      결석: 0,
      지각: 0,
      조퇴: 0,
      결과: 0,
    };
    for (const entry of day?.entries || []) counts[entry.status] = (counts[entry.status] || 0) + 1;
    return counts;
  }, [day]);
  const {
    templates,
    setTemplates,
    template,
    setTemplate,
    templatePath,
    templateName,
    setTemplateName,
    templateStatuses,
    setTemplateStatuses,
    hwpxCustomText,
    setHwpxCustomText,
    mapField,
    setMapField,
    customFieldName,
    setCustomFieldName,
    setDocumentOverrides,
    selectedMappingID,
    setSelectedMappingID,
    documentPeriod,
    setSelectedDocumentStudentID,
    documentStudents,
    documentStudent,
    outputStatus,
    outputTemplates,
    baseDocumentValues,
    fieldValue,
    mappedFields,
    rangeSeparators,
    chooseTemplate,
    saveTemplate,
    deleteTemplate,
    placeField,
    beginMoveMapping,
    beginResizeMapping,
    changeMappingFont,
    outputPoint,
    beginOutputMove,
    beginOutputResize,
    changeOutputFont,
    removeMapping,
    saveAttendancePDF,
    exportAttendanceHWPX,
    saveHWPXCustomValues,
  } = useAttendanceDocuments({ config, date, day, setNotice, attendanceTab, studentByID });
  return {
    date,
    setDate,
    day,
    notice,
    busy,
    templates,
    template,
    setTemplate,
    templatePath,
    templateName,
    setTemplateName,
    templateStatuses,
    setTemplateStatuses,
    hwpxCustomText,
    setHwpxCustomText,
    mapField,
    setMapField,
    customFieldName,
    setCustomFieldName,
    selectedMappingID,
    setSelectedMappingID,
    documentPeriod,
    setSelectedDocumentStudentID,
    attendanceTab,
    setAttendanceTab,
    dateInputRef,
    studentByID,
    resizeReason,
    moveDate,
    updateEntry,
    setDocumentOverrides,
    markAllPresent,
    saveAttendance,
    summary,
    documentStudents,
    documentStudent,
    outputStatus,
    outputTemplates,
    baseDocumentValues,
    mappedFields,
    fieldValue,
    rangeSeparators,
    chooseTemplate,
    saveTemplate,
    deleteTemplate,
    placeField,
    beginMoveMapping,
    beginResizeMapping,
    changeMappingFont,
    removeMapping,
    saveHWPXCustomValues,
    exportAttendanceHWPX,
    saveAttendancePDF,
    outputPoint,
    beginOutputMove,
    changeOutputFont,
    beginOutputResize,
  };
}
