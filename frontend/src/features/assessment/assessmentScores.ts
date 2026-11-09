import { main as models } from "../../../wailsjs/go/models";
import { isSkipped as isSkippedStudent } from "./assessmentState";
export { isSkipped, missingCount } from "./assessmentState";

// 점수표 계산 도우미(평가 화면·점수표가 함께 쓴다).
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function scoreValue(item: models.Assessment, studentID: string, domainID: string, criterionID: string) {
  return item.scores.find((score) => score.studentId === studentID)?.domains.find((domain) => domain.domainId === domainID)?.criteria.find((criterion) => criterion.criterionId === criterionID)?.score;
}
export function reasonValue(item: models.Assessment, studentID: string, domainID: string, criterionID: string) {
  return item.scores.find((score) => score.studentId === studentID)?.domains.find((domain) => domain.domainId === domainID)?.criteria.find((criterion) => criterion.criterionId === criterionID)?.reason || "";
}
export function isLegacyImportedCriterion(domain: models.AssessmentDomain, criterion: models.AssessmentCriterion) {
  return criterion.name.trim() === "영역 점수" && criterion.maxScore === domain.maxScore;
}
export function visibleCriteria(domain: models.AssessmentDomain) {
  return domain.criteria.filter((criterion) => !isLegacyImportedCriterion(domain, criterion));
}
export function setScore(item: models.Assessment, studentID: string, domainID: string, criterionID: string, raw: string) {
  const next = copy(item); let score = next.scores.find((value) => value.studentId === studentID);
  if (!score) { score = new models.AssessmentScore({ studentId: studentID, domains: [], note: "", deduction: "", updatedAt: "" }); next.scores.push(score); }
  let domain = score.domains.find((value) => value.domainId === domainID);
  if (!domain) { domain = new models.AssessmentDomainScore({ domainId: domainID, importedScore: undefined, criteria: [] }); score.domains.push(domain); }
  let criterion = domain.criteria.find((value) => value.criterionId === criterionID);
  if (!criterion) { criterion = new models.AssessmentCriterionScore({ criterionId: criterionID, score: undefined, reason: "" }); domain.criteria.push(criterion); }
  criterion.score = raw.trim() === "" ? undefined : Number(raw); return next;
}
export function setReason(item: models.Assessment, studentID: string, domainID: string, criterionID: string, reason: string) {
  const next = setScore(item, studentID, domainID, criterionID, String(scoreValue(item, studentID, domainID, criterionID) ?? ""));
  const criterion = next.scores.find((value) => value.studentId === studentID)?.domains.find((value) => value.domainId === domainID)?.criteria.find((value) => value.criterionId === criterionID);
  if (criterion) criterion.reason = reason.trim();
  return next;
}
export function total(item: models.Assessment, studentID: string, domain: models.AssessmentDomain) {
  return visibleCriteria(domain).reduce((sum, criterion) => sum + (scoreValue(item, studentID, domain.id, criterion.id) ?? 0), 0);
}

export function importedScoreOf(item: models.Assessment, studentID: string, domainID: string) {
  return item.scores.find((score) => score.studentId === studentID)?.domains.find((domain) => domain.domainId === domainID)?.importedScore;
}
export function criteriaMaxSum(domain: models.AssessmentDomain) {
  return visibleCriteria(domain).reduce((sum, criterion) => sum + (Number(criterion.maxScore) || 0), 0);
}
// invalidScore는 저장 전에 고쳐야 할 첫 번째 칸을 "3번 다온 · 발표: …" 형식으로 알려 준다.
export function invalidScore(item: models.Assessment) {
  for (const domain of item.domains) {
    for (const criterion of visibleCriteria(domain)) {
      for (const student of item.students) {
        if (isSkippedStudent(student, domain.id)) continue;
        const value = scoreValue(item, student.id, domain.id, criterion.id);
        if (value === undefined || value === null) continue;
        if (!Number.isFinite(value)) return `${student.number}번 ${student.name} · ${domain.name} ${criterion.name}: 숫자로 입력해 주세요.`;
        if (value < 0 || value > criterion.maxScore) return `${student.number}번 ${student.name} · ${domain.name} ${criterion.name}: ${value}점은 0점~${criterion.maxScore}점 범위를 벗어납니다.`;
      }
    }
  }
  return "";
}
