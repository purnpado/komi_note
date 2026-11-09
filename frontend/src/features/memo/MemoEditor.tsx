import { FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SaveMemoItem } from "../../../bindings/TeacherNote/app";
import type { Item } from "../../../bindings/TeacherNote/internal/memo/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { type MemoKind, colorClass, memoColors, parseTags } from "./memoState";
import { remindProblem } from "../reminders/reminderState";

type Props = {
  open: boolean;
  item: Item | null;
  kind: MemoKind;
  tagSuggestions: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: (saved: Item, message: string) => void;
};

const empty = (kind: MemoKind): Item => ({ id: "", kind, title: "", body: "", color: "기본", tags: [], pinned: false, archived: false, done: false, priority: "보통", createdAt: "", updatedAt: "" });

/** 메모·할 일 입력 창. 빠른 메모 창도 이 창을 쓴다. */
export function MemoEditor({ open, item, kind, tagSuggestions, onOpenChange, onSaved }: Props) {
  const [draft, setDraft] = useState<Item>(empty(kind));
  const [tagText, setTagText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = item ? { ...item, tags: [...(item.tags || [])] } : empty(kind);
    setDraft(start);
    setTagText((start.tags || []).join(", "));
    setError("");
  }, [open, item, kind]);

  const set = (patch: Partial<Item>) => setDraft((current) => ({ ...current, ...patch }));
  const isTodo = draft.kind === "할 일";

  async function save(event: FormEvent) {
    event.preventDefault();
    if (isTodo && !draft.title.trim()) return setError("할 일 제목을 입력해 주세요.");
    if (!draft.title.trim() && !draft.body.trim()) return setError("제목이나 내용을 입력해 주세요.");
    if (draft.dueTime && !draft.dueDate) return setError("마감 시각을 쓰려면 마감 날짜도 골라 주세요.");
    const remind = draft.remindAt !== item?.remindAt ? remindProblem(draft.remindAt || "", new Date()) : "";
    if (remind) return setError(remind);
    try {
      setBusy(true);
      const saved = await SaveMemoItem({ ...draft, tags: parseTags(tagText) });
      if (saved) onSaved(saved, item ? "고쳤습니다." : isTodo ? "할 일을 추가했습니다." : "메모를 저장했습니다.");
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const addTag = (tag: string) => {
    const tags = parseTags(tagText);
    if (!tags.includes(tag)) setTagText([...tags, tag].join(", "));
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content memo-editor" aria-describedby={undefined}>
          <Dialog.Title>{item ? (isTodo ? "할 일 고치기" : "메모 고치기") : isTodo ? "새 할 일" : "새 메모"}</Dialog.Title>
          <form onSubmit={save} className="memo-editor-form">
            {!item && (
              <div className="memo-kind-switch" role="radiogroup" aria-label="종류">
                {(["메모", "할 일"] as const).map((value) => (
                  <button type="button" key={value} role="radio" aria-checked={draft.kind === value} className={draft.kind === value ? "active" : ""} onClick={() => set({ kind: value })}>{value === "메모" ? "▤ 메모" : "☑ 할 일"}</button>
                ))}
              </div>
            )}
            <label className="dialog-label">제목{isTodo && <span className="required-mark"> *</span>}
              <input autoFocus value={draft.title} maxLength={100} placeholder={isTodo ? "예: 체험학습 동의서 걷기" : "제목(선택)"} onChange={(event) => set({ title: event.target.value })} />
            </label>
            <label className="dialog-label">{isTodo ? "메모(선택)" : "내용"}
              <textarea rows={isTodo ? 3 : 6} value={draft.body} maxLength={5000} onChange={(event) => set({ body: event.target.value })} />
            </label>
            {isTodo ? (
              <div className="memo-editor-row">
                <label className="dialog-label">마감 날짜<input type="date" value={draft.dueDate || ""} onChange={(event) => set({ dueDate: event.target.value, dueTime: event.target.value ? draft.dueTime : "" })} /></label>
                <label className="dialog-label">시각(선택)<input type="time" value={draft.dueTime || ""} disabled={!draft.dueDate} onChange={(event) => set({ dueTime: event.target.value })} /></label>
                <label className="dialog-label">우선순위
                  <select value={draft.priority || "보통"} onChange={(event) => set({ priority: event.target.value })}>
                    <option>높음</option><option>보통</option><option>낮음</option>
                  </select>
                </label>
              </div>
            ) : (
              <div className="memo-editor-row">
                <fieldset className="memo-color-picker">
                  <legend>색</legend>
                  {memoColors.map((color) => (
                    <label key={color} className={`memo-swatch ${colorClass[color]}${draft.color === color ? " selected" : ""}`} title={color}>
                      <input type="radio" name="memo-color" value={color} checked={draft.color === color} onChange={() => set({ color })} />
                      <span className="sr-only">{color}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="inline-check"><input type="checkbox" checked={draft.pinned} onChange={(event) => set({ pinned: event.target.checked })} /> 맨 앞에 고정 <HelpTip>고정한 메모는 목록 맨 앞과 대시보드에 보입니다.</HelpTip></label>
              </div>
            )}
            <label className="dialog-label">미리 알림(선택) <HelpTip>고른 시각에 Windows 알림과 상단 ‘확인할 알림’으로 알려 줍니다. 환경 설정에서 ‘미리 알림 쓰기’를 켜야 울립니다.</HelpTip>
              <span className="memo-remind-row">
                <input type="datetime-local" value={draft.remindAt || ""} onChange={(event) => set({ remindAt: event.target.value })} />
                {draft.remindAt && <button type="button" className="text-button" onClick={() => set({ remindAt: "" })}>알림 지우기</button>}
              </span>
            </label>
            <label className="dialog-label">태그(쉼표로 나누기)
              <input value={tagText} placeholder="예: 업무, 학부모" onChange={(event) => setTagText(event.target.value)} />
            </label>
            {tagSuggestions.length > 0 && (
              <div className="memo-tag-suggest">{tagSuggestions.slice(0, 8).map((tag) => <button type="button" key={tag} className="memo-tag" onClick={() => addTag(tag)}>#{tag}</button>)}</div>
            )}
            <p className="memo-privacy-note">이 컴퓨터의 암호화 보관함에만 저장됩니다. 학생 이름을 써도 밖으로 나가지 않지만, Windows 알림 제목에는 학생 이름을 쓰지 않는 것이 좋습니다.</p>
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
