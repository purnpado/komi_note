import { main as models } from "../../../wailsjs/go/models";
import { trimNumber } from "./recordsSlots";

export function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function AssessmentReference({
  assessments,
  roster,
  pupil,
  subject,
}: {
  assessments: models.Assessment[];
  roster: models.CourseRoster;
  pupil: { name: string; number: string };
  subject: string;
}) {
  const matches = assessments
    .filter((item) => (item.schoolYear || roster.schoolYear) === roster.schoolYear && item.grade === roster.grade && item.className === roster.className)
    .map((item) => {
      const student = item.students.find((candidate) => trimNumber(candidate.number) === trimNumber(pupil.number) && candidate.name.trim() === pupil.name.trim());
      const score = student ? item.scores.find((candidate) => candidate.studentId === student.id) : undefined;
      return { item, student, score };
    })
    .filter((match) => match.student)
    .sort((a, b) => Number(b.item.subject.trim() === subject) - Number(a.item.subject.trim() === subject));
  return (
    <details className="records-reference">
      <summary>수행평가 참고 <small>({matches.length}개 평가 · 읽기 전용)</small></summary>
      {matches.length === 0 ? (
        <p className="records-muted">이 반·이 학생의 수행평가 기록이 없습니다. 평가 관리에서 나이스 수행평가 파일을 가져오면 여기에 보입니다.</p>
      ) : (
        matches.map(({ item, score }) => (
          <div key={item.id} className="records-reference-item">
            <strong>{item.title || "수행평가"} <small>{item.subject}{item.semester ? ` · ${item.semester}학기` : ""}</small></strong>
            <ul>
              {item.domains.map((domain) => {
                const domainScore = score?.domains.find((candidate) => candidate.domainId === domain.id);
                const criteria = domain.criteria
                  .map((criterion) => ({ criterion, value: domainScore?.criteria.find((candidate) => candidate.criterionId === criterion.id) }))
                  .filter(({ value }) => value && (value.score !== null || value.reason));
                return (
                  <li key={domain.id}>
                    <span>{domain.name}</span> <b>{formatScore(domainScore?.importedScore)} / {formatScore(domain.maxScore)}</b>
                    {criteria.length > 0 && (
                      <ul>
                        {criteria.map(({ criterion, value }) => (
                          <li key={criterion.id}>
                            {criterion.name} {formatScore(value?.score)}점{value?.reason ? ` — ${value.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            {(score?.note || score?.deduction) && <p className="records-muted">{[score?.note, score?.deduction].filter(Boolean).join(" · ")}</p>}
          </div>
        ))
      )}
    </details>
  );
}
