import { useCallback, useEffect, useMemo, useState } from "react";
import { GetScheduleBook } from "../../../bindings/TeacherNote/app";
import type { Event } from "../../../bindings/TeacherNote/internal/schedule/models";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { categoryClass, dayLabel, eventTime, rangeLabel, upcomingEvents } from "./scheduleState";
import "./schedule.css";

/** 대시보드: 오늘부터 7일 안 일정. schedule:변경 알림이 오면 다시 읽는다. */
export function ScheduleWidget({ today, onOpen }: { today: string; onOpen: () => void }) {
  const [events, setEvents] = useState<Event[]>([]);
  const reload = useCallback(() => { GetScheduleBook().then((book) => setEvents(book?.events || [])).catch(() => undefined); }, []);
  useEffect(reload, [reload]);
  useVaultChanges([changeEvents.schedule], reload);
  const upcoming = useMemo(() => upcomingEvents(events, today, 7).slice(0, 6), [events, today]);
  return (
    <section className="panel schedule-widget">
      <div className="panel-heading">
        <div><p className="eyebrow">일정</p><h3>다가오는 일정 · 7일</h3></div>
        <button type="button" className="text-button" onClick={onOpen}>달력 →</button>
      </div>
      {upcoming.length ? (
        <ul>
          {upcoming.map((event) => (
            <li key={event.id} className={categoryClass[event.category] || ""}>
              <button type="button" onClick={onOpen}>
                <span className="widget-day">{event.startDate < today ? "진행 중" : dayLabel(event.startDate, today).split(" · ")[0]}</span>
                <b>{event.title}</b>
                <small>{event.endDate !== event.startDate ? rangeLabel(event) : eventTime(event)}{event.place ? ` · ${event.place}` : ""}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="dashboard-empty">7일 안에 잡힌 일정이 없습니다.</p>}
    </section>
  );
}
