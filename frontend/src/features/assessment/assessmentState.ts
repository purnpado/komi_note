import type { main as models } from "../../../wailsjs/go/models";

export function mergeAssessmentEvent(current: models.Assessment, fresh: models.Assessment): models.Assessment {
  // 학생 명단은 전입생 추가로만 바뀌므로 새 값을 쓴다(입력 중인 점수는 그대로 둔다).
  return { ...current, students: fresh.students, history: fresh.history, objections: fresh.objections } as models.Assessment;
}

export function confirmationStatus(assessment: models.Assessment, domainID: string, studentID: string) {
  const history = assessment.history || [];
  if ((assessment.objections || []).some((item) => item.studentId === studentID && item.domainId === domainID)) return { type: "objection", label: "이의 제출" };
  if (history.some((item) => item.type === "확인완료" && item.domainId === domainID && item.studentId === studentID)) return { type: "confirmed", label: "✓ 확인" };
  if (history.some((item) => item.type === "확인완료" && !item.domainId && item.studentId === studentID)) return { type: "unknown", label: "이전 확인 · 영역 불명" };
  return { type: "pending", label: "미확인" };
}

type StudentLike = { id: string; status?: string; skippedDomains?: string[] };

/** 전입 전에 끝난 영역이면 이 학생은 그 영역을 평가하지 않는다. */
export function isSkipped(student: StudentLike, domainID: string) {
  return (student.skippedDomains || []).includes(domainID);
}

/** 현재 영역 미입력 칸 수(전입 전 영역은 세지 않음). */
export function missingCount(students: StudentLike[], domainID: string, criterionIDs: string[], has: (studentID: string, criterionID: string) => boolean) {
  return students.reduce((count, student) => (isSkipped(student, domainID) ? count : count + criterionIDs.filter((id) => !has(student.id, id)).length), 0);
}

/** 전입생 추가 창의 기본값: 이미 점수가 하나라도 입력된 영역은 '끝난 영역'으로 미리 고른다. */
export function defaultSkippedDomains(assessment: { domains: { id: string }[]; scores: { domains: { domainId: string; criteria: { score?: number | null }[]; importedScore?: number | null }[] }[] }) {
  return assessment.domains.map((d) => d.id).filter((id) => assessment.scores.some((score) => score.domains.some((domain) => domain.domainId === id && (domain.importedScore != null || domain.criteria.some((c) => c.score != null)))));
}

export function nextStudentNumber(students: { number: string }[]) {
  const numbers = students.map((s) => Number.parseInt(s.number, 10)).filter(Number.isFinite);
  return String((numbers.length ? Math.max(...numbers) : 0) + 1);
}
