// 일정 화면의 순수 계산: 달력 칸, 날짜별 항목(일정·할 일 마감·시간표 교체), 다가오는 일정. Wails 호출은 두지 않는다.

export type EventLike = {
  id: string; title: string; startDate: string; endDate: string; allDay: boolean; startTime?: string; endTime?: string;
  category: string; place?: string; note?: string; reminders: number[] | null;
};
export type TodoLike = { id: string; kind: string; title: string; dueDate?: string; dueTime?: string; done: boolean; archived: boolean };
export type ChangeLike = { id: string; date: string; period: number; kind: string; subject: string; className: string };

export type CalendarEntry = { key: string; date: string; kind: "event" | "todo" | "change"; title: string; time: string; category: string; event?: EventLike; multiDay?: "start" | "middle" | "end" };

export const categories = ["학교 행사", "회의", "상담", "수행평가", "출장·연수", "개인", "기타"] as const;
export const categoryClass: Record<string, string> = { "학교 행사": "k-event", 회의: "k-meeting", 상담: "k-counsel", 수행평가: "k-assess", "출장·연수": "k-trip", 개인: "k-personal", 기타: "k-etc" };
export const reminderChoices = [
  { minutes: 1440, label: "1일 전" }, { minutes: 180, label: "3시간 전" }, { minutes: 60, label: "1시간 전" },
  { minutes: 30, label: "30분 전" }, { minutes: 10, label: "10분 전" },
];
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const parseKey = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
export function addDays(key: string, days: number) { const date = parseKey(key); date.setDate(date.getDate() + days); return dateKey(date); }

/** 달력 6주(일요일 시작) 칸. month는 1~12 */
export function monthGrid(year: number, month: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return { date: dateKey(day), inMonth: day.getMonth() === month - 1 };
  });
}

/** 그 날짜가 들어 있는 주(일~토)의 7일 */
export function weekDays(key: string) {
  const date = parseKey(key);
  return Array.from({ length: 7 }, (_, i) => addDays(key, i - date.getDay()));
}

export function eventTime(event: EventLike) {
  if (event.allDay) return "종일";
  return event.endTime ? `${event.startTime}~${event.endTime}` : event.startTime || "";
}

/** 날짜별 항목. 여러 날 일정은 기간 동안 매일 보인다. 할 일·교체는 켰을 때만. */
export function entriesByDate(events: EventLike[], todos: TodoLike[], changes: ChangeLike[], from: string, to: string, show: { todos: boolean; changes: boolean }) {
  const map = new Map<string, CalendarEntry[]>();
  const push = (entry: CalendarEntry) => {
    if (entry.date < from || entry.date > to) return;
    map.set(entry.date, [...(map.get(entry.date) || []), entry]);
  };
  for (const event of events) {
    const end = event.endDate || event.startDate;
    for (let day = event.startDate < from ? from : event.startDate; day <= end && day <= to; day = addDays(day, 1)) {
      const multi = end !== event.startDate ? (day === event.startDate ? "start" : day === end ? "end" : "middle") : undefined;
      push({ key: `e-${event.id}-${day}`, date: day, kind: "event", title: event.title, time: day === event.startDate ? eventTime(event) : "", category: event.category, event, multiDay: multi });
    }
  }
  if (show.todos) for (const todo of todos) {
    if (todo.kind === "할 일" && todo.dueDate && !todo.archived) push({ key: `t-${todo.id}`, date: todo.dueDate, kind: "todo", title: todo.title, time: todo.dueTime || "", category: todo.done ? "완료" : "할 일" });
  }
  if (show.changes) for (const change of changes) {
    push({ key: `c-${change.id}`, date: change.date, kind: "change", title: `${change.period}교시 ${change.kind}${change.subject ? ` · ${change.subject}` : ""}${change.className ? ` ${change.className}` : ""}`, time: "", category: change.kind });
  }
  for (const list of map.values()) {
    list.sort((a, b) => rank(a) - rank(b) || (a.time === "종일" ? -1 : b.time === "종일" ? 1 : a.time.localeCompare(b.time)) || a.title.localeCompare(b.title));
  }
  return map;
}
const rank = (entry: CalendarEntry) => (entry.kind === "event" ? (entry.multiDay ? 0 : 1) : entry.kind === "change" ? 2 : 3);

/** 오늘부터 days일 안의 일정(오늘 진행 중인 여러 날 일정 포함) */
export function upcomingEvents(events: EventLike[], today: string, days = 7) {
  const last = addDays(today, days - 1);
  return events
    .filter((event) => (event.endDate || event.startDate) >= today && event.startDate <= last)
    .sort((a, b) => `${a.startDate} ${a.allDay ? "00:00" : a.startTime}`.localeCompare(`${b.startDate} ${b.allDay ? "00:00" : b.startTime}`));
}

export function dayLabel(key: string, today: string) {
  const diff = Math.round((parseKey(key).getTime() - parseKey(today).getTime()) / 86400000);
  const date = parseKey(key);
  const base = `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
  if (diff === 0) return `오늘 · ${base}`;
  if (diff === 1) return `내일 · ${base}`;
  return base;
}

export function rangeLabel(event: EventLike) {
  const start = parseKey(event.startDate);
  const text = `${start.getMonth() + 1}월 ${start.getDate()}일`;
  if (event.endDate && event.endDate !== event.startDate) {
    const end = parseKey(event.endDate);
    return `${text} ~ ${end.getMonth() + 1}월 ${end.getDate()}일`;
  }
  return text;
}

export function reminderText(reminders: number[] | null) {
  return (reminders || []).map((m) => reminderChoices.find((c) => c.minutes === m)?.label || `${m}분 전`).join(", ");
}

/** 입력 창 검사(Go에서도 다시 검사) */
export function eventProblem(event: EventLike) {
  if (!event.title.trim()) return "일정 제목을 입력해 주세요.";
  if (!event.startDate) return "시작 날짜를 골라 주세요.";
  if (event.endDate && event.endDate < event.startDate) return "끝 날짜가 시작 날짜보다 앞설 수 없습니다.";
  if (!event.allDay && !event.startTime) return "시작 시각을 고르거나 ‘종일’을 켜 주세요.";
  if (!event.allDay && event.endTime && (event.endDate || event.startDate) === event.startDate && event.endTime < (event.startTime || "")) return "끝 시각이 시작 시각보다 앞설 수 없습니다.";
  return "";
}
