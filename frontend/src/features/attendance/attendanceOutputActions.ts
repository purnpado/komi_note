import { PointerEvent as ReactPointerEvent } from "react";
import { ExportAttendanceHWPX, SaveAttendancePDF, SaveAttendanceTemplateCustomValues } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { parseHWPXCustomValues } from "./attendanceUtils";
import { errorMessage } from "../shared/format";
import type { AttendanceDocumentsView } from "./useAttendanceDocuments";

/** useAttendanceDocuments에서 떼어 낸 처리 함수 묶음(훅 없음). 상태는 view로 받는다. */
export function attendanceOutputActions(view: AttendanceDocumentsView) {
  const { date, setNotice, setTemplates, template, setTemplate, hwpxCustomText, documentLayoutOverrides, setDocumentLayoutOverrides, documentStudent, fieldValue, rangeSeparators } = view;
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
  return { outputPoint, beginOutputMove, beginOutputResize, changeOutputFont, buildAttendancePDFData, saveAttendancePDF, exportAttendanceHWPX, saveHWPXCustomValues };
}
