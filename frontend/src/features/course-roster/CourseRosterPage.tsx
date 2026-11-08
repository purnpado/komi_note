import { useEffect, useMemo, useState } from "react";
import { ListCourseRosters } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { CourseStudentDelete, CourseStudentEditor } from "./CourseStudentEditor";
import "./course-roster.css";

import { errorMessage } from "../shared/format";
export function CourseRosterPage() {
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    const load = () => void ListCourseRosters().then((items) => {
      if (active) { setRosters(items || []); setNotice(""); }
    }).catch((error) => { if (active) setNotice(errorMessage(error)); });
    load();
    const off = EventsOn("course-roster:변경", load);
    return () => { active = false; off(); };
  }, []);

  const groups = useMemo(() => {
    const grouped = new Map<string, models.CourseRoster[]>();
    for (const roster of rosters) {
      const key = `${roster.schoolYear}학년도 · ${roster.grade}학년`;
      grouped.set(key, [...(grouped.get(key) || []), roster]);
    }
    return [...grouped.entries()].sort(([, a], [, b]) => b[0].schoolYear.localeCompare(a[0].schoolYear, "ko") || a[0].grade.localeCompare(b[0].grade, "ko"));
  }, [rosters]);
  const selected = rosters.find((roster) => roster.id === selectedID) || rosters[0];

  return <div className="course-roster-page">
    <header className="course-roster-heading">
      <div><p className="course-roster-eyebrow">수업용 · 암호화 보관</p><h2>수업 명렬</h2>
        <p>학급별 학생 명렬을 한곳에서 살펴보세요.</p></div>
      <span className="course-roster-count">수업 {rosters.length}개</span>
    </header>
    <details className="course-roster-guide"><summary>처음 사용 안내</summary>
      <p>새 수행평가 파일을 가져오거나 기존 수행평가에서 ‘수업 명렬로 보내기’를 선택해 명렬을 만듭니다. 명렬이 다르면 비교 후 확인한 학생만 추가하며, 평가 점수와 이력은 별도로 유지됩니다.</p>
    </details>
    {notice && <p className="course-roster-notice" role="alert">{notice}</p>}
    {feedback && <p className="course-roster-feedback" role="status">{feedback}</p>}
    {!rosters.length ? <section className="course-roster-empty"><strong>아직 수업 명렬이 없습니다</strong>
      <p>평가 관리에서 수행평가를 가져오거나 기존 평가의 학생을 보내 주세요.</p></section> :
      <div className="course-roster-layout">
        <nav className="course-roster-nav" aria-label="수업 명렬 학급 선택">
          <h3>학년도 · 학년</h3>
          {groups.map(([group, items]) => {
            const open = expanded[group] !== false;
            return <section className="course-roster-group" key={group}>
              <button type="button" className="course-roster-group-toggle" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [group]: !open }))}>
                <span>{group} <small>{items.length}개</small></span><span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
              </button>
              {open && <div className="course-roster-classes">{items.map((roster) =>
                <button type="button" key={roster.id} aria-pressed={selected?.id === roster.id} className={selected?.id === roster.id ? "course-roster-class active" : "course-roster-class"} onClick={() => setSelectedID(roster.id)}>
                  <strong>{roster.className}</strong><span>{roster.students.length}명</span>
                </button>)}</div>}
            </section>;
          })}
        </nav>
        {selected && <section className="course-roster-detail" aria-label="선택한 수업 명렬">
          <header><div><p className="course-roster-eyebrow">{selected.schoolYear}학년도 · {selected.grade}학년</p>
            <h3>{selected.className}</h3><p>학생 명렬은 교사 보관함에 암호화되어 있습니다.</p></div>
            <div className="course-roster-detail-actions"><strong>{selected.students.length}명</strong><CourseStudentEditor key={selected.id} roster={selected} onSaved={setFeedback} /></div></header>
          <div className="course-roster-table-wrap"><table><thead><tr><th scope="col">번호</th><th scope="col">이름</th><th scope="col">상태</th><th scope="col">관리</th></tr></thead>
            <tbody>{selected.students.map((student, index) => <tr key={`${student.number}-${index}`}><td>{student.number}</td><td>{student.name}</td><td>{student.status || "재학"}</td><td><div className="course-student-actions"><CourseStudentEditor key={`edit-${selected.id}-${student.number}`} roster={selected} student={student} onSaved={setFeedback} /><CourseStudentDelete key={`delete-${selected.id}-${student.number}`} roster={selected} student={student} onSaved={setFeedback} /></div></td></tr>)}</tbody></table></div>
          <details className="course-roster-history"><summary>명렬 변경 이력</summary>{selected.changes?.length ? <ul>{[...selected.changes].reverse().map((change, index) => <li key={index}>{change.at} · {change.action} · {change.previousNumber ? `${change.previousNumber}번` : ""}{change.number ? ` → ${change.number}번` : ""}</li>)}</ul> : <p>기록된 변경이 없습니다.</p>}</details>
        </section>}
      </div>}
  </div>;
}
