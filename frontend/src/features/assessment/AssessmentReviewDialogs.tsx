import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import type { AssessmentView } from "./useAssessmentPage";
import { AssessmentDialogHeader } from "./AssessmentParts";

/** 이의 답변·채점 사유 창과 이의 삭제·평가 삭제 확인창. */
export function AssessmentReviewDialogs({ view }: { view: AssessmentView }) {
  const {
    busy,
    title,
    answering,
    setAnswering,
    reasoning,
    setReasoning,
    deleteOpen,
    setDeleteOpen,
    deletingObjection,
    setDeletingObjection,
    saveReason,
    answer,
    removeObjection,
    remove,
  } = view;
  return (
    <>
      <Dialog.Root open={answering !== null} onOpenChange={(open) => !open && setAnswering(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <Dialog.Content className="dialog-content assessment-dialog assessment-small-dialog">
            <AssessmentDialogHeader
              title="학생 이의 답변"
              description="답변은 해당 학생의 이의 처리 기록으로 암호화 저장됩니다."
            />
            <label className="assessment-field">
              답변
              <textarea
                rows={6}
                value={answering?.value || ""}
                onChange={(event) =>
                  setAnswering((current) => (current ? { ...current, value: event.target.value } : null))
                }
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="quiet-button">취소</button>
              </Dialog.Close>
              <button className="primary-button" onClick={() => void answer()}>
                답변 저장
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={reasoning !== null} onOpenChange={(open) => !open && setReasoning(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <Dialog.Content className="dialog-content assessment-dialog assessment-small-dialog">
            <AssessmentDialogHeader
              title={`${reasoning?.studentName || "학생"} · ${reasoning?.criterionName || "세부 기준"} 채점 사유`}
              description="이 학생의 QR 점수 확인 화면에만 표시됩니다. 다른 학생과 전자칠판에는 공개되지 않습니다."
            />
            <label className="assessment-field">
              채점 사유
              <textarea
                rows={6}
                value={reasoning?.value || ""}
                placeholder="예: 자료 출처 표기가 일부 누락되어 이 기준에서 감점했습니다."
                onChange={(event) =>
                  setReasoning((current) => (current ? { ...current, value: event.target.value } : null))
                }
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="quiet-button" disabled={busy}>
                  취소
                </button>
              </Dialog.Close>
              <button className="primary-button" disabled={busy} onClick={() => void saveReason()}>
                사유 저장
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root open={deletingObjection !== null} onOpenChange={(open) => !open && setDeletingObjection(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <AlertDialog.Content className="dialog-content assessment-dialog assessment-small-dialog assessment-delete-dialog">
            <AlertDialog.Title>답변 완료 이의를 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>
              <strong>{deletingObjection?.studentName}</strong> 학생의 이의 내용과 교사 답변이 암호화 보관함에서
              삭제됩니다. 점수와 세부 기준은 변경되지 않으며, 이 작업은 되돌릴 수 없습니다.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => void removeObjection()}>
                  이의 삭제
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <AlertDialog.Content className="dialog-content assessment-dialog assessment-small-dialog assessment-delete-dialog">
            <AlertDialog.Title>수행평가를 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>최소 수업 명렬, 점수, 이의와 확인 이력이 함께 삭제됩니다.</AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => void remove()}>
                  수행평가 삭제
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
