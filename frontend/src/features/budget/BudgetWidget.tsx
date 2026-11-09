import { useCallback, useEffect, useState } from "react";
import { GetBudgetBook } from "../../../bindings/TeacherNote/app";
import type { Book } from "../../../bindings/TeacherNote/internal/budget/models";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { summarize, won } from "./budgetState";
import "./budget.css";

/** 대시보드: 장부가 있을 때만 장부별 남은 금액을 보여 준다(최근 학년도 3개). */
export function BudgetWidget({ onOpen }: { onOpen: () => void }) {
  const [book, setBook] = useState<Book | null>(null);
  const reload = useCallback(() => { GetBudgetBook().then(setBook).catch(() => setBook(null)); }, []);
  useEffect(reload, [reload]);
  useVaultChanges([changeEvents.budget], reload);
  const ledgers = (book?.ledgers || []).slice(0, 3);
  if (!ledgers.length) return null;
  return (
    <section className="panel budget-widget">
      <div className="panel-heading">
        <div><p className="eyebrow">예산</p><h3>남은 금액</h3></div>
        <button type="button" className="text-button" onClick={onOpen}>예산 관리 →</button>
      </div>
      <ul>
        {ledgers.map((ledger) => {
          const s = summarize(ledger, book?.entries || []);
          return (
            <li key={ledger.id}>
              <button type="button" onClick={onOpen}>
                <span>{ledger.schoolYear} · {ledger.name}</span>
                <b className={s.remaining < 0 ? "over" : ""}>{won(s.remaining)}</b>
                <span className="budget-progress mini" aria-label={`집행률 ${s.usedPercent}%`}><i style={{ width: `${Math.min(100, s.usedPercent)}%` }} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
