import { main as models } from "../../../wailsjs/go/models";
import { AssessmentStatus } from "./AssessmentStatus";
import "./assessment-students.css";
import { criteriaMaxSum, importedScoreOf, isSkipped, reasonValue, scoreValue, setScore, total, visibleCriteria } from "./assessmentScores";

export type ReasonTarget = { studentID: string; studentName: string; criterionID: string; criterionName: string; value: string };

type Props = {
  assessment: models.Assessment;
  domain: models.AssessmentDomain;
  onChange: (next: models.Assessment) => void;
  onReason: (target: ReasonTarget) => void;
};

function invalid(value: number | undefined | null, max: number) {
  return value !== undefined && value !== null && (!Number.isFinite(value) || value < 0 || value > max);
}

/** 학생별 세부 점수 입력표. 전입 전에 끝난 영역은 입력 칸 대신 '전입 전'을 보여 준다. */
export function ScoreTable({ assessment, domain, onChange, onReason }: Props) {
  const criteria = visibleCriteria(domain);
  return (
    <div className="assessment-score-table-wrap">
      <table className="assessment-score-table">
        <thead>
          <tr>
            <th>번호</th><th>성명</th>
            {criteria.map((criterion) => <th key={criterion.id}>{criterion.name}<br /><small>{criterion.maxScore}점</small></th>)}
            <th>합계<br /><small>{criteria.length ? `${criteriaMaxSum(domain)}점 기준` : `${domain.maxScore}점`}</small></th>
            <th>나이스 원본<br /><small>{domain.maxScore}점</small></th>
          </tr>
        </thead>
        <tbody>
          {assessment.students.map((student) => {
            const skipped = isSkipped(student, domain.id);
            return (
              <tr key={student.id} className={student.status === "전입" ? "assessment-transfer-row" : ""}>
                <td>{student.number}</td>
                <td>
                  <span>{student.name}</span>
                  {student.status === "전입" && <em className="assessment-transfer-badge" title={student.transferIn ? `${student.transferIn} 전입` : "학기 중 전입"}>전입</em>}
                  {!skipped && <AssessmentStatus assessment={assessment} domainID={domain.id} studentID={student.id} />}
                </td>
                {skipped ? (
                  <td colSpan={criteria.length + 2} className="assessment-skipped">전입 전에 끝난 영역 · 평가하지 않음</td>
                ) : (
                  <>
                    {criteria.map((criterion) => {
                      const value = scoreValue(assessment, student.id, domain.id, criterion.id);
                      const reason = reasonValue(assessment, student.id, domain.id, criterion.id);
                      return (
                        <td key={criterion.id}>
                          <div className="assessment-score-cell">
                            <input
                              className={invalid(value, criterion.maxScore) ? "assessment-score-invalid" : ""}
                              aria-invalid={invalid(value, criterion.maxScore)}
                              title={`0~${criterion.maxScore}점`}
                              aria-label={`${student.name} ${domain.name} ${criterion.name} 점수`}
                              inputMode="decimal"
                              value={value ?? ""}
                              onChange={(event) => onChange(setScore(assessment, student.id, domain.id, criterion.id, event.target.value))}
                            />
                            <button className={reason ? "assessment-reason-button filled" : "assessment-reason-button"} onClick={() => onReason({ studentID: student.id, studentName: student.name, criterionID: criterion.id, criterionName: criterion.name, value: reason })}>
                              {reason ? "사유 작성됨" : "채점 사유"}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                    <td className={criteria.length && total(assessment, student.id, domain) > domain.maxScore ? "assessment-total-over" : ""}>
                      {criteria.length ? <><strong>{total(assessment, student.id, domain)}</strong> / {criteriaMaxSum(domain)}</> : "—"}
                    </td>
                    <td className="assessment-imported">{importedScoreOf(assessment, student.id, domain.id) ?? "—"}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
