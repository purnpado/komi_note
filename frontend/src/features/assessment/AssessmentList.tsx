import { useEffect, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import "./assessment-list.css";

const grades = ["1", "2", "3", ""];

export function GradeSelect({ value, onChange }: { value: string; onChange: (grade: string) => void }) {
  return <label className="assessment-grade-field">학년
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">학년 미지정</option>
      <option value="1">1학년</option>
      <option value="2">2학년</option>
      <option value="3">3학년</option>
    </select>
  </label>;
}

export function AssessmentList({ items, selected, onSelect }: {
  items: models.Assessment[];
  selected: models.Assessment | null;
  onSelect: (item: models.Assessment) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (selected) setExpanded((current) => ({ ...current, [selected.grade || ""]: true }));
  }, [selected?.id, selected?.grade]);

  return <div className="assessment-grade-list">
    {grades.map((grade) => {
      const group = items.filter((item) => (item.grade || "") === grade);
      if (!group.length) return null;
      const open = !!expanded[grade];
      return <section key={grade || "none"} className="assessment-grade-group">
        <button type="button" className="assessment-grade-toggle" aria-expanded={open}
          onClick={() => setExpanded((current) => ({ ...current, [grade]: !current[grade] }))}>
          <span>{grade ? `${grade}학년` : "학년 미지정"} <small>{group.length}개</small></span>
          <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
        </button>
        {open && <div className="assessment-item-list">{group.map((item) =>
          <button key={item.id} className={selected?.id === item.id ? "assessment-item selected" : "assessment-item"} onClick={() => onSelect(item)}>
            <strong title={item.title}>{item.title}</strong>
            <small>{item.subject} · {item.className} · {item.students.length}명</small>
          </button>)}</div>}
      </section>;
    })}
  </div>;
}
