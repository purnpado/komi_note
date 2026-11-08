import { useEffect, useMemo, useState } from "react";
import { ListCleaningPlans, SaveCleaningPlan } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import "./cleaning.css";

type CleaningZoneForm = {
  id: string;
  name: string;
  requiredCount: number;
  day: string;
  note: string;
};

type CleaningAssignmentForm = {
  studentId: string;
  zoneId: string;
  note: string;
};

const defaultZoneNames = ["교실 바닥", "복도", "창틀·환경", "분리수거"];

function makeZone(name: string): CleaningZoneForm {
  return {
    id: `zone-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    requiredCount: 1,
    day: "매일",
    note: "",
  };
}

function escapePrintHtml(value: string) {
  return value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] || character,
  );
}

export function CleaningPage({ students }: { students: models.Student[] }) {
  const today = new Date().toISOString().slice(0, 10);
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
      setNotice(String(error));
    }
  };

  useEffect(() => {
    void loadPlans();
  }, []);

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
      .forEach((plan) => plan.assignments.forEach((item) => {
        experienced.set(item.studentId, new Set([...(experienced.get(item.studentId) || []), item.zoneId]));
      }));
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
      const saved = new models.CleaningPlan(await SaveCleaningPlan(new models.CleaningPlan({
        id: selectedID,
        title,
        periodType,
        startDate,
        endDate,
        createdAt: selectedPlan?.createdAt || "",
        zones,
        assignments,
      })));
      setSelectedID(saved.id);
      await loadPlans();
      setNotice("청소구역 편성표를 암호화 보관함에 저장했습니다.");
    } catch (error) {
      setNotice(String(error));
    }
  }

  function printPlan() {
    const names = new Map(studentsByNumber.map((student) => [student.id, student.name]));
    const cards = zones.map((zone) => `<article><h2>${escapePrintHtml(zone.name)}</h2><small>${escapePrintHtml(zone.day || "요일 미정")} · ${zone.requiredCount}명 담당</small><p>${assignments.filter((assignment) => assignment.zoneId === zone.id).map((assignment) => escapePrintHtml(names.get(assignment.studentId) || "알 수 없음")).join(" · ") || "담당 학생 미배정"}</p>${zone.note ? `<em>${escapePrintHtml(zone.note)}</em>` : ""}</article>`).join("");
    const child = window.open("", "_blank", "width=960,height=700");
    if (!child) {
      setNotice("인쇄 창을 열지 못했습니다. 팝업 차단 설정을 확인해 주세요.");
      return;
    }
    child.document.write(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${escapePrintHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,sans-serif;color:#1e2a44}h1{text-align:center;margin:0 0 5mm}header{text-align:center;color:#76512e;margin-bottom:10mm}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}article{min-height:42mm;border:1px solid #777;border-radius:6px;padding:6mm}h2{margin:0 0 3mm;font-size:18pt}small{color:#855a31}p{font-size:14pt;font-weight:bold;line-height:1.7}em{font-size:10pt;color:#666}</style><body><h1>${escapePrintHtml(title)}</h1><header>${escapePrintHtml(periodType)} · ${escapePrintHtml(startDate || "기간 미정")}${endDate ? ` ~ ${escapePrintHtml(endDate)}` : ""}</header><main class="grid">${cards}</main><script>window.onload=()=>window.print()<\/script></body></html>`);
    child.document.close();
  }

  return <section className="cleaning-page">
    <header className="cleaning-hero"><div><p className="eyebrow">학급 운영 · 청소구역</p><h1>청소구역 편성표</h1><p>교사가 직접 배치하고, 중복과 이전 담당 이력은 경고로만 확인합니다.</p></div><div className="cleaning-actions"><button className="secondary-button" type="button" onClick={resetPlan}>새 편성표</button><button className="accent-button" type="button" onClick={() => void savePlan()}>저장</button><button className="secondary-button" type="button" onClick={printPlan}>인쇄</button></div></header>
    <details className="first-use-guide"><summary>청소구역 편성 처음 사용 안내</summary><ol><li><b>기간과 제목 설정</b><span>주간·격주·월간·직접 지정 중 운영 기간과 시작·종료일을 정합니다.</span></li><li><b>구역과 필요 인원 추가</b><span>교실·복도처럼 실제 청소구역을 만들고 구역별 필요 인원과 안내를 입력합니다.</span></li><li><b>학생 직접 편성</b><span>구역마다 학생을 직접 추가합니다. 노란 경고는 중복 배정·직전 구역·미경험 구역 확인용이며 저장을 막지 않습니다.</span></li><li><b>저장·이력·인쇄</b><span>저장한 편성표는 왼쪽 이력에서 다시 열 수 있고, 인쇄 전에 기간·구역별 인원을 확인합니다.</span></li></ol><p className="first-use-note">학생 이름과 배정 이력은 이 컴퓨터의 암호화 보관함에만 저장됩니다. 실제 학생 정보가 포함된 인쇄물은 교실 밖 공유에 주의하세요.</p></details>
    {notice && <p className="form-notice">{notice}</p>}
    <div className="cleaning-layout"><aside className="cleaning-history"><h2>편성 이력</h2><button type="button" className="history-new" onClick={resetPlan}>＋ 새 기간</button>{plans.length ? plans.map((plan) => <button type="button" key={plan.id} className={plan.id === selectedID ? "history-item active" : "history-item"} onClick={() => loadPlan(plan)}><strong>{plan.title}</strong><small>{plan.periodType} · {plan.startDate || "날짜 미정"}</small></button>) : <p>저장한 편성표가 없습니다.</p>}</aside>
      <main className="cleaning-editor"><section className="cleaning-settings"><label>편성표 제목<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>운영 기간<select value={periodType} onChange={(event) => setPeriodType(event.target.value)}><option>주간</option><option>격주</option><option>월간</option><option>직접 지정</option></select></label><label>시작일<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>종료일<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></section>
        <section className="cleaning-warnings" aria-live="polite"><strong>편성 점검</strong><span className={duplicateIDs.size ? "warning" : "ok"}>중복 배정 {duplicateIDs.size}명</span><span className={unassigned.length ? "warning" : "ok"}>미배정 {unassigned.length}명</span><span className={studentsWithUnvisitedZone ? "warning" : "ok"}>미경험 구역이 있는 학생 {studentsWithUnvisitedZone}명</span><span>{previousPlan ? `직전 이력: ${previousPlan.title}` : "직전 이력 없음"}</span></section>
        <section className="cleaning-zones">{zones.map((zone) => { const zoneAssignments = assignments.filter((assignment) => assignment.zoneId === zone.id); const difference = zone.requiredCount - zoneAssignments.length; return <article className="cleaning-zone" key={zone.id}><header><input aria-label="구역 이름" value={zone.name} onChange={(event) => setZones((current) => current.map((item) => item.id === zone.id ? { ...item, name: event.target.value } : item))}/><button type="button" aria-label="구역 삭제" onClick={() => { setZones((current) => current.filter((item) => item.id !== zone.id)); setAssignments((current) => current.filter((assignment) => assignment.zoneId !== zone.id)); }}>×</button></header><div className="zone-fields"><label>필요 인원<input type="number" min="1" max="99" value={zone.requiredCount} onChange={(event) => setZones((current) => current.map((item) => item.id === zone.id ? { ...item, requiredCount: Number(event.target.value) || 1 } : item))}/></label><label>요일<input placeholder="예: 월·수" value={zone.day} onChange={(event) => setZones((current) => current.map((item) => item.id === zone.id ? { ...item, day: event.target.value } : item))}/></label></div><input className="zone-note" placeholder="교사용 안내 또는 유의사항" value={zone.note} onChange={(event) => setZones((current) => current.map((item) => item.id === zone.id ? { ...item, note: event.target.value } : item))}/><p className={difference === 0 ? "zone-count ok" : "zone-count warning"}>{zoneAssignments.length}/{zone.requiredCount}명 {difference > 0 ? `· ${difference}명 더 필요` : difference < 0 ? `· ${-difference}명 초과` : "· 인원 충족"}</p><select value="" aria-label={`${zone.name} 담당 학생 추가`} onChange={(event) => { if (event.target.value) setAssignments((current) => [...current, { studentId: event.target.value, zoneId: zone.id, note: "" }]); event.currentTarget.value = ""; }}><option value="">학생 직접 추가…</option>{studentsByNumber.map((student) => <option key={student.id} value={student.id}>{student.number}. {student.name}</option>)}</select><ul>{zoneAssignments.map((assignment) => { const student = studentsByNumber.find((candidate) => candidate.id === assignment.studentId); const index = assignments.indexOf(assignment); return <li key={`${assignment.studentId}-${index}`}><span>{student ? `${student.number}. ${student.name}` : "명렬에서 제외된 학생"}{duplicateIDs.has(assignment.studentId) && <em className="warning">중복</em>}{previousZone.get(assignment.studentId) === zone.id && <em className="warning">직전 동일</em>}</span><button type="button" aria-label="배정 제거" onClick={() => setAssignments((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button></li>; })}</ul></article>; })}<button type="button" className="add-zone" onClick={() => setZones((current) => [...current, makeZone("새 청소구역")])}>＋ 청소구역 추가</button></section>
      </main><aside className="cleaning-students"><h2>학생 배정 현황</h2><p>{studentsByNumber.length}명 중 {studentsByNumber.length - unassigned.length}명 배정</p>{studentsByNumber.map((student) => { const studentAssignments = byStudent.get(student.id) || []; const unvisited = unvisitedCountByStudent.get(student.id) || 0; return <div key={student.id} className={duplicateIDs.has(student.id) ? "student-assignment warning-box" : "student-assignment"}><strong>{student.number}. {student.name}</strong><span>{studentAssignments.length ? studentAssignments.map((assignment) => zones.find((zone) => zone.id === assignment.zoneId)?.name || "삭제된 구역").join(" · ") : "미배정"}{unvisited > 0 && <em> · 미경험 {unvisited}구역</em>}</span></div>; })}</aside></div>
  </section>;
}
