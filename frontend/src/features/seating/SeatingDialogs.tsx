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

// 재적 인원보다 적게 입장했을 때 결석·미참여를 확인하고 마감한다.
export function SeatingPartialCloseDialog({
  open,
  onOpenChange,
  participantCount,
  rosterCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantCount: number;
  rosterCount: number;
  onConfirm: () => Promise<void>;
}) {
  const missing = Math.max(0, rosterCount - participantCount);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>아직 {missing}명이 입장하지 않았어요</AlertDialog.Title>
          <AlertDialog.Description>
            재적 {rosterCount}명 중 {participantCount}명만 입장했습니다. 결석하거나 참여하지
            않는 학생이 있다면 예외 마감으로 진행하세요. 입장하지 않은 학생은 이번 회차에서
            자리를 받지 않으며, 결과 화면에서 교사가 직접 자리를 정할 수 있습니다.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">더 기다리기</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="danger-button" onClick={() => void onConfirm()}>
                결석·미참여 {missing}명으로 예외 마감
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// 전자칠판에 학생 실명 배치도를 공개하기 전에 한 번 더 확인한다.
export function SeatingRevealNamesDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>전자칠판에 실명 배치도를 공개할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            전자칠판 최종 화면에 학생 이름이 좌석 번호와 함께 보입니다. 결과 확인과 자리
            바꾸기를 마친 뒤 공개해 주세요. 학생 휴대폰에는 계속 이름이 보이지 않고,
            언제든 다시 가릴 수 있습니다.
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">취소</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="primary-button" onClick={() => void onConfirm()}>
                실명 배치도 공개
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// QR 회차를 닫으면 접속 정보와 닉네임 연결이 폐기되므로 확인을 거친다.
export function SeatingCloseSessionDialog({
  open,
  onOpenChange,
  finished,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finished: boolean;
  onConfirm: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>QR 회차를 닫을까요?</AlertDialog.Title>
          <AlertDialog.Description>
            {finished
              ? "학생 접속 주소·닉네임·진행 기록을 폐기합니다. 저장된 자리 결과는 그대로 남고, 전자칠판 화면은 닫힙니다."
              : "아직 배정이 끝나지 않았습니다. 닫으면 진행 중인 회차가 중단되고 학생 접속 주소·닉네임·진행 기록이 폐기됩니다. 이미 확정된 자리만 저장되어 있습니다."}
          </AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button">취소</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="danger-button" onClick={() => void onConfirm()}>
                회차 닫기
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
