import type { main as models } from "../../../wailsjs/go/models";
import { confirmationStatus } from "./assessmentState";
import "./assessment-status.css";

export function AssessmentStatus({
  assessment,
  domainID,
  studentID,
}: {
  assessment: models.Assessment;
  domainID: string;
  studentID: string;
}) {
  const status = confirmationStatus(assessment, domainID, studentID);
  return (
    <span className={`assessment-status ${status.type}`} aria-label={`현재 영역 확인 상태: ${status.label}`}>
      {status.label}
    </span>
  );
}
