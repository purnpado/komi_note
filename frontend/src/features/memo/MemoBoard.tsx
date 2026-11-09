import type { Item } from "../../../bindings/TeacherNote/internal/memo/models";
import { colorClass, sortMemos } from "./memoState";

type Props = {
  items: Item[];
  onEdit: (item: Item) => void;
  onPin: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDelete: (item: Item) => void;
  onTag: (tag: string) => void;
};

/** 메모 색 카드 격자. 고정 메모가 맨 앞에 온다. */
export function MemoBoard({ items, onEdit, onPin, onArchive, onDelete, onTag }: Props) {
  if (!items.length) return null;
  return (
    <div className="memo-board">
      {sortMemos(items).map((item) => (
        <article key={item.id} className={`memo-card ${colorClass[item.color] || "c-default"}${item.pinned ? " pinned" : ""}`}>
          <button type="button" className="memo-card-open" onClick={() => onEdit(item)} aria-label={`메모 열기: ${item.title || item.body.slice(0, 20)}`}>
            {item.pinned && <span className="memo-pin" aria-label="고정됨">📌</span>}
            {item.title && <h4>{item.title}</h4>}
            {item.body && <p>{item.body}</p>}
          </button>
          {(item.tags || []).length > 0 && (
            <div className="memo-card-tags">{(item.tags || []).map((tag) => <button type="button" key={tag} className="memo-tag" onClick={() => onTag(tag)}>#{tag}</button>)}</div>
          )}
          <footer>
            <small>{item.updatedAt.slice(0, 10).replace(/-/g, ". ")}</small>
            <span>
              {!item.archived && <button type="button" className="text-button" onClick={() => onPin(item)}>{item.pinned ? "고정 풀기" : "고정"}</button>}
              <button type="button" className="text-button" onClick={() => onArchive(item)}>{item.archived ? "꺼내기" : "보관"}</button>
              <button type="button" className="text-button danger-text" onClick={() => onDelete(item)}>삭제</button>
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}
