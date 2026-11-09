import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DismissReminder, GetReminderInbox, SnoozeReminder } from "../../../bindings/TeacherNote/app";
import type { ReminderInboxItem } from "../../../bindings/TeacherNote/models";
import type { PageKey } from "../navigation/menuTypes";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage } from "../shared/format";
import { useVaultChanges } from "../shared/useVaultChanges";
import { inboxNote, inboxTarget } from "./reminderState";
import "./reminders.css";

/** 상단 '확인할 알림' 단추: Windows 알림이 막혔거나 조용한 시간·꺼져 있던 동안의 알림도 여기에 남는다. */
export function ReminderInbox({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [items, setItems] = useState<ReminderInboxItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const reload = useCallback(() => { GetReminderInbox().then((list) => setItems(list || [])).catch(() => setItems([])); }, []);
  useEffect(reload, [reload]);
  useVaultChanges([changeEvents.reminder], reload);

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      setError("");
      reload();
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className={`quiet-button reminder-bell${items.length ? " has-items" : ""}`} title="확인할 알림" aria-label={`확인할 알림 ${items.length}개`}>
          🔔{items.length > 0 && <b>{items.length}</b>}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content reminder-dialog" aria-describedby="reminder-help">
          <Dialog.Title>확인할 알림</Dialog.Title>
          <p id="reminder-help" className="reminder-help">일정·할 일 미리 알림이 여기에 모입니다. 프로그램을 끄면 목록은 비워집니다.</p>
          {items.length === 0 ? <p className="empty-state">확인할 알림이 없습니다.</p> : (
            <ul className="reminder-list">
              {items.map((item) => (
                <li key={item.key} className={item.missed ? "missed" : ""}>
                  <button type="button" className="reminder-main" onClick={() => { setOpen(false); onNavigate(inboxTarget(item)); }}>
                    <b>{item.title || "(제목 없음)"}</b>
                    <small>{inboxNote(item)}</small>
                  </button>
                  <span className="reminder-actions">
                    <button type="button" className="text-button" onClick={() => void act(() => SnoozeReminder(item.key, 10))}>10분 뒤 다시</button>
                    <button type="button" className="text-button" onClick={() => void act(() => DismissReminder(item.key))}>확인</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            {items.length > 1 && <button type="button" className="quiet-button" onClick={() => void act(() => DismissReminder(""))}>모두 확인</button>}
            <Dialog.Close asChild><button className="primary-button">닫기</button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
