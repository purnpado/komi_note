import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { main as models } from "../../../wailsjs/go/models";

export function SeatingDeleteDialog({
  open,
  onOpenChange,
  selectedPlan,
  onConfirmDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: models.SeatingPlan | null;
  onConfirmDelete: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>자리 배치 이력을 삭제할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            “{selectedPlan?.title || "선택한 자리 배치"}”와 저장된 좌석 배정을
            삭제합니다. 삭제한 이력은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">취소</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="danger-button"
                onClick={() => void onConfirmDelete()}
              >
                이력 삭제
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function SeatingRecoveryEndDialog({
  open,
  onOpenChange,
  onConfirmEnd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmEnd: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>오류 회차를 종료할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            학생 요청과 타이머가 즉시 중단됩니다. 아직 저장되지 않은 현재 배정은
            확정되지 않으며, QR 정보는 별도로 회차 닫기를 눌러 폐기할 수 있습니다.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">계속 복구하기</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                className="danger-button"
                onClick={() => void onConfirmEnd()}
              >
                회차 종료
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
