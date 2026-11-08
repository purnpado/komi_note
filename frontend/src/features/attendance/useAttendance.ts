import { MouseEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { DeleteAttendanceTemplate, ExportAttendanceHWPX, GetAttendance, GetAttendanceDocumentPeriod, ListAttendanceTemplates, SaveAttendance, SaveAttendancePDF, SaveAttendanceTemplate, SaveAttendanceTemplateCustomValues, SaveAttendanceTemplateMappings, SelectAttendanceTemplateFile } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { DocumentPointLayout } from "./attendanceTypes";
import { koreanDate, parseHWPXCustomValues } from "./attendanceUtils";

import { errorMessage, toLocalDateString, todayLocal } from "../shared/format";
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

export function useAttendance({ students, config, initialDate = "" }: UseAttendanceParams) {
  const [date, setDate] = useState(() => nearestWeekday(todayLocal()));
  const [day, setDay] = useState<models.AttendanceDay | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<models.AttendanceTemplate[]>([]);
  const [template, setTemplate] = useState<models.AttendanceTemplate | null>(
    null,
  );
  const [templatePath, setTemplatePath] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateStatuses, setTemplateStatuses] = useState<string[]>(["결석"]);
  const [hwpxCustomText, setHwpxCustomText] = useState("");
  const [mapField, setMapField] = useState("성명");
  const [customFieldName, setCustomFieldName] = useState("");
  const [documentOverrides, setDocumentOverrides] = useState<
    Record<string, string>
  >({});
  const [documentLayoutOverrides, setDocumentLayoutOverrides] = useState<
    Record<string, DocumentPointLayout>
  >({});
  const [selectedMappingID, setSelectedMappingID] = useState("");
  const [documentPeriod, setDocumentPeriod] =
    useState<models.AttendanceDocumentPeriod | null>(null);
  const [selectedDocumentStudentID, setSelectedDocumentStudentID] = useState("");
  const [attendanceTab, setAttendanceTab] = useState<
    "출결 입력" | "출결 서식" | "출결 서류 출력"
  >("출결 입력");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const studentByID = useMemo(
    () => new Map((students || []).map((student) => [student.id, student])),
    [students],
  );
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
      document
        .querySelectorAll<HTMLTextAreaElement>(
          ".attendance-editor-row textarea",
        )
        .forEach(resizeReason);
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
  function updateEntry(
    studentID: string,
    updates: Partial<models.AttendanceEntry>,
  ) {
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
    for (const entry of day?.entries || [])
      counts[entry.status] = (counts[entry.status] || 0) + 1;
    return counts;
  }, [day]);
  const documentStudents = useMemo(
    () =>
      (day?.entries || [])
        .filter((entry) => entry.status !== "출석" && entry.status !== "교외체험학습")
        .map((entry) => studentByID.get(entry.studentId))
        .filter((student): student is models.Student => Boolean(student)),
    [day, studentByID],
  );
  const documentStudent = useMemo(
    () => documentStudents.find((student) => student.id === selectedDocumentStudentID) || documentStudents[0],
    [documentStudents, selectedDocumentStudentID],
  );
  useEffect(() => {
    if (documentStudent && documentStudent.id !== selectedDocumentStudentID) setSelectedDocumentStudentID(documentStudent.id);
  }, [documentStudent, selectedDocumentStudentID]);
  const dailyDocumentEntry = day?.entries.find(
    (entry) => entry.studentId === documentStudent?.id,
  );
  useEffect(() => {
    setDocumentPeriod(null);
    if (
      !documentStudent ||
      !dailyDocumentEntry ||
      dailyDocumentEntry.status === "출석"
    )
      return;
    GetAttendanceDocumentPeriod(documentStudent.id, date)
      .then((item) =>
        setDocumentPeriod(new models.AttendanceDocumentPeriod(item)),
      )
      .catch(() => setDocumentPeriod(null));
  }, [documentStudent?.id, dailyDocumentEntry?.status, date]);
  const documentEntry = documentPeriod?.entry || dailyDocumentEntry;
  const outputStatus = documentEntry?.status || "";
  const outputTemplates = useMemo(
    () =>
      templates.filter(
        (item) =>
          (item.statuses || []).length === 0 ||
          (item.statuses || []).includes(outputStatus),
      ),
    [templates, outputStatus],
  );
  useEffect(() => {
    if (
      attendanceTab !== "출결 서류 출력" ||
      !outputStatus ||
      outputStatus === "출석"
    )
      return;
    setTemplate((current) =>
      outputTemplates.some((item) => item.id === current?.id)
        ? current
        : outputTemplates[0] || null,
    );
  }, [attendanceTab, outputStatus, outputTemplates]);
  const koreanDate = (value: string) => {
    const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return matched ? `${matched[1]}년 ${matched[2]}월 ${matched[3]}일` : value;
  };
  const baseDocumentValues: Record<string, string> = {
    성명: documentStudent?.name || "학생 선택 필요",
    "학년·반·번호":
      documentStudent && config
        ? `${config.grade}학년 ${config.classNumber}반 ${documentStudent.number}번`
        : "",
    학번: documentStudent?.studentId || "",
    "출결 종류": documentEntry?.status || "",
    "사유 구분": documentEntry?.reasonCategory || "",
    "상세 사유": documentEntry?.reason || "",
    교시: documentEntry?.period || "",
    시작일: documentPeriod?.startDate
      ? koreanDate(documentPeriod.startDate)
      : "",
    종료일: documentPeriod?.endDate ? koreanDate(documentPeriod.endDate) : "",
    수업일수: documentPeriod?.schoolDays
      ? `${documentPeriod.schoolDays}일간`
      : "",
  };
  const documentValues: Record<string, string> = {
    ...baseDocumentValues,
    ...documentOverrides,
  };
  const fieldValue = (field: string) =>
    field === "담임교사"
      ? (documentOverrides[field] ?? config?.teacherLabel ?? "")
      : documentValues[field] || "";
  const mappedFields = useMemo(
    () =>
      Array.from(
        new Set((template?.mappings || []).map((point) => point.field)),
      ),
    [template],
  );
  useEffect(() => {
    setDocumentOverrides({});
    setDocumentLayoutOverrides({});
  }, [date, documentStudent?.id, template?.id]);
  useEffect(() => {
    if (template?.format !== "hwpx") {
      setHwpxCustomText("");
      return;
    }
    setHwpxCustomText(
      Object.entries(template.customValues || {})
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
    );
  }, [template?.id, template?.format]);
  const rangeSeparators = useMemo(() => {
    if (!documentPeriod?.endDate) return [];
    const starts = (template?.mappings || []).filter(
      (point) => point.field === "시작일",
    );
    const ends = (template?.mappings || []).filter(
      (point) => point.field === "종료일",
    );
    return starts
      .map((start, index) => {
        const end = ends[index];
        return end
          ? { id: `${start.id || index}-${end.id || index}`, start, end }
          : null;
      })
      .filter(
        (
          point,
        ): point is {
          id: string;
          start: models.AttendanceFieldPoint;
          end: models.AttendanceFieldPoint;
        } => point !== null,
      );
  }, [template, documentPeriod?.endDate]);
  async function chooseTemplate() {
    try {
      const path = await SelectAttendanceTemplateFile();
      if (path) {
        setTemplatePath(path);
        setTemplateName(
          path
            .split(/[/\\]/)
            .pop()
            ?.replace(/\.[^.]+$/, "") || "결석계 양식",
        );
      }
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function saveTemplate() {
    try {
      const saved = new models.AttendanceTemplate(
        await SaveAttendanceTemplate(
          templateName,
          templatePath,
          templateStatuses,
        ),
      );
      setTemplates((items) => [saved, ...items]);
      setTemplate(saved);
      setTemplatePath("");
      setTemplateName("");
      setTemplateStatuses(["결석"]);
      setNotice("학교별 출결 서식과 적용 출결 상태를 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function deleteTemplate(id: string) {
    try {
      await DeleteAttendanceTemplate(id);
      setTemplates((items) => items.filter((item) => item.id !== id));
      if (template?.id === id) setTemplate(null);
      setNotice("등록한 출결 서식과 좌표 설정을 삭제했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function placeField(event: MouseEvent<HTMLDivElement>) {
    if (!template?.previewData) return;
    const field = mapField === "__직접입력" ? customFieldName.trim() : mapField;
    if (!field) {
      setNotice("직접 입력 항목의 이름을 입력해 주세요.");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const point = new models.AttendanceFieldPoint({
      id: crypto.randomUUID(),
      field,
      x: Math.min(86, ((event.clientX - rect.left) / rect.width) * 100),
      y: Math.min(95, ((event.clientY - rect.top) / rect.height) * 100),
      width: 14,
      height: 5,
      fontSize: 1.8,
      format: "기본",
    });
    const next = new models.AttendanceTemplate({
      ...template,
      mappings: [...(template.mappings || []), point],
    });
    try {
      const saved = new models.AttendanceTemplate(
        await SaveAttendanceTemplateMappings(next.id, next.mappings),
      );
      setTemplate(saved);
      setTemplates((items) =>
        items.map((item) => (item.id === saved.id ? saved : item)),
      );
      setSelectedMappingID(point.id);
      setNotice(
        `${field} 항목 위치를 추가했습니다. 같은 항목도 필요한 곳마다 다시 배치할 수 있습니다.`,
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function persistTemplateMappings(
    source: models.AttendanceTemplate,
    mappings: models.AttendanceFieldPoint[],
    message: string,
  ) {
    try {
      const saved = new models.AttendanceTemplate(
        await SaveAttendanceTemplateMappings(source.id, mappings),
      );
      setTemplate(saved);
      setTemplates((items) =>
        items.map((item) => (item.id === saved.id ? saved : item)),
      );
      setNotice(message);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function beginMoveMapping(
    event: ReactPointerEvent<HTMLSpanElement>,
    point: models.AttendanceFieldPoint,
  ) {
    if (event.button !== 0 || !template) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedMappingID(point.id);
    const canvas = event.currentTarget.closest(
      ".template-canvas",
    ) as HTMLDivElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const source = template;
    let latestMappings = source.mappings || [];
    const move = (moveEvent: PointerEvent) => {
      const x = Math.max(
        0,
        Math.min(
          100 - (point.width || 14),
          point.x + ((moveEvent.clientX - startX) / rect.width) * 100,
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          100 - (point.height || 5),
          point.y + ((moveEvent.clientY - startY) / rect.height) * 100,
        ),
      );
      latestMappings = latestMappings.map((item) =>
        item.id === point.id
          ? new models.AttendanceFieldPoint({ ...item, x, y })
          : item,
      );
      const next = new models.AttendanceTemplate({
        ...source,
        mappings: latestMappings,
      });
      setTemplate(next);
      setTemplates((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      void persistTemplateMappings(
        source,
        latestMappings,
        "입력 항목 위치를 저장했습니다.",
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }
  function beginResizeMapping(
    event: ReactPointerEvent<HTMLSpanElement>,
    point: models.AttendanceFieldPoint,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!template) return;
    const canvas = event.currentTarget.closest(
      ".template-canvas",
    ) as HTMLDivElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalWidth = point.width || 14;
    const originalHeight = point.height || 5;
    const source = template;
    let latestMappings = source.mappings || [];
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(
        2,
        Math.min(
          90 - point.x,
          originalWidth + ((moveEvent.clientX - startX) / rect.width) * 100,
        ),
      );
      const height = Math.max(
        2,
        Math.min(
          30,
          100 - point.y,
          originalHeight + ((moveEvent.clientY - startY) / rect.height) * 100,
        ),
      );
      latestMappings = latestMappings.map((item) =>
        item.id === point.id
          ? new models.AttendanceFieldPoint({ ...item, width, height })
          : item,
      );
      const next = new models.AttendanceTemplate({
        ...source,
        mappings: latestMappings,
      });
      setTemplate(next);
      setTemplates((items) =>
        items.map((item) => (item.id === next.id ? next : item)),
      );
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      void persistTemplateMappings(
        source,
        latestMappings,
        "입력 항목 크기를 저장했습니다.",
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }
  function changeMappingFont(
    point: models.AttendanceFieldPoint,
    delta: number,
  ) {
    if (!template) return;
    const fontSize = Math.max(
      0.8,
      Math.min(6, Number(((point.fontSize || 1.8) + delta).toFixed(1))),
    );
    const mappings = (template.mappings || []).map((item) =>
      item.id === point.id
        ? new models.AttendanceFieldPoint({ ...item, fontSize })
        : item,
    );
    void persistTemplateMappings(
      template,
      mappings,
      "입력 항목 글씨 크기를 저장했습니다.",
    );
  }
  const outputPoint = (point: models.AttendanceFieldPoint) => ({
    ...point,
    ...(documentLayoutOverrides[point.id] || {}),
    width: documentLayoutOverrides[point.id]?.width ?? point.width ?? 14,
    height: documentLayoutOverrides[point.id]?.height ?? point.height ?? 5,
    fontSize:
      documentLayoutOverrides[point.id]?.fontSize ?? point.fontSize ?? 1.8,
  });
  function beginOutputMove(
    event: ReactPointerEvent<HTMLSpanElement>,
    point: models.AttendanceFieldPoint,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest(
      ".template-canvas",
    ) as HTMLDivElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const initial = outputPoint(point);
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const x = Math.max(
        0,
        Math.min(
          100 - initial.width,
          initial.x + ((moveEvent.clientX - startX) / rect.width) * 100,
        ),
      );
      const y = Math.max(
        0,
        Math.min(
          100 - initial.height,
          initial.y + ((moveEvent.clientY - startY) / rect.height) * 100,
        ),
      );
      setDocumentLayoutOverrides((items) => ({
        ...items,
        [point.id]: { ...initial, x, y },
      }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }
  function beginOutputResize(
    event: ReactPointerEvent<HTMLSpanElement>,
    point: models.AttendanceFieldPoint,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest(
      ".template-canvas",
    ) as HTMLDivElement | null;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const initial = outputPoint(point);
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(
        2,
        Math.min(
          90 - initial.x,
          initial.width + ((moveEvent.clientX - startX) / rect.width) * 100,
        ),
      );
      const height = Math.max(
        2,
        Math.min(
          30,
          100 - initial.y,
          initial.height + ((moveEvent.clientY - startY) / rect.height) * 100,
        ),
      );
      setDocumentLayoutOverrides((items) => ({
        ...items,
        [point.id]: { ...initial, width, height },
      }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }
  function changeOutputFont(point: models.AttendanceFieldPoint, delta: number) {
    const current = outputPoint(point);
    const fontSize = Math.max(
      0.8,
      Math.min(6, Number((current.fontSize + delta).toFixed(1))),
    );
    setDocumentLayoutOverrides((items) => ({
      ...items,
      [point.id]: { ...current, fontSize },
    }));
  }
  async function removeMapping(pointID: string) {
    if (!template) return;
    try {
      const saved = new models.AttendanceTemplate(
        await SaveAttendanceTemplateMappings(
          template.id,
          (template.mappings || []).filter((point) => point.id !== pointID),
        ),
      );
      setTemplate(saved);
      setTemplates((items) =>
        items.map((item) => (item.id === saved.id ? saved : item)),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function buildAttendancePDFData() {
    if (!template?.previewData || !documentStudent) {
      setNotice("출결 입력을 저장한 뒤, 출력할 양식을 선택해 주세요.");
      return;
    }
    const image = new Image();
    image.src = template.previewData;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("출결 서식 미리보기를 불러오지 못했습니다"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("출결 서류를 그릴 수 없습니다");
    context.drawImage(image, 0, 0);
    context.textBaseline = "middle";
    for (const point of template.mappings || []) {
      const value = fieldValue(point.field);
      if (!value) continue;
      const layout = outputPoint(point);
      const fontSize = Math.max(
        14,
        Math.round(canvas.width * (layout.fontSize / 100)),
      );
      const x = (layout.x / 100) * canvas.width;
      const y = ((layout.y + layout.height / 2) / 100) * canvas.height;
      const width = (layout.width / 100) * canvas.width;
      context.fillStyle = "#111111";
      context.font = `700 ${fontSize}px Pretendard, Malgun Gothic, sans-serif`;
      context.save();
      context.beginPath();
      context.rect(x, y - fontSize, width, fontSize * 2);
      context.clip();
      context.fillText(value, x, y);
      context.restore();
    }
    for (const separator of rangeSeparators) {
      const start = outputPoint(separator.start);
      const end = outputPoint(separator.end);
      const fontSize = Math.max(
        14,
        Math.round(canvas.width * (start.fontSize / 100)),
      );
      context.font = `700 ${fontSize}px Pretendard, Malgun Gothic, sans-serif`;
      const startX = (start.x / 100) * canvas.width;
      const endX = (end.x / 100) * canvas.width;
      const startRight =
        startX +
        context.measureText(fieldValue("시작일")).width +
        fontSize * 0.35;
      const endLeft = endX - fontSize * 0.35;
      if (endLeft <= startRight) continue;
      context.fillStyle = "#111111";
      context.fillText(
        "~",
        (startRight + endLeft) / 2,
        ((start.y + start.height / 2 + (end.y + end.height / 2)) / 200) *
          canvas.height,
      );
    }
    return canvas.toDataURL("image/png");
  }
  async function saveAttendancePDF() {
    try {
      const pageData = await buildAttendancePDFData();
      if (!pageData || !documentStudent || !template) return;
      const savedPath = await SaveAttendancePDF(
        pageData,
        `${date}_${documentStudent.number}번_${documentStudent.name}_${template.name}.pdf`,
      );
      if (savedPath)
        setNotice("머릿말·꼬릿말 없는 단일 PDF를 저장하고 열었습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function exportAttendanceHWPX() {
    try {
      if (!documentStudent || !template || template.format !== "hwpx") return;
      const saved = await ExportAttendanceHWPX(template.id, documentStudent.id, date);
      if (!saved?.path) return;
      setNotice(
        saved.unresolved?.length
          ? `HWPX 서류를 저장했습니다. 서식에서 직접 채울 항목: ${saved.unresolved.map((item) => `{{${item}}}`).join(", ")}`
          : "HWPX 서류를 저장했습니다. 한글 프로그램에서 열어 내용을 확인해 주세요.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function saveHWPXCustomValues() {
    try {
      if (!template || template.format !== "hwpx") return;
      const saved = new models.AttendanceTemplate(
        await SaveAttendanceTemplateCustomValues(
          template.id,
          parseHWPXCustomValues(hwpxCustomText),
        ),
      );
      setTemplate(saved);
      setTemplates((items) => items.map((item) => (item.id === saved.id ? saved : item)));
      setNotice("이 HWPX 양식에만 적용할 기타 치환값을 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  return {
    date, setDate, day, notice, busy, templates, template, setTemplate, templatePath, templateName, setTemplateName, templateStatuses, setTemplateStatuses,
    hwpxCustomText, setHwpxCustomText, mapField, setMapField, customFieldName, setCustomFieldName, selectedMappingID, setSelectedMappingID,
    documentPeriod, setSelectedDocumentStudentID, attendanceTab, setAttendanceTab, dateInputRef, studentByID, resizeReason, moveDate, updateEntry, setDocumentOverrides,
    markAllPresent, saveAttendance, summary, documentStudents, documentStudent, outputStatus, outputTemplates, baseDocumentValues, mappedFields,
    fieldValue, rangeSeparators, chooseTemplate, saveTemplate, deleteTemplate, placeField, beginMoveMapping, beginResizeMapping, changeMappingFont,
    removeMapping, saveHWPXCustomValues, exportAttendanceHWPX, saveAttendancePDF, outputPoint, beginOutputMove, changeOutputFont, beginOutputResize,
  };
}
