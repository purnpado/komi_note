import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GetBudgetReceipt } from "../../../bindings/TeacherNote/app";
import { errorMessage } from "../shared/format";

/** 영수증 사진 보기(보관함에서 복호화해 화면에만 보여 준다) */
export function ReceiptViewer({ target, onClose }: { target: { entryId: string; receiptId: string; title: string } | null; onClose: () => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setUrl("");
    setError("");
    if (!target) return;
    GetBudgetReceipt(target.entryId, target.receiptId).then(setUrl).catch((e) => setError(errorMessage(e)));
  }, [target]);
  return (
    <Dialog.Root open={target !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content receipt-viewer" aria-describedby={undefined}>
          <Dialog.Title>영수증 · {target?.title}</Dialog.Title>
          {error ? <p className="form-error">{error}</p> : url ? <img src={url} alt={`${target?.title} 영수증 사진`} /> : <p className="empty-state">불러오는 중…</p>}
          <div className="dialog-actions"><Dialog.Close asChild><button className="primary-button">닫기</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
