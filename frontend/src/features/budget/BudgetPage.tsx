import { useCallback, useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteBudgetEntry, DeleteBudgetLedger, ExportBudgetCSV, GetBudgetBook } from "../../../bindings/TeacherNote/app";
import type { Book, Entry, Ledger } from "../../../bindings/TeacherNote/internal/budget/models";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { changeEvents } from "../shared/changeEvents";
import { printSheet } from "../shared/desktopActions";
import { errorMessage } from "../shared/format";
import { useVaultChanges } from "../shared/useVaultChanges";
import { EntryDialog } from "./EntryDialog";
import { EntryTable } from "./EntryTable";
import { LedgerDialog } from "./LedgerDialog";
import { LedgerSummary } from "./LedgerSummary";
import { ReceiptViewer } from "./ReceiptViewer";
import { type EntryFilter, emptyFilter, filterEntries, monthOptions, printHtml } from "./budgetState";
import "./budget.css";

const printCss = `.print-sheet{font-family:"Pretendard","Malgun Gothic",sans-serif;color:#111}.print-sheet h1{margin:0 0 4px;font-size:19px}.print-sheet .meta{margin:0 0 4px;font-size:12px}.print-sheet .warn{margin:0 0 10px;font-size:11px;font-weight:700;color:#a1261b}.print-sheet table{width:100%;border-collapse:collapse;font-size:11.5px}.print-sheet th,.print-sheet td{border:1px solid #888;padding:4px 6px;text-align:left}.print-sheet th{background:#eee}.print-sheet td.num{text-align:right;white-space:nowrap}`;

type Props = { config: models.ClassConfig | null; isHomeroomTeacher: boolean };

export function BudgetPage({ config, isHomeroomTeacher }: Props) {
  const [book, setBook] = useState<Book>({ ledgers: [], entries: [] });
  const [ledgerId, setLedgerId] = useState("");
  const [filter, setFilter] = useState<EntryFilter>(emptyFilter);
  const [ledgerDialog, setLedgerDialog] = useState<{ open: boolean; ledger: Ledger | null }>({ open: false, ledger: null });
  const [entryDialog, setEntryDialog] = useState<{ open: boolean; entry: Entry | null; type: "지출" | "수입" }>({ open: false, entry: null, type: "지출" });
  const [receipt, setReceipt] = useState<{ entryId: string; receiptId: string; title: string } | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<Entry | null>(null);
  const [deleteLedger, setDeleteLedger] = useState<Ledger | null>(null);
  const [phrase, setPhrase] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    try {
      const next = await GetBudgetBook();
      setBook({ ledgers: next?.ledgers || [], entries: next?.entries || [] });
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useVaultChanges([changeEvents.budget], () => void reload());

  const ledgers = book.ledgers || [];
  const entries = book.entries || [];
  const ledger = ledgers.find((item) => item.id === ledgerId) || ledgers[0] || null;
  useEffect(() => { if (ledger && ledger.id !== ledgerId) setLedgerId(ledger.id); }, [ledger?.id]);
  const visible = useMemo(() => (ledger ? filterEntries(entries, ledger.id, filter) : []), [entries, ledger?.id, filter]);
  const months = ledger ? monthOptions(entries, ledger.id) : [];
  const suggested = { name: isHomeroomTeacher ? "학급 운영비" : "", schoolYear: config?.schoolYear || String(new Date().getFullYear()) };

  async function act(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setNotice(message);
      await reload();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function print() {
    if (!ledger) return;
    const label = [filter.month && `${filter.month.replace("-", "년 ")}월`, filter.type, filter.category].filter(Boolean).join(" · ") || "전체";
    void printSheet(printHtml(ledger, visible, label), printCss).catch(() => setNotice("인쇄 창을 열지 못했습니다."));
  }

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">업무용 · 예산 장부</p>
          <h2>예산 관리</h2>
          <p>학급 운영비·동아리·부서 업무비처럼 장부를 나눠 수입·지출과 영수증을 정리합니다.</p>
        </div>
        <button className="outline-button" onClick={() => setLedgerDialog({ open: true, ledger: null })}>＋ 장부</button>
      </section>
      <HelpGuide
        title="처음 사용 안내 · 예산 관리"
        description="장부를 만들고 편성 예산을 적은 뒤, 쓸 때마다 지출을 기록합니다."
        steps={[
          { title: "장부 만들기", detail: isHomeroomTeacher ? "담임이면 ‘학급 운영비’ 장부를 먼저 만들어 보세요. 동아리·부서 장부도 따로 만들 수 있습니다." : "맡은 동아리·부서 업무비 장부를 만듭니다." },
          { title: "기록", detail: "‘＋ 지출’·‘＋ 수입’으로 날짜·항목·내용·금액·결제 방법을 적습니다. 저장한 뒤 영수증 사진을 붙일 수 있습니다(3장)." },
          { title: "확인·내보내기", detail: "남은 금액과 항목별 지출을 보고, 달·구분·항목으로 걸러 A4로 인쇄하거나 CSV(엑셀)로 저장합니다." },
        ]}
        note="내용 칸에는 학생 이름 대신 ‘학급 간식’처럼 적어 주세요. 영수증 사진은 암호화해 보관하지만 인쇄물·CSV 파일은 암호화되지 않습니다. 이 기록은 개인 정리용이며 학교 회계(에듀파인) 처리를 대신하지 않습니다."
      />
      {!ledger ? (
        <section className="panel budget-empty">
          <h3>아직 장부가 없습니다</h3>
          <p>{isHomeroomTeacher ? "학급 운영비 장부부터 만들어 보세요." : "동아리·부서 업무비 장부를 만들어 보세요."}</p>
          <button className="primary-button" onClick={() => setLedgerDialog({ open: true, ledger: null })}>{isHomeroomTeacher ? "학급 운영비 장부 만들기" : "장부 만들기"}</button>
        </section>
      ) : (
        <section className="panel budget-panel">
          <div className="budget-ledger-bar">
            <div className="budget-ledger-tabs" role="tablist" aria-label="장부">
              {ledgers.map((item) => <button key={item.id} role="tab" aria-selected={item.id === ledger.id} className={item.id === ledger.id ? "active" : ""} onClick={() => { setLedgerId(item.id); setFilter(emptyFilter); }}>{item.schoolYear} · {item.name}</button>)}
            </div>
            <div className="budget-ledger-actions">
              <button className="text-button" onClick={() => setLedgerDialog({ open: true, ledger })}>장부 고치기</button>
              <button className="text-button danger-text" onClick={() => { setDeleteLedger(ledger); setPhrase(""); }}>장부 삭제</button>
            </div>
          </div>
          <LedgerSummary ledger={ledger} entries={entries} />
          <div className="budget-toolbar">
            <button className="primary-button" onClick={() => setEntryDialog({ open: true, entry: null, type: "지출" })}>＋ 지출</button>
            <button className="outline-button" onClick={() => setEntryDialog({ open: true, entry: null, type: "수입" })}>＋ 수입</button>
            <select aria-label="달" value={filter.month} onChange={(e) => setFilter({ ...filter, month: e.target.value })}><option value="">모든 달</option>{months.map((m) => <option key={m} value={m}>{m.replace("-", "년 ")}월</option>)}</select>
            <select aria-label="구분" value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value as EntryFilter["type"] })}><option value="">수입·지출</option><option>지출</option><option>수입</option></select>
            <select aria-label="항목" value={filter.category} onChange={(e) => setFilter({ ...filter, category: e.target.value })}><option value="">모든 항목</option>{(ledger.categories || []).map((c) => <option key={c}>{c}</option>)}</select>
            <input type="search" aria-label="내용 찾기" placeholder="내용 찾기" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
            <span className="budget-toolbar-end">
              <button className="quiet-button" onClick={print}>인쇄</button>
              <button className="quiet-button" onClick={() => void ExportBudgetCSV(ledger.id).then((path) => path && setNotice(`CSV로 저장했습니다: ${path} (암호화되지 않은 파일입니다)`)).catch((e) => setNotice(errorMessage(e)))}>CSV 저장</button>
            </span>
          </div>
          <EntryTable entries={visible} onOpen={(entry) => setEntryDialog({ open: true, entry, type: entry.type as "지출" | "수입" })} onReceipt={(entry) => setReceipt({ entryId: entry.id, receiptId: (entry.receipts || [])[0].id, title: entry.title })} />
        </section>
      )}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      <LedgerDialog open={ledgerDialog.open} ledger={ledgerDialog.ledger} defaults={suggested} onOpenChange={(open) => setLedgerDialog((d) => ({ ...d, open }))} onSaved={(saved, message) => { setLedgerId(saved.id); setNotice(message); void reload(); }} />
      {ledger && <EntryDialog open={entryDialog.open} ledger={ledger} entry={entryDialog.entry} type={entryDialog.type} onOpenChange={(open) => setEntryDialog((d) => ({ ...d, open }))} onSaved={(message) => { setNotice(message); void reload(); }} onViewReceipt={(entry, receiptId) => setReceipt({ entryId: entry.id, receiptId, title: entry.title })} onDelete={setDeleteEntry} />}
      <ReceiptViewer target={receipt} onClose={() => setReceipt(null)} />
      <AlertDialog.Root open={deleteEntry !== null} onOpenChange={(open) => { if (!open) setDeleteEntry(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>내역을 지울까요?</AlertDialog.Title>
            <AlertDialog.Description>“{deleteEntry?.title}” 내역{(deleteEntry?.receipts || []).length ? "과 영수증 사진" : ""}을 지웁니다. 되돌릴 수 없습니다.</AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button">취소</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><button className="danger-button" onClick={() => { const t = deleteEntry; setDeleteEntry(null); if (t) void act(() => DeleteBudgetEntry(t.id, t.ledgerId), "내역을 지웠습니다."); }}>지우기</button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={deleteLedger !== null} onOpenChange={(open) => { if (!open) setDeleteLedger(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>장부를 통째로 지울까요?</AlertDialog.Title>
            <AlertDialog.Description>“{deleteLedger?.name}” 장부와 모든 내역·영수증 사진을 지웁니다. 되돌릴 수 없습니다. 아래에 <b>장부 삭제</b>를 입력해 주세요.</AlertDialog.Description>
            <label className="dialog-label">확인 문구<input value={phrase} onChange={(e) => setPhrase(e.target.value)} autoFocus /></label>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button">취소</button></AlertDialog.Cancel>
              <button className="danger-button" disabled={phrase !== "장부 삭제"} onClick={() => { const t = deleteLedger; setDeleteLedger(null); if (t) void act(() => DeleteBudgetLedger(t.id, phrase), "장부를 지웠습니다."); setLedgerId(""); }}>장부 삭제</button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
