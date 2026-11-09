import { useCallback, useEffect, useMemo, useState } from "react";
import { GetMemoBook, SetMemoDone } from "../../../bindings/TeacherNote/app";
import type { Item } from "../../../bindings/TeacherNote/internal/memo/models";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { colorClass, dashboardMemos, dueLabel } from "./memoState";
import "./memo.css";

/** 대시보드 카드: 오늘까지 할 일(바로 체크)과 고정 메모. memo:변경 알림이 오면 다시 읽는다. */
export function MemoWidgets({ today, onOpen }: { today: string; onOpen: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const reload = useCallback(() => {
    GetMemoBook().then((book) => { setItems(book?.items || []); setError(""); }).catch(() => setError("메모를 불러오지 못했습니다."));
  }, []);
  useEffect(reload, [reload]);
  useVaultChanges([changeEvents.memo], reload);
  const view = useMemo(() => dashboardMemos(items, today), [items, today]);

  return (
    <section className="two-column memo-widgets">
      <div className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">메모 · 할 일</p><h3>내 할 일 · 오늘까지</h3></div>
          <button type="button" className="text-button" onClick={onOpen}>전체 {view.openTodoCount}개 →</button>
        </div>
        {error ? <p className="dashboard-empty">{error}</p> : view.todayTodos.length ? (
          <ul className="widget-todos">
            {view.todayTodos.slice(0, 6).map((item) => (
              <li key={item.id}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={() => void SetMemoDone(item.id, true).catch(() => setError("완료로 바꾸지 못했습니다."))} />
                  <span>{item.title}</span>
                </label>
                <time className={item.dueDate && item.dueDate < today ? "late" : ""}>{dueLabel(item, today)}</time>
              </li>
            ))}
          </ul>
        ) : <p className="dashboard-empty">오늘까지 마감인 할 일이 없습니다.</p>}
      </div>
      <div className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">고정 메모</p><h3>잊지 말 것</h3></div>
          <button type="button" className="text-button" onClick={onOpen}>메모 →</button>
        </div>
        {view.pinned.length ? (
          <div className="widget-memos">
            {view.pinned.map((item) => (
              <button type="button" key={item.id} className={`memo-card mini ${colorClass[item.color] || "c-default"}`} onClick={onOpen}>
                {item.title && <b>{item.title}</b>}
                {item.body && <span>{item.body}</span>}
              </button>
            ))}
          </div>
        ) : <p className="dashboard-empty">고정한 메모가 없습니다. 메모에서 ‘고정’을 누르면 여기에 보입니다.</p>}
      </div>
    </section>
  );
}
