import { FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AddAssessmentStudent } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage, todayLocal } from "../shared/format";
import { defaultSkippedDomains, nextStudentNumber } from "./assessmentState";

type Props = { open: boolean; assessment: models.Assessment; onOpenChange: (open: boolean) => void; onAdded: (assessment: models.Assessment, message: string) => void };

/** 학기 중 전입생 추가: 번호·이름·전입일, 이미 끝난 영역 고르기. 같은 반 수업 명렬에도 함께 넣는다. */
export function AddStudentDialog({ open, assessment, onOpenChange, onAdded }: Props) {
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [transferIn, setTransferIn] = useState("");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setNumber(nextStudentNumber(assessment.students));
    setName("");
    setTransferIn(todayLocal());
    setSkipped(defaultSkippedDomains(assessment as never));
    setError("");
  }, [open, assessment.id]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!number.trim() || !name.trim()) return setError("번호와 이름을 입력해 주세요.");
    try {
      setBusy(true);
      const result = await AddAssessmentStudent(assessment.id, number, name, transferIn, skipped);
      onAdded(new models.Assessment(result.assessment), `${number}번 ${name.trim()} 학생을 추가했습니다. ${result.rosterMessage}`);
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content assessment-add-student" aria-describedby="add-student-help">
          <Dialog.Title>전입생 추가 · {assessment.className}</Dialog.Title>
          <p id="add-student-help" className="assessment-add-help">평가 도중 전입한 학생을 이 평가와 같은 반 수업 명렬에 함께 넣습니다. 이미 끝난 영역은 이 학생을 평가하지 않는 영역으로 표시되고, 남은 영역부터 점수를 입력합니다.</p>
          <form onSubmit={add} className="assessment-add-form">
            <div className="assessment-add-row">
              <label className="dialog-label">번호<input value={number} inputMode="numeric" maxLength={10} onChange={(e) => setNumber(e.target.value)} /></label>
              <label className="dialog-label">이름<input autoFocus value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
              <label className="dialog-label">전입일(선택)<input type="date" value={transferIn} onChange={(e) => setTransferIn(e.target.value)} /></label>
            </div>
            <fieldset className="assessment-add-domains">
              <legend>전입 전에 이미 끝난 영역 <HelpTip>고른 영역은 이 학생 칸에 ‘전입 전’으로 보이고 점수를 넣지 않습니다. 점수가 이미 입력된 영역을 미리 골라 두었습니다. 학교 지침(전입생 성적 처리)에 맞게 고쳐 주세요.</HelpTip></legend>
              {assessment.domains.map((domain) => (
                <label key={domain.id} className="inline-check">
                  <input type="checkbox" checked={skipped.includes(domain.id)} onChange={(e) => setSkipped(e.target.checked ? [...skipped, domain.id] : skipped.filter((id) => id !== domain.id))} /> {domain.name}
                </label>
              ))}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
              <button className="primary-button" disabled={busy}>{busy ? "추가 중…" : "학생 추가"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
