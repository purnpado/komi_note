import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AddBudgetReceipt, DeleteBudgetReceipt, SaveBudgetEntry } from "../../../bindings/TeacherNote/app";
import type { Entry, Ledger } from "../../../bindings/TeacherNote/internal/budget/models";
import { errorMessage, todayLocal } from "../shared/format";
import { entryProblem, parseAmount, payments } from "./budgetState";

type Props = { open: boolean; ledger: Ledger; entry: Entry | null; type: "지출" | "수입"; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void; onViewReceipt: (entry: Entry, receiptId: string) => void; onDelete: (entry: Entry) => void };

function readBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("사진 파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/** 수입·지출 입력 창. 저장한 내역에는 영수증 사진(암호화, 3장까지)을 붙일 수 있다. */
export function EntryDialog({ open, ledger, entry, type, onOpenChange, onSaved, onViewReceipt, onDelete }: Props) {
  const empty = (): Entry => ({ id: "", ledgerId: ledger.id, date: todayLocal(), type, category: (ledger.categories || [])[0] || "기타", title: "", amount: 0, payment: "카드", note: "", receipts: [], createdAt: "", updatedAt: "" });
  const [draft, setDraft] = useState<Entry>(empty);
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const start = entry ? { ...entry } : empty();
    setDraft(start);
    setAmountText(start.amount ? start.amount.toLocaleString("ko-KR") : "");
    setError("");
  }, [open, entry, type, ledger.id]);
  const set = (patch: Partial<Entry>) => setDraft((current) => ({ ...current, ...patch }));

  async function save(event: FormEvent) {
    event.preventDefault();
    const next = { ...draft, amount: parseAmount(amountText) };
    const problem = entryProblem({ ...next, receipts: next.receipts || [] });
    if (problem) return setError(problem);
    try {
      setBusy(true);
      const saved = await SaveBudgetEntry(next);
      setDraft(saved);
      onSaved(entry ? "내역을 고쳤습니다." : `${saved.type} 내역을 저장했습니다. 영수증 사진을 붙이려면 아래 ‘사진 붙이기’를 누르세요.`);
      if (entry) onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function attach(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return setError("영수증 사진은 5MB 이하만 붙일 수 있습니다.");
    try {
      setBusy(true);
      setDraft(await AddBudgetReceipt(draft.id, file.name, await readBase64(file)));
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function removeReceipt(receiptId: string) {
    try {
      setBusy(true);
      setDraft(await DeleteBudgetReceipt(draft.id, receiptId));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const receipts = draft.receipts || [];
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content budget-dialog" aria-describedby={undefined}>
          <Dialog.Title>{draft.id ? `${draft.type} 내역` : `새 ${type}`} · {ledger.name}</Dialog.Title>
          <form className="budget-form" onSubmit={save}>
            <div className="budget-type-switch" role="radiogroup" aria-label="구분">
              {(["지출", "수입"] as const).map((value) => <button type="button" key={value} role="radio" aria-checked={draft.type === value} className={draft.type === value ? `active ${value === "수입" ? "income" : ""}` : ""} onClick={() => set({ type: value })}>{value}</button>)}
            </div>
            <div className="budget-row">
              <label className="dialog-label">날짜<input type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
              <label className="dialog-label">항목<select value={draft.category} onChange={(e) => set({ category: e.target.value })}>{(ledger.categories || ["기타"]).map((c) => <option key={c}>{c}</option>)}</select></label>
            </div>
            <label className="dialog-label">내용<input autoFocus value={draft.title} maxLength={60} placeholder="예: 학급 환경 정비 물품(학생 이름은 쓰지 않기)" onChange={(e) => set({ title: e.target.value })} /></label>
            <div className="budget-row">
              <label className="dialog-label grow">금액(원)<input value={amountText} inputMode="numeric" placeholder="예: 32,000" onChange={(e) => setAmountText(parseAmount(e.target.value) ? parseAmount(e.target.value).toLocaleString("ko-KR") : "")} /></label>
              <label className="dialog-label">결제 방법<select value={draft.payment} onChange={(e) => set({ payment: e.target.value })}>{payments.map((p) => <option key={p}>{p}</option>)}</select></label>
            </div>
            <label className="dialog-label">메모(선택)<textarea rows={2} maxLength={500} value={draft.note || ""} onChange={(e) => set({ note: e.target.value })} /></label>
            <fieldset className="budget-receipts">
              <legend>영수증 사진 ({receipts.length}/3)</legend>
              {!draft.id ? <p className="budget-hint">먼저 저장하면 사진을 붙일 수 있습니다.</p> : (
                <>
                  {receipts.map((r) => (
                    <span key={r.id} className="budget-receipt-chip">
                      <button type="button" className="text-button" onClick={() => onViewReceipt(draft, r.id)}>🧾 {r.name}</button>
                      <button type="button" className="icon-button" aria-label={`${r.name} 지우기`} disabled={busy} onClick={() => void removeReceipt(r.id)}>×</button>
                    </span>
                  ))}
                  {receipts.length < 3 && <label className="quiet-button budget-attach">사진 붙이기<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => void attach(e)} /></label>}
                  <p className="budget-hint">JPG·PNG·WEBP, 5MB 이하. 이 컴퓨터에 암호화해 보관하며 암호화 백업 파일에는 들어가지 않습니다(프로그램 폴더의 data를 함께 옮기세요).</p>
                </>
              )}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              {draft.id && <button type="button" className="danger-button budget-delete" disabled={busy} onClick={() => { onOpenChange(false); onDelete(draft); }}>삭제</button>}
              <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>{draft.id && !entry ? "닫기" : "취소"}</button></Dialog.Close>
              <button className="primary-button" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
