import type { main as models } from "../../../wailsjs/go/models";

export function mergeAssessmentEvent(current: models.Assessment, fresh: models.Assessment): models.Assessment {
  return { ...current, history: fresh.history, objections: fresh.objections } as models.Assessment;
}

export function confirmationStatus(assessment: models.Assessment, domainID: string, studentID: string) {
  const history = assessment.history || [];
  if ((assessment.objections || []).some((item) => item.studentId === studentID && item.domainId === domainID)) return { type: "objection", label: "이의 제출" };
  if (history.some((item) => item.type === "확인완료" && item.domainId === domainID && item.studentId === studentID)) return { type: "confirmed", label: "✓ 확인" };
  if (history.some((item) => item.type === "확인완료" && !item.domainId && item.studentId === studentID)) return { type: "unknown", label: "이전 확인 · 영역 불명" };
  return { type: "pending", label: "미확인" };
}
