import { printSheet } from "../shared/desktopActions";
import { useEffect, useMemo, useState } from "react";
import { ListCleaningPlans, SaveCleaningPlan } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { useVaultChanges } from "../shared/useVaultChanges";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage, todayLocal } from "../shared/format";

export type CleaningZoneForm = {
  id: string;
  name: string;
  requiredCount: number;
  day: string;
  note: string;
};

export type CleaningAssignmentForm = {
  studentId: string;
  zoneId: string;
  note: string;
};

export const defaultZoneNames = ["교실 바닥", "복도", "창틀·환경", "분리수거"];

export function makeZone(name: string): CleaningZoneForm {
  return {
    id: `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    requiredCount: 1,
    day: "매일",
    note: "",
  };
}

export function escapePrintHtml(value: string) {
  return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character);
}

/** 청소구역 배정 화면의 상태·불러오기·저장·인쇄 처리. 화면 JSX는 CleaningPage에 있다. */
export function useCleaningPage({ students }: { students: models.Student[] }) {
  const today = todayLocal();
  const [plans, setPlans] = useState<models.CleaningPlan[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [title, setTitle] = useState("이번 주 청소구역 편성표");
  const [periodType, setPeriodType] = useState("주간");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [zones, setZones] = useState<CleaningZoneForm[]>(() => defaultZoneNames.map(makeZone));
  const [assignments, setAssignments] = useState<CleaningAssignmentForm[]>([]);
  const [notice, setNotice] = useState("");
  const studentsByNumber = [...students].sort((left, right) => left.number - right.number);
  const selectedPlan = plans.find((plan) => plan.id === selectedID);
  const previousPlan = plans
    .filter((plan) => plan.id !== selectedID)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

  const loadPlans = async () => {
    try {
      const savedPlans = (await ListCleaningPlans()) || [];
      setPlans(savedPlans.map((plan) => new models.CleaningPlan(plan)));
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);
  // 학생 삭제·백업 되살리기 뒤 저장된 편성 목록을 다시 읽는다(편집 중인 배정은 그대로).
  useVaultChanges([changeEvents.students, changeEvents.settings], () => void loadPlans());

  const byStudent = useMemo(() => {
    const result = new Map<string, CleaningAssignmentForm[]>();
    assignments.forEach((item) => {
      result.set(item.studentId, [...(result.get(item.studentId) || []), item]);
    });
    return result;
  }, [assignments]);
  const duplicateIDs = useMemo(
    () => new Set([...byStudent.entries()].filter(([, items]) => items.length > 1).map(([id]) => id)),
    [byStudent],
  );
  const previousZone = useMemo(
    () => new Map((previousPlan?.assignments || []).map((item) => [item.studentId, item.zoneId])),
    [previousPlan],
  );
  const unvisitedCountByStudent = useMemo(() => {
    const experienced = new Map<string, Set<string>>();
    plans
      .filter((plan) => plan.id !== selectedID)
      .forEach((plan) =>
        plan.assignments.forEach((item) => {
          experienced.set(item.studentId, new Set([...(experienced.get(item.studentId) || []), item.zoneId]));
        }),
      );
    assignments.forEach((item) => {
      experienced.set(item.studentId, new Set([...(experienced.get(item.studentId) || []), item.zoneId]));
    });
    return new Map(
      studentsByNumber.map((student) => [
        student.id,
        zones.filter((zone) => !experienced.get(student.id)?.has(zone.id)).length,
      ]),
    );
  }, [plans, selectedID, assignments, studentsByNumber, zones]);
  const studentsWithUnvisitedZone = [...unvisitedCountByStudent.values()].filter((count) => count > 0).length;
  const unassigned = studentsByNumber.filter((student) => !byStudent.has(student.id));

  function loadPlan(plan: models.CleaningPlan) {
    setSelectedID(plan.id);
    setTitle(plan.title);
    setPeriodType(plan.periodType || "주간");
    setStartDate(plan.startDate || today);
    setEndDate(plan.endDate || "");
    setZones((plan.zones || []).map((item) => ({ ...item })));
    setAssignments((plan.assignments || []).map((item) => ({ ...item })));
    setNotice(`“${plan.title}” 편성표를 불러왔습니다.`);
  }

  function resetPlan() {
    setSelectedID("");
    setTitle("이번 주 청소구역 편성표");
    setPeriodType("주간");
    setStartDate(today);
    setEndDate("");
    setZones(defaultZoneNames.map(makeZone));
    setAssignments([]);
    setNotice("새 편성표입니다. 구역별로 학생을 직접 추가해 주세요.");
  }

  async function savePlan() {
    if (!title.trim() || !zones.length) {
      setNotice("편성표 제목과 청소구역을 입력해 주세요.");
      return;
    }
    try {
      const saved = new models.CleaningPlan(
        await SaveCleaningPlan(
          new models.CleaningPlan({
            id: selectedID,
            title,
            periodType,
            startDate,
            endDate,
            createdAt: selectedPlan?.createdAt || "",
            zones,
            assignments,
          }),
        ),
      );
      setSelectedID(saved.id);
      await loadPlans();
      setNotice("청소구역 편성표를 암호화 보관함에 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  function printPlan() {
    const names = new Map(studentsByNumber.map((student) => [student.id, student.name]));
    const cards = zones
      .map(
        (zone) =>
          `<article><h2>${escapePrintHtml(zone.name)}</h2><small>${escapePrintHtml(zone.day || "요일 미정")} · ${zone.requiredCount}명 담당</small><p>${
            assignments
              .filter((assignment) => assignment.zoneId === zone.id)
              .map((assignment) => escapePrintHtml(names.get(assignment.studentId) || "알 수 없음"))
              .join(" · ") || "담당 학생 미배정"
          }</p>${zone.note ? `<em>${escapePrintHtml(zone.note)}</em>` : ""}</article>`,
      )
      .join("");
    const p = ".print-sheet";
    const css = `@page{size:A4 landscape;margin:12mm}${p}{font-family:Arial,sans-serif;color:#1e2a44}${p} h1{text-align:center;margin:0 0 5mm}${p} header{text-align:center;color:#76512e;margin-bottom:10mm}${p} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;background:#fff;padding:0}${p} article{background:#fff;min-height:42mm;border:1px solid #777;border-radius:6px;padding:6mm;break-inside:avoid}${p} h2{margin:0 0 3mm;font-size:18pt}${p} small{color:#855a31}${p} p{font-size:14pt;font-weight:bold;line-height:1.7}${p} em{font-size:10pt;color:#666}`;
    void printSheet(
      `<h1>${escapePrintHtml(title)}</h1><header>${escapePrintHtml(periodType)} · ${escapePrintHtml(startDate || "기간 미정")}${endDate ? ` ~ ${escapePrintHtml(endDate)}` : ""}</header><main class="grid">${cards}</main>`,
      css,
    ).catch(() => setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."));
  }

  return {
    students,
    today,
    plans,
    setPlans,
    selectedID,
    setSelectedID,
    title,
    setTitle,
    periodType,
    setPeriodType,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    zones,
    setZones,
    assignments,
    setAssignments,
    notice,
    setNotice,
    studentsByNumber,
    selectedPlan,
    previousPlan,
    loadPlans,
    byStudent,
    duplicateIDs,
    previousZone,
    unvisitedCountByStudent,
    studentsWithUnvisitedZone,
    unassigned,
    loadPlan,
    resetPlan,
    savePlan,
    printPlan,
  };
}
