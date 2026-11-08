import { useEffect, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

export type AppConfirmRequest = {
  title: string;
  description: string;
  actionLabel?: string;
};

let openAppConfirm: ((request: AppConfirmRequest) => Promise<boolean>) | null = null;

export function AppConfirmDialogHost() {
  const [request, setRequest] = useState<
    (AppConfirmRequest & { resolve: (accepted: boolean) => void }) | null
  >(null);

  useEffect(() => {
    openAppConfirm = (next) => new Promise<boolean>((resolve) => setRequest({ ...next, resolve }));
    return () => {
      openAppConfirm = null;
    };
  }, []);

  function close(accepted: boolean) {
    request?.resolve(accepted);
    setRequest(null);
  }

  return (
    <AlertDialog.Root open={request !== null} onOpenChange={(open) => !open && close(false)}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <AlertDialog.Title>{request?.title}</AlertDialog.Title>
          <AlertDialog.Description>{request?.description}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button" onClick={() => close(false)}>취소</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="danger-button" onClick={() => close(true)}>
                {request?.actionLabel || "삭제"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function confirmWithRadix(request: AppConfirmRequest) {
  return openAppConfirm ? openAppConfirm(request) : Promise.resolve(false);
}
