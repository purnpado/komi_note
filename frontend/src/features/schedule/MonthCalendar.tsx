import { type CalendarEntry, WEEKDAYS, categoryClass, monthGrid } from "./scheduleState";

type Props = {
  year: number;
  month: number;
  today: string;
  selected: string;
  entries: Map<string, CalendarEntry[]>;
  onSelect: (date: string) => void;
  onAdd: (date: string) => void;
  onOpen: (entry: CalendarEntry) => void;
};

const MAX_IN_CELL = 3;

/** 월 달력. 날짜 칸을 두 번 누르면 그날 새 일정, 항목을 누르면 열기. */
export function MonthCalendar({ year, month, today, selected, entries, onSelect, onAdd, onOpen }: Props) {
  const cells = monthGrid(year, month);
  return (
    <div className="month-calendar" role="grid" aria-label={`${year}년 ${month}월 달력`}>
      {WEEKDAYS.map((day, i) => <div key={day} role="columnheader" className={`month-head${i === 0 ? " sun" : i === 6 ? " sat" : ""}`}>{day}</div>)}
      {cells.map(({ date, inMonth }, index) => {
        const list = entries.get(date) || [];
        const weekday = index % 7;
        return (
          <div
            key={date}
            role="gridcell"
            tabIndex={date === selected ? 0 : -1}
            aria-selected={date === selected}
            aria-label={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일, 항목 ${list.length}개`}
            className={`month-cell${inMonth ? "" : " out"}${date === today ? " today" : ""}${date === selected ? " selected" : ""}`}
            onClick={() => onSelect(date)}
            onDoubleClick={() => onAdd(date)}
            onKeyDown={(e) => { if (e.key === "Enter") onAdd(date); }}
          >
            <span className={`month-day${weekday === 0 ? " sun" : weekday === 6 ? " sat" : ""}`}>{Number(date.slice(8))}</span>
            <ul>
              {list.slice(0, MAX_IN_CELL).map((entry) => (
                <li key={entry.key}>
                  <button
                    type="button"
                    className={`cal-chip ${entry.kind} ${categoryClass[entry.category] || ""}${entry.multiDay ? ` span-${entry.multiDay}` : ""}`}
                    onClick={(e) => { e.stopPropagation(); onOpen(entry); }}
                    title={`${entry.time ? `${entry.time} ` : ""}${entry.title}`}
                  >
                    {entry.kind === "todo" && <span aria-hidden="true">☐ </span>}
                    {entry.time && entry.time !== "종일" && <b>{entry.time.slice(0, 5)} </b>}
                    {entry.multiDay === "middle" || entry.multiDay === "end" ? <span className="cal-cont">{entry.title}</span> : entry.title}
                  </button>
                </li>
              ))}
              {list.length > MAX_IN_CELL && <li className="cal-more">+{list.length - MAX_IN_CELL}개 더</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
