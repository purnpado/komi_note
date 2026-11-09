import { useCallback, useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ArchiveDoneTodos, DeleteMemoItem, GetMemoBook, SaveMemoItem, SetMemoArchived, SetMemoDone } from "../../../bindings/TeacherNote/app";
import type { Item } from "../../../bindings/TeacherNote/internal/memo/models";
import { HelpGuide } from "../shared/HelpGuide";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage, todayLocal } from "../shared/format";
import { useVaultChanges } from "../shared/useVaultChanges";
import { MemoBoard } from "./MemoBoard";
import { MemoEditor } from "./MemoEditor";
import { TodoList } from "./TodoList";
import { type MemoFilter, type MemoKind, filterCounts, filterMemos, memoFilters, tagList } from "./memoState";
import "./memo.css";

export function MemoPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<MemoFilter>("전체");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [editor, setEditor] = useState<{ open: boolean; item: Item | null; kind: MemoKind }>({ open: false, item: null, kind: "메모" });
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [notice, setNotice] = useState("");
  const today = todayLocal();

  const reload = useCallback(async () => {
    try {
      setItems((await GetMemoBook())?.items || []);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  useVaultChanges([changeEvents.memo], () => void reload());

  const visible = useMemo(() => filterMemos(items, filter, today, query, tag), [items, filter, today, query, tag]);
  const counts = useMemo(() => filterCounts(items, today), [items, today]);
  const tags = useMemo(() => tagList(items), [items]);
  const memos = visible.filter((item) => item.kind !== "할 일");
  const todos = visible.filter((item) => item.kind === "할 일");
  const doneCount = items.filter((item) => item.kind === "할 일" && item.done && !item.archived).length;

  async function act(action: () => Promise<unknown>, message: string) {
    try {
      await action();
      setNotice(message);
      await reload();
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  const open = (item: Item | null, kind: MemoKind = "메모") => setEditor({ open: true, item, kind: item ? (item.kind as MemoKind) : kind });
  const handlers = {
    onEdit: (item: Item) => open(item),
    onArchive: (item: Item) => act(() => SetMemoArchived(item.id, !item.archived), item.archived ? "보관에서 꺼냈습니다." : "보관했습니다. ‘보관’에서 다시 볼 수 있습니다."),
    onDelete: (item: Item) => setDeleteTarget(item),
    onTag: (value: string) => setTag((current) => (current === value ? "" : value)),
  };

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">업무용 · 개인 기록</p>
          <h2>메모 · 할 일</h2>
          <p>떠오른 메모와 해야 할 일을 한곳에 적고, 마감이 다가온 일은 대시보드에서 바로 확인합니다.</p>
        </div>
        <div className="memo-intro-actions">
          <button className="outline-button" onClick={() => open(null, "메모")}>＋ 메모</button>
          <button className="primary-button" onClick={() => open(null, "할 일")}>＋ 할 일</button>
        </div>
      </section>
      <HelpGuide
        title="처음 사용 안내 · 메모 · 할 일"
        description="메모는 자유롭게 적는 색 카드, 할 일은 마감·우선순위·완료 체크가 있는 목록입니다."
        steps={[
          { title: "적기", detail: "‘＋ 메모’ 또는 ‘＋ 할 일’을 누릅니다. 어느 화면에서든 상단 ‘✎ 빠른 메모’(Ctrl+M)로도 적을 수 있습니다." },
          { title: "정리", detail: "태그(쉼표로 나누기)를 붙이면 태그를 눌러 모아 볼 수 있습니다. 중요한 메모는 고정하면 맨 앞과 대시보드에 보입니다." },
          { title: "확인", detail: "할 일은 마감 지남·오늘·이번 주로 묶여 보입니다. 끝나면 체크하고, ‘완료 할 일 보관’으로 한꺼번에 치웁니다." },
        ]}
        note="메모·할 일은 이 컴퓨터의 암호화 보관함에만 저장되고 암호화 백업에 함께 들어갑니다. 화면을 잠그면 내용이 보이지 않습니다."
      />
      <section className="panel memo-toolbar">
        <div className="memo-filters" role="tablist" aria-label="보기">
          {memoFilters.map((value) => (
            <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
              {value} <small>{counts[value]}</small>
            </button>
          ))}
        </div>
        <div className="memo-search-row">
          <input type="search" value={query} placeholder="제목·내용·태그 찾기" aria-label="찾기" onChange={(event) => setQuery(event.target.value)} />
          {doneCount > 0 && <button className="quiet-button" onClick={() => act(ArchiveDoneTodos, `완료한 할 일 ${doneCount}개를 보관했습니다.`)}>완료 할 일 보관 ({doneCount})</button>}
        </div>
        {tags.length > 0 && (
          <div className="memo-tag-row" aria-label="태그">
            {tags.map(({ tag: value, count }) => (
              <button key={value} className={`memo-tag${tag === value ? " active" : ""}`} aria-pressed={tag === value} onClick={() => handlers.onTag(value)}>#{value} <small>{count}</small></button>
            ))}
          </div>
        )}
      </section>

      {visible.length === 0 ? (
        <section className="panel"><p className="empty-state">{items.length ? "조건에 맞는 항목이 없습니다." : "아직 메모·할 일이 없습니다. 위의 ‘＋ 메모’나 ‘＋ 할 일’로 시작하세요."}</p></section>
      ) : (
        <>
          {todos.length > 0 && (
            <section className="panel">
              {filter === "전체" && <h3 className="memo-section-title">할 일</h3>}
              <TodoList items={todos} today={today} onToggle={(item) => act(() => SetMemoDone(item.id, !item.done), item.done ? "완료를 취소했습니다." : "완료했습니다.")} {...handlers} />
            </section>
          )}
          {memos.length > 0 && (
            <section className="panel">
              {filter === "전체" && <h3 className="memo-section-title">메모</h3>}
              <MemoBoard items={memos} onPin={(item) => act(() => SaveMemoItem({ ...item, pinned: !item.pinned }), item.pinned ? "고정을 풀었습니다." : "맨 앞에 고정했습니다.")} {...handlers} />
            </section>
          )}
        </>
      )}
      {notice && <p className="form-notice" role="status">{notice}</p>}

      <MemoEditor open={editor.open} item={editor.item} kind={editor.kind} tagSuggestions={tags.map((t) => t.tag)} onOpenChange={(value) => setEditor((current) => ({ ...current, open: value }))} onSaved={(_, message) => { setNotice(message); void reload(); }} />
      <AlertDialog.Root open={deleteTarget !== null} onOpenChange={(value) => { if (!value) setDeleteTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>{deleteTarget?.kind === "할 일" ? "할 일을 지울까요?" : "메모를 지울까요?"}</AlertDialog.Title>
            <AlertDialog.Description>“{deleteTarget?.title || deleteTarget?.body.slice(0, 30)}”을(를) 지웁니다. 지운 뒤에는 되돌릴 수 없습니다. 나중에 다시 볼 수도 있다면 ‘보관’을 쓰세요.</AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button">취소</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => { const target = deleteTarget; setDeleteTarget(null); if (target) void act(() => DeleteMemoItem(target.id), "지웠습니다."); }}>지우기</button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
