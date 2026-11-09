import * as Dialog from "@radix-ui/react-dialog";
import { CHANGE_KINDS } from "./timetableState";
import { emptyChange, RosterPicker } from "./useTimetablePage";
import { ChangeRow } from "./TimetableParts";
import type { TimetableUi } from "./TimetablePage";

/** 교체·보강·결강 기록 창. */
export function TimetableChangesDialog({ page }: { page: TimetableUi }) {
  const {
    rosters,
    kind,
    notice,
    busy,
    changesOpen,
    setChangesOpen,
    changeDraft,
    setChangeDraft,
    editingChangeID,
    setEditingChangeID,
    showPast,
    setShowPast,
    dialogError,
    isHomeroomTeacher,
    current,
    saveChange,
    removeChange,
    today,
    upcoming,
    past,
  } = page;
  return (
    <Dialog.Root open={changesOpen} onOpenChange={(open) => !busy && setChangesOpen(open)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content timetable-dialog timetable-change-dialog">
          <Dialog.Title>날짜별 교체·보강</Dialog.Title>
          <Dialog.Description className="timetable-dialog-description">
            그날만 바뀌는 수업을 적습니다. 결강은 원래 수업을 취소로 표시하고, 교체·보강은 그 교시 수업을 바꾸거나
            더합니다.
          </Dialog.Description>
          <form
            className="timetable-change-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveChange();
            }}
          >
            <label className="timetable-field">
              <span>날짜</span>
              <input
                type="date"
                required
                value={changeDraft.date}
                onChange={(event) => setChangeDraft({ ...changeDraft, date: event.target.value })}
              />
            </label>
            <label className="timetable-field">
              <span>교시</span>
              <select
                value={changeDraft.period}
                onChange={(event) => setChangeDraft({ ...changeDraft, period: Number(event.target.value) })}
              >
                {current.periods.map((period) => (
                  <option key={period.number} value={period.number}>
                    {period.number}교시 ({period.start})
                  </option>
                ))}
              </select>
            </label>
            <label className="timetable-field">
              <span>종류</span>
              <select
                value={changeDraft.kind}
                onChange={(event) => setChangeDraft({ ...changeDraft, kind: event.target.value })}
              >
                {CHANGE_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            {isHomeroomTeacher && (
              <label className="timetable-field">
                <span>어느 시간표</span>
                <select
                  value={changeDraft.target}
                  onChange={(event) =>
                    setChangeDraft({ ...changeDraft, target: event.target.value, courseRosterId: "" })
                  }
                >
                  <option value="teacher">내 수업</option>
                  <option value="class">우리 반</option>
                </select>
              </label>
            )}
            {changeDraft.kind !== "결강" && (
              <>
                <label className="timetable-field">
                  <span>과목</span>
                  <input
                    maxLength={40}
                    value={changeDraft.subject}
                    onChange={(event) => setChangeDraft({ ...changeDraft, subject: event.target.value })}
                  />
                </label>
                {changeDraft.target === "teacher" ? (
                  <RosterPicker
                    rosters={rosters}
                    rosterID={changeDraft.courseRosterId}
                    className={changeDraft.className}
                    onChange={(courseRosterId, className) =>
                      setChangeDraft({ ...changeDraft, courseRosterId, className })
                    }
                  />
                ) : null}
                <label className="timetable-field">
                  <span>
                    교실 <small>(선택)</small>
                  </span>
                  <input
                    maxLength={40}
                    value={changeDraft.room}
                    onChange={(event) => setChangeDraft({ ...changeDraft, room: event.target.value })}
                  />
                </label>
              </>
            )}
            <label className="timetable-field timetable-change-note">
              <span>
                메모 <small>(선택, 예: 출장·현장체험)</small>
              </span>
              <input
                maxLength={200}
                value={changeDraft.note}
                onChange={(event) => setChangeDraft({ ...changeDraft, note: event.target.value })}
              />
            </label>
            {dialogError && (
              <p className="timetable-notice timetable-dialog-error" role="alert">
                {dialogError}
              </p>
            )}
            <div className="timetable-change-submit">
              {editingChangeID && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    setEditingChangeID("");
                    setChangeDraft(emptyChange(today, kind));
                  }}
                >
                  새로 쓰기
                </button>
              )}
              <button type="submit" className="primary-button" disabled={busy}>
                {editingChangeID ? "고친 내용 저장" : "추가"}
              </button>
            </div>
          </form>
          <div className="timetable-change-list">
            <h3>
              앞으로의 변경 <small>{upcoming.length}건</small>
            </h3>
            {upcoming.length ? (
              upcoming.map((change) => (
                <ChangeRow
                  key={change.id}
                  change={change}
                  showTarget={isHomeroomTeacher}
                  onEdit={() => {
                    setEditingChangeID(change.id);
                    setChangeDraft({ ...change });
                  }}
                  onDelete={() => void removeChange(change)}
                />
              ))
            ) : (
              <p className="timetable-muted">오늘부터 앞으로 적어 둔 변경이 없습니다.</p>
            )}
            {past.length > 0 && (
              <>
                <button
                  type="button"
                  className="text-button"
                  aria-expanded={showPast}
                  onClick={() => setShowPast((value) => !value)}
                >
                  {showPast ? "지난 변경 접기" : `지난 변경 ${past.length}건 보기`}
                </button>
                {showPast &&
                  past.map((change) => (
                    <ChangeRow
                      key={change.id}
                      change={change}
                      showTarget={isHomeroomTeacher}
                      onEdit={() => {
                        setEditingChangeID(change.id);
                        setChangeDraft({ ...change });
                      }}
                      onDelete={() => void removeChange(change)}
                    />
                  ))}
              </>
            )}
          </div>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="quiet-button">
                닫기
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
