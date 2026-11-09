import * as Dialog from "@radix-ui/react-dialog";
import { DAY_LABELS } from "./timetableState";
import { semesterLabel, RosterPicker } from "./useTimetablePage";
import type { TimetableUi } from "./TimetablePage";

/** 시간표 칸 편집 창. */
export function TimetableCellDialog({ page }: { page: TimetableUi }) {
  const { rosters, kind, view, notice, busy, cellDraft, setCellDraft, dialogError, config, kindLabel, saveCell } = page;
  return (
    <Dialog.Root open={Boolean(cellDraft)} onOpenChange={(open) => !open && !busy && setCellDraft(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content timetable-dialog">
          {cellDraft && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveCell(false);
              }}
            >
              <Dialog.Title>
                {DAY_LABELS[cellDraft.day - 1]}요일 {cellDraft.period}교시
              </Dialog.Title>
              <Dialog.Description className="timetable-dialog-description">
                {semesterLabel(view.year, view.semester)} · {kindLabel}. 모두 비우고 저장하면 공강이 됩니다.
              </Dialog.Description>
              <label className="timetable-field">
                <span>과목</span>
                <input
                  autoFocus
                  maxLength={40}
                  placeholder={kind === "teacher" ? config?.teachingSubject || "예: 과학" : "예: 국어"}
                  value={cellDraft.subject}
                  onChange={(event) => setCellDraft({ ...cellDraft, subject: event.target.value })}
                />
              </label>
              {kind === "teacher" && (
                <RosterPicker
                  rosters={rosters}
                  rosterID={cellDraft.courseRosterId}
                  className={cellDraft.className}
                  onChange={(courseRosterId, className) => setCellDraft({ ...cellDraft, courseRosterId, className })}
                />
              )}
              <label className="timetable-field">
                <span>
                  교실 <small>(선택)</small>
                </span>
                <input
                  maxLength={40}
                  placeholder="예: 과학실"
                  value={cellDraft.room}
                  onChange={(event) => setCellDraft({ ...cellDraft, room: event.target.value })}
                />
              </label>
              <label className="timetable-field">
                <span>
                  메모 <small>(선택{kind === "class" ? ", 예: 담당 선생님" : ""})</small>
                </span>
                <input
                  maxLength={200}
                  value={cellDraft.note}
                  onChange={(event) => setCellDraft({ ...cellDraft, note: event.target.value })}
                />
              </label>
              {dialogError && (
                <p className="timetable-notice timetable-dialog-error" role="alert">
                  {dialogError}
                </p>
              )}
              <div className="dialog-actions">
                <button type="button" className="danger-button" disabled={busy} onClick={() => void saveCell(true)}>
                  칸 비우기
                </button>
                <Dialog.Close asChild>
                  <button type="button" className="quiet-button" disabled={busy}>
                    취소
                  </button>
                </Dialog.Close>
                <button type="submit" className="primary-button" disabled={busy}>
                  저장
                </button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
