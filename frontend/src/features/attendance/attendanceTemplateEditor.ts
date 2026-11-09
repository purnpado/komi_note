import { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { DeleteAttendanceTemplate, SaveAttendanceTemplate, SaveAttendanceTemplateMappings, SelectAttendanceTemplateFile } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";
import type { AttendanceDocumentsView } from "./useAttendanceDocuments";

/** useAttendanceDocuments에서 떼어 낸 처리 함수 묶음(훅 없음). 상태는 view로 받는다. */
export function attendanceTemplateEditor(view: AttendanceDocumentsView) {
  const { setNotice, setTemplates, template, setTemplate, templatePath, setTemplatePath, templateName, setTemplateName, templateStatuses, setTemplateStatuses, mapField, customFieldName, setSelectedMappingID } = view;
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
  return { chooseTemplate, saveTemplate, deleteTemplate, placeField, persistTemplateMappings, beginMoveMapping, beginResizeMapping, changeMappingFont, removeMapping };
}
