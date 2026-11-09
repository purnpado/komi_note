import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { PreviewExistingCourseRoster, TransferExistingCourseRoster } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { GradeSelect } from "./AssessmentList";
import "./roster-transfer.css";

export function SendCourseRosterDialog({
  assessment,
  onComplete,
}: {
  assessment: models.Assessment;
  onComplete: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(assessment.schoolYear || "");
  const [grade, setGrade] = useState(assessment.grade || "");
  const [comparison, setComparison] = useState<models.CourseRosterPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function compare() {
    setBusy(true);
    setError("");
    setComparison(null);
    try {
      setComparison(await PreviewExistingCourseRoster(assessment.id, year, grade));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!comparison) return;
    setBusy(true);
    setError("");
    try {
      const result = await TransferExistingCourseRoster(
        assessment.id,
        year,
        grade,
        comparison,
        comparison.status === "차이",
      );
      setOpen(false);
      setComparison(null);
      onComplete(result.message);
    } catch (reason) {
      setComparison(null);
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setComparison(null);
          setError("");
        }
      }}
    >
      <Dialog.Trigger asChild>
        <button className="quiet-button">수업 명렬로 보내기</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
        <Dialog.Content className="dialog-content assessment-dialog roster-transfer-dialog">
          <header className="assessment-dialog-header">
            <div>
              <p className="roster-transfer-eyebrow">기존 평가 · 안전한 명렬 보내기</p>
              <Dialog.Title>수업 명렬로 보내기</Dialog.Title>
              <Dialog.Description>
                학생 정보만 보냅니다. 기존 평가의 점수와 확인 이력은 그대로 유지됩니다.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="assessment-dialog-close" aria-label="닫기">
                ×
              </button>
            </Dialog.Close>
          </header>
          <div className="roster-transfer-body">
            <ol className="roster-transfer-steps" aria-label="명렬 보내기 순서">
              <li className={!comparison ? "current" : ""}>
                <span>1</span>정보 확인
              </li>
              <li className={comparison ? "current" : ""}>
                <span>2</span>명렬 비교
              </li>
              <li>
                <span>3</span>확인 후 반영
              </li>
            </ol>
            <section className="roster-transfer-section">
              <h3>어느 수업의 명렬인가요?</h3>
              <p>학년도와 학년을 확인해 주세요. 반과 학생은 현재 평가에서 가져옵니다.</p>
              <div className="roster-transfer-fields">
                <label className="assessment-field">
                  학년도
                  <input
                    inputMode="numeric"
                    value={year}
                    placeholder="예: 2026"
                    onChange={(event) => {
                      setYear(event.target.value);
                      setComparison(null);
                    }}
                  />
                </label>
                <GradeSelect
                  value={grade}
                  onChange={(value) => {
                    setGrade(value);
                    setComparison(null);
                  }}
                />
              </div>
              <div className="roster-transfer-summary">
                <span>
                  반 <strong>{assessment.className}</strong>
                </span>
                <span>
                  보낼 학생 <strong>{assessment.students.length}명</strong>
                </span>
              </div>
              <details className="roster-transfer-students">
                <summary>보낼 학생 확인</summary>
                <ul>
                  {assessment.students.map((student) => (
                    <li key={student.id}>
                      {student.number}번 {student.name}
                    </li>
                  ))}
                </ul>
              </details>
            </section>
            <section className="roster-transfer-section">
              <h3>기존 수업 명렬과 비교</h3>
              <p>비교한 뒤 결과를 확인하고 반영할 수 있습니다.</p>
              {!comparison && (
                <div className="roster-transfer-placeholder">
                  아직 비교하지 않았습니다. 아래의 ‘명렬 비교하기’를 눌러 주세요.
                </div>
              )}
              {comparison && (
                <div
                  className={`roster-transfer-result ${comparison.status === "차이" || comparison.status === "보류" ? "attention" : ""}`}
                  role="status"
                >
                  <strong>{comparison.status}</strong>
                  <p>{comparison.message}</p>
                  {!!comparison.added?.length && (
                    <div>
                      <b>평가에만 있는 학생</b>
                      <p>{comparison.added.join(", ")}</p>
                    </div>
                  )}
                  {!!comparison.missing?.length && (
                    <div>
                      <b>기존 명렬에만 있는 학생</b>
                      <p>{comparison.missing.join(", ")}</p>
                    </div>
                  )}
                  {comparison.status === "차이" && (
                    <p>같은 번호의 이름이 다르면 추가할 수 없습니다. 기존 학생은 삭제되지 않습니다.</p>
                  )}
                </div>
              )}
              {error && (
                <p className="roster-transfer-error" role="alert">
                  {error}
                </p>
              )}
            </section>
          </div>
          <div className="dialog-actions roster-transfer-actions">
            <Dialog.Close asChild>
              <button className="quiet-button" disabled={busy}>
                취소
              </button>
            </Dialog.Close>
            <button className="quiet-button" disabled={busy} onClick={() => void compare()}>
              명렬 비교하기
            </button>
            {comparison && comparison.status !== "보류" && (
              <button className="primary-button" disabled={busy} onClick={() => void send()}>
                {comparison.status === "차이"
                  ? "확인 후 새 학생 추가"
                  : comparison.status === "일치"
                    ? "일치 확인"
                    : "명렬 만들기"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
