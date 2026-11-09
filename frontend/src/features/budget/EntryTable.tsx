import type { Entry } from "../../../bindings/TeacherNote/internal/budget/models";
import { totals, won } from "./budgetState";

/** 내역 표. 줄을 누르면 고치기, 🧾를 누르면 영수증 보기 */
export function EntryTable({ entries, onOpen, onReceipt }: { entries: Entry[]; onOpen: (entry: Entry) => void; onReceipt: (entry: Entry) => void }) {
  if (!entries.length) return <p className="empty-state">조건에 맞는 내역이 없습니다.</p>;
  const sum = totals(entries);
  return (
    <div className="budget-table-wrap">
      <table className="budget-table">
        <thead><tr><th>날짜</th><th>구분</th><th>항목</th><th>내용</th><th className="num">금액</th><th>결제</th><th>영수증</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} tabIndex={0} onClick={() => onOpen(entry)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(entry); }}>
              <td>{entry.date.slice(5).replace("-", ".")}</td>
              <td><span className={`budget-type ${entry.type === "수입" ? "b-income" : "b-expense"}`}>{entry.type}</span></td>
              <td>{entry.category}</td>
              <td className="budget-title">{entry.title}{entry.note && <small>{entry.note}</small>}</td>
              <td className={`num ${entry.type === "수입" ? "b-income" : "b-expense"}`}>{entry.type === "수입" ? "+" : "-"}{won(entry.amount)}</td>
              <td>{entry.payment}</td>
              <td>{(entry.receipts || []).length > 0 ? <button type="button" className="text-button" onClick={(e) => { e.stopPropagation(); onReceipt(entry); }} aria-label={`영수증 ${(entry.receipts || []).length}장 보기`}>🧾 {(entry.receipts || []).length}</button> : <span className="budget-none">없음</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}>보이는 {entries.length}건 합계</td><td className="num" colSpan={3}>수입 +{won(sum.income)} · 지출 -{won(sum.expense)}</td></tr></tfoot>
      </table>
    </div>
  );
}
