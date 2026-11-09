import { type CalendarEntry, categoryClass, dayLabel, rangeLabel, reminderText } from "./scheduleState";

type Props = { days: string[]; today: string; entries: Map<string, CalendarEntry[]>; emptyText: string; onOpen: (entry: CalendarEntry) => void; onAdd: (date: string) => void };

/** 날짜별 목록(이번 주 보기와 고른 날 보기에 함께 쓴다) */
export function DayList({ days, today, entries, emptyText, onOpen, onAdd }: Props) {
  const withItems = days.filter((day) => (entries.get(day) || []).length > 0);
  if (!withItems.length) return <p className="empty-state">{emptyText}</p>;
  return (
    <div className="day-list">
      {days.map((day) => {
        const list = entries.get(day) || [];
        if (!list.length) return null;
        return (
          <section key={day} className={`day-block${day === today ? " today" : ""}`}>
            <header>
              <h4>{dayLabel(day, today)}</h4>
              <button type="button" className="text-button" onClick={() => onAdd(day)}>＋ 이날 일정</button>
            </header>
            <ul>
              {list.map((entry) => (
                <li key={entry.key}>
                  <button type="button" className={`day-entry ${entry.kind} ${categoryClass[entry.category] || ""}`} onClick={() => onOpen(entry)}>
                    <span className="day-time">{entry.kind === "todo" ? "할 일" : entry.kind === "change" ? "시간표" : entry.time || "이어짐"}</span>
                    <span className="day-title">
                      <b>{entry.title}</b>
                      {entry.event && (
                        <small>
                          {entry.event.category}
                          {entry.event.endDate !== entry.event.startDate ? ` · ${rangeLabel(entry.event)}` : ""}
                          {entry.event.place ? ` · ${entry.event.place}` : ""}
                          {(entry.event.reminders || []).length ? ` · 알림 ${reminderText(entry.event.reminders)}` : ""}
                        </small>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
