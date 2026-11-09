import { summarize, won, type EntryLike, type LedgerLike } from "./budgetState";

/** 편성·수입·지출·남은 금액과 집행률 막대, 항목별 지출 */
export function LedgerSummary({ ledger, entries }: { ledger: LedgerLike; entries: EntryLike[] }) {
  const s = summarize(ledger, entries);
  return (
    <section className="budget-summary">
      <div className="budget-stats">
        <div><small>편성 예산</small><strong>{won(s.planned)}</strong></div>
        <div><small>수입</small><strong className="b-income">+{won(s.income)}</strong></div>
        <div><small>지출</small><strong className="b-expense">-{won(s.expense)}</strong></div>
        <div className={s.remaining < 0 ? "over" : ""}><small>남은 금액</small><strong>{won(s.remaining)}</strong></div>
      </div>
      <div className="budget-progress" role="img" aria-label={`집행률 ${s.usedPercent}%`}>
        <span style={{ width: `${Math.min(100, s.usedPercent)}%` }} className={s.usedPercent > 100 ? "over" : s.usedPercent > 85 ? "warn" : ""} />
      </div>
      <p className="budget-progress-label">집행률 {s.usedPercent}%{s.remaining < 0 ? " · 예산을 넘었습니다" : ""}</p>
      {s.categories.length > 0 && (
        <ul className="budget-categories">
          {s.categories.map((c) => (
            <li key={c.category}>
              <span>{c.category}</span>
              <span className="budget-cat-bar" aria-hidden="true"><i style={{ width: `${c.percent}%` }} /></span>
              <b>{won(c.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
