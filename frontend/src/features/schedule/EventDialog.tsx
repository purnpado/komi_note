import { FormEvent, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SaveScheduleEvent } from "../../../bindings/TeacherNote/app";
import type { Event } from "../../../bindings/TeacherNote/internal/schedule/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { categories, eventProblem, reminderChoices } from "./scheduleState";

type Props = { open: boolean; event: Event | null; date: string; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void; onDelete: (event: Event) => void };

const empty = (date: string): Event => ({ id: "", title: "", startDate: date, endDate: date, allDay: true, startTime: "", endTime: "", category: "학교 행사", place: "", note: "", reminders: [], createdAt: "", updatedAt: "" });

/** 일정 입력·고치기 창 */
export function EventDialog({ open, event, date, onOpenChange, onSaved, onDelete }: Props) {
  const [draft, setDraft] = useState<Event>(empty(date));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDraft(event ? { ...event, reminders: [...(event.reminders || [])] } : empty(date));
    setError("");
  }, [open, event, date]);
  const set = (patch: Partial<Event>) => setDraft((current) => ({ ...current, ...patch }));

  function toggleReminder(minutes: number) {
    const list = draft.reminders || [];
    set({ reminders: list.includes(minutes) ? list.filter((m) => m !== minutes) : [...list, minutes] });
  }

  async function save(formEvent: FormEvent) {
    formEvent.preventDefault();
    const problem = eventProblem({ ...draft, reminders: draft.reminders || [] });
    if (problem) return setError(problem);
    try {
      setBusy(true);
      await SaveScheduleEvent({ ...draft, endDate: draft.endDate || draft.startDate });
      onSaved(event ? "일정을 고쳤습니다." : "일정을 추가했습니다.");
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content event-dialog" aria-describedby={undefined}>
          <Dialog.Title>{event ? "일정 고치기" : "새 일정"}</Dialog.Title>
          <form className="event-form" onSubmit={save}>
            <label className="dialog-label">제목<span className="required-mark"> *</span>
              <input autoFocus value={draft.title} maxLength={100} placeholder="예: 2학년 학부모 상담 주간" onChange={(e) => set({ title: e.target.value })} />
            </label>
            <div className="event-row">
              <label className="dialog-label">시작 날짜<input type="date" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: !draft.endDate || draft.endDate < e.target.value ? e.target.value : draft.endDate })} /></label>
              <label className="dialog-label">끝 날짜<input type="date" value={draft.endDate} min={draft.startDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
              <label className="inline-check event-allday"><input type="checkbox" checked={draft.allDay} onChange={(e) => set({ allDay: e.target.checked, startTime: e.target.checked ? "" : draft.startTime || "09:00" })} /> 종일</label>
            </div>
            {!draft.allDay && (
              <div className="event-row">
                <label className="dialog-label">시작 시각<input type="time" value={draft.startTime || ""} onChange={(e) => set({ startTime: e.target.value })} /></label>
                <label className="dialog-label">끝 시각(선택)<input type="time" value={draft.endTime || ""} onChange={(e) => set({ endTime: e.target.value })} /></label>
              </div>
            )}
            <div className="event-row">
              <label className="dialog-label">분류
                <select value={draft.category} onChange={(e) => set({ category: e.target.value })}>{categories.map((c) => <option key={c}>{c}</option>)}</select>
              </label>
              <label className="dialog-label">장소(선택)<input value={draft.place || ""} maxLength={100} onChange={(e) => set({ place: e.target.value })} /></label>
            </div>
            <label className="dialog-label">메모(선택)<textarea rows={3} value={draft.note || ""} maxLength={2000} onChange={(e) => set({ note: e.target.value })} /></label>
            <fieldset className="event-reminders">
              <legend>미리 알림 <HelpTip>환경 설정에서 ‘Windows 알림’을 켜면 고른 때에 알려 줍니다. 종일 일정은 그날 오전 8시를 기준으로 셉니다.</HelpTip></legend>
              {reminderChoices.map((choice) => (
                <label key={choice.minutes} className="inline-check"><input type="checkbox" checked={(draft.reminders || []).includes(choice.minutes)} onChange={() => toggleReminder(choice.minutes)} /> {choice.label}</label>
              ))}
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              {event && <button type="button" className="danger-button event-delete" disabled={busy} onClick={() => { onOpenChange(false); onDelete(event); }}>삭제</button>}
              <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
              <button className="primary-button" disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
