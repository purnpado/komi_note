import { FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SaveBudgetLedger } from "../../../bindings/TeacherNote/app";
import type { Ledger } from "../../../bindings/TeacherNote/internal/budget/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { parseAmount } from "./budgetState";

type Props = { open: boolean; ledger: Ledger | null; defaults: Partial<Ledger>; onOpenChange: (open: boolean) => void; onSaved: (saved: Ledger, message: string) => void };

const defaultCategories = ["물품", "간식", "행사", "인쇄", "교통", "기타"];

/** 장부 만들기·고치기 창(이름·학년도·편성 예산·항목) */
export function LedgerDialog({ open, ledger, defaults, onOpenChange, onSaved }: Props) {
  const [draft, setDraft] = useState<Ledger>({ id: "", name: "", schoolYear: "", planned: 0, categories: [], createdAt: "", updatedAt: "" });
  const [categoryText, setCategoryText] = useState("");
  const [plannedText, setPlannedText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const start: Ledger = ledger ? { ...ledger } : { id: "", name: defaults.name || "", schoolYear: defaults.schoolYear || String(new Date().getFullYear()), planned: 0, categories: defaultCategories, note: "", createdAt: "", updatedAt: "" };
    setDraft(start);
    setCategoryText((start.categories || defaultCategories).join(", "));
    setPlannedText(start.planned ? start.planned.toLocaleString("ko-KR") : "");
    setError("");
  }, [open, ledger, defaults.name, defaults.schoolYear]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return setError("장부 이름을 입력해 주세요.");
    if (!/^\d{4}$/.test(draft.schoolYear)) return setError("학년도를 네 자리 숫자로 입력해 주세요.");
    try {
      setBusy(true);
      const saved = await SaveBudgetLedger({ ...draft, planned: parseAmount(plannedText), categories: categoryText.split(",").map((c) => c.trim()).filter(Boolean) });
      onSaved(saved, ledger ? "장부를 고쳤습니다." : "장부를 만들었습니다.");
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
        <Dialog.Content className="dialog-content budget-dialog" aria-describedby={undefined}>
          <Dialog.Title>{ledger ? "장부 고치기" : "새 장부"}</Dialog.Title>
          <form className="budget-form" onSubmit={save}>
            <div className="budget-row">
              <label className="dialog-label grow">장부 이름<input autoFocus value={draft.name} maxLength={40} placeholder="예: 학급 운영비, 과학 동아리, 교무부 업무비" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label className="dialog-label">학년도<input value={draft.schoolYear} inputMode="numeric" maxLength={4} onChange={(e) => setDraft({ ...draft, schoolYear: e.target.value.replace(/\D/g, "") })} /></label>
            </div>
            <label className="dialog-label">편성 예산(원)<input value={plannedText} inputMode="numeric" placeholder="예: 500,000" onChange={(e) => setPlannedText(parseAmount(e.target.value) ? parseAmount(e.target.value).toLocaleString("ko-KR") : "")} /></label>
            <label className="dialog-label">항목(쉼표로 나누기) <HelpTip>내역을 고를 때 쓰는 분류입니다. ‘기타’는 늘 있습니다. 내역에서 쓰는 항목은 지울 수 없습니다.</HelpTip>
              <input value={categoryText} onChange={(e) => setCategoryText(e.target.value)} />
            </label>
            <label className="dialog-label">메모(선택)<textarea rows={2} maxLength={500} value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
              <button className="primary-button" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
