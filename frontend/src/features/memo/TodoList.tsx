import type { Item } from "../../../bindings/TeacherNote/internal/memo/models";
import { dueLabel, groupTodos } from "./memoState";

type Props = {
  items: Item[];
  today: string;
  onToggle: (item: Item) => void;
  onEdit: (item: Item) => void;
  onArchive: (item: Item) => void;
  onDelete: (item: Item) => void;
  onTag: (tag: string) => void;
};

/** 할 일 목록: 마감 지남·오늘·이번 주·나중·날짜 없음·완료로 묶어 보여 준다. */
export function TodoList({ items, today, onToggle, onEdit, onArchive, onDelete, onTag }: Props) {
  if (!items.length) return null;
  return (
    <div className="todo-groups">
      {groupTodos(items, today).map((group) => (
        <section key={group.key} className={`todo-group ${group.key}`}>
          <h4>{group.label} <small>{group.items.length}</small></h4>
          <ul>
            {group.items.map((item) => (
              <li key={item.id} className={`todo-row${item.done ? " done" : ""} p-${item.priority || "보통"}`}>
                <label className="todo-check">
                  <input type="checkbox" checked={item.done} onChange={() => onToggle(item)} />
                  <span className="sr-only">{item.done ? "완료 취소" : "완료"}</span>
                </label>
                <button type="button" className="todo-main" onClick={() => onEdit(item)}>
                  <b>{item.title}</b>
                  {item.body && <small>{item.body.split("\n")[0]}</small>}
                </button>
                <span className="todo-meta">
                  {item.priority === "높음" && <em className="todo-priority">중요</em>}
                  {(item.tags || []).map((tag) => <button type="button" key={tag} className="memo-tag" onClick={() => onTag(tag)}>#{tag}</button>)}
                  {item.dueDate && <time className={!item.done && item.dueDate < today ? "late" : ""}>{dueLabel(item, today)}</time>}
                </span>
                <span className="todo-actions">
                  <button type="button" className="text-button" onClick={() => onArchive(item)}>{item.archived ? "꺼내기" : "보관"}</button>
                  <button type="button" className="text-button danger-text" onClick={() => onDelete(item)}>삭제</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
