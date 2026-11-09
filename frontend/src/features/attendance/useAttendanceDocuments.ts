import { useEffect, useMemo, useState } from "react";
import { GetAttendanceDocumentPeriod } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { DocumentPointLayout } from "./attendanceTypes";
import { koreanDate } from "./attendanceUtils";
import type { UseAttendanceShared } from "./useAttendance";
import { attendanceTemplateEditor } from "./attendanceTemplateEditor";
import { attendanceOutputActions } from "./attendanceOutputActions";

/** useAttendance에서 떼어 낸 부분. 필요한 값은 shared로 받는다. */
/** useAttendanceDocuments의 상태·계산 부분 */
export function useAttendanceDocumentsState(shared: UseAttendanceShared) {
  const { config, date, day, setNotice, attendanceTab, studentByID } = shared;
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
  return { config, date, day, setNotice, attendanceTab, studentByID, templates, setTemplates, template, setTemplate, templatePath, setTemplatePath, templateName, setTemplateName, templateStatuses, setTemplateStatuses, hwpxCustomText, setHwpxCustomText, mapField, setMapField, customFieldName, setCustomFieldName, documentOverrides, setDocumentOverrides, documentLayoutOverrides, setDocumentLayoutOverrides, selectedMappingID, setSelectedMappingID, documentPeriod, setDocumentPeriod, selectedDocumentStudentID, setSelectedDocumentStudentID, documentStudents, documentStudent, dailyDocumentEntry, documentEntry, outputStatus, outputTemplates, koreanDate, baseDocumentValues, documentValues, fieldValue, mappedFields, rangeSeparators };
}

/** 처리 함수 묶음이 받는 값: 상태 훅 결과 + 공유 값 */
export type AttendanceDocumentsView = ReturnType<typeof useAttendanceDocumentsState> & Parameters<typeof useAttendanceDocumentsState>[0];

export function useAttendanceDocuments(shared: UseAttendanceShared) {
  const state = useAttendanceDocumentsState(shared);
  const view = { ...shared, ...state };
  const attendanceTemplateEditorResult = attendanceTemplateEditor(view);
  const attendanceOutputActionsResult = attendanceOutputActions(view);
  return { ...state, ...attendanceTemplateEditorResult, ...attendanceOutputActionsResult };
}
