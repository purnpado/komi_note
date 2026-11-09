// 예산 화면의 순수 계산: 합계·거르기·항목별 막대·인쇄 내용. Wails 호출은 두지 않는다.

export type LedgerLike = { id: string; name: string; schoolYear: string; planned: number; categories: string[] | null; note?: string };
export type ReceiptLike = { id: string; name: string; mime: string; size: number };
export type EntryLike = { id: string; ledgerId: string; date: string; type: string; category: string; title: string; amount: number; payment: string; note?: string; receipts: ReceiptLike[] | null };
export type EntryFilter = { type: "" | "지출" | "수입"; category: string; month: string; query: string };

export const payments = ["카드", "현금", "계좌이체", "기타"];
export const emptyFilter: EntryFilter = { type: "", category: "", month: "", query: "" };

export const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export function summarize(ledger: LedgerLike, entries: EntryLike[]) {
  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();
  for (const entry of entries) {
    if (entry.ledgerId !== ledger.id) continue;
    if (entry.type === "수입") income += entry.amount;
    else {
      expense += entry.amount;
      byCategory.set(entry.category, (byCategory.get(entry.category) || 0) + entry.amount);
    }
  }
  const budget = ledger.planned + income;
  const remaining = budget - expense;
  return {
    planned: ledger.planned, income, expense, remaining,
    usedPercent: budget > 0 ? Math.min(999, Math.round((expense / budget) * 100)) : 0,
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount, percent: expense ? Math.round((amount / expense) * 100) : 0 })),
  };
}

export function filterEntries<T extends EntryLike>(entries: T[], ledgerId: string, filter: EntryFilter): T[] {
  const q = filter.query.trim().toLowerCase();
  return entries.filter((entry) =>
    entry.ledgerId === ledgerId &&
    (!filter.type || entry.type === filter.type) &&
    (!filter.category || entry.category === filter.category) &&
    (!filter.month || entry.date.startsWith(filter.month)) &&
    (!q || `${entry.title} ${entry.note || ""}`.toLowerCase().includes(q)));
}

/** 내역이 있는 달(최근 순) */
export function monthOptions(entries: EntryLike[], ledgerId: string) {
  return [...new Set(entries.filter((e) => e.ledgerId === ledgerId).map((e) => e.date.slice(0, 7)))].sort().reverse();
}

export function totals(entries: EntryLike[]) {
  return entries.reduce((sum, e) => ({ income: sum.income + (e.type === "수입" ? e.amount : 0), expense: sum.expense + (e.type === "수입" ? 0 : e.amount) }), { income: 0, expense: 0 });
}

/** "12,000" "1만2천" 같은 입력에서 숫자만 */
export function parseAmount(text: string) {
  const digits = text.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

export function entryProblem(entry: EntryLike) {
  if (!entry.date) return "날짜를 골라 주세요.";
  if (!entry.title.trim()) return "내용을 입력해 주세요.";
  if (!(entry.amount > 0)) return "금액을 1원 이상 입력해 주세요.";
  if (entry.amount > 1_000_000_000) return "금액은 10억 원까지 입력할 수 있습니다.";
  return "";
}

const esc = (value: string) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** A4 인쇄용 집행 내역 HTML(.print-sheet 안에 들어감) */
export function printHtml(ledger: LedgerLike, entries: EntryLike[], label: string) {
  const s = summarize(ledger, entries);
  const rows = entries.map((e) => `<tr><td>${esc(e.date)}</td><td>${esc(e.type)}</td><td>${esc(e.category)}</td><td>${esc(e.title)}</td><td class="num">${e.type === "수입" ? "+" : "-"}${won(e.amount)}</td><td>${esc(e.payment)}</td><td>${(e.receipts || []).length ? `${(e.receipts || []).length}장` : ""}</td></tr>`).join("");
  return `<h1>${esc(ledger.schoolYear)}학년도 ${esc(ledger.name)} 집행 내역</h1><p class="meta">${esc(label)} · 편성 ${won(s.planned)} · 수입 ${won(s.income)} · 지출 ${won(s.expense)} · 남은 금액 ${won(s.remaining)}</p><p class="warn">인쇄물은 암호화되지 않습니다. 보관·폐기에 주의하세요.</p><table><thead><tr><th>날짜</th><th>구분</th><th>항목</th><th>내용</th><th>금액</th><th>결제</th><th>영수증</th></tr></thead><tbody>${rows || '<tr><td colspan="7">내역이 없습니다.</td></tr>'}</tbody></table>`;
}
