import { useCallback, useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteScheduleEvent, GetMemoBook, GetScheduleBook, GetTimetableBook } from "../../../bindings/TeacherNote/app";
import type { Event } from "../../../bindings/TeacherNote/internal/schedule/models";
import type { PageKey } from "../navigation/menuTypes";
import { HelpGuide } from "../shared/HelpGuide";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage, todayLocal } from "../shared/format";
import { useVaultChanges } from "../shared/useVaultChanges";
import { DayList } from "./DayList";
import { EventDialog } from "./EventDialog";
import { MonthCalendar } from "./MonthCalendar";
import { type CalendarEntry, type ChangeLike, type TodoLike, addDays, entriesByDate, monthGrid, weekDays } from "./scheduleState";
import "./schedule.css";

const showKey = "kkomi-schedule-show";
function loadShow() {
  try { return { todos: true, changes: true, ...JSON.parse(localStorage.getItem(showKey) || "{}") }; } catch { return { todos: true, changes: true }; }
}

export function SchedulePage({ navigate }: { navigate: (page: PageKey) => void }) {
  const today = todayLocal();
  const [events, setEvents] = useState<Event[]>([]);
  const [todos, setTodos] = useState<TodoLike[]>([]);
  const [changes, setChanges] = useState<ChangeLike[]>([]);
  const [view, setView] = useState<"월" | "주">("월");
  const [selected, setSelected] = useState(today);
  const [show, setShow] = useState<{ todos: boolean; changes: boolean }>(loadShow);
  const [dialog, setDialog] = useState<{ open: boolean; event: Event | null; date: string }>({ open: false, event: null, date: today });
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null);
  const [notice, setNotice] = useState("");

  const loadEvents = useCallback(() => GetScheduleBook().then((book) => setEvents(book?.events || [])).catch((e) => setNotice(errorMessage(e))), []);
  const loadTodos = useCallback(() => GetMemoBook().then((book) => setTodos((book?.items || []) as TodoLike[])).catch(() => undefined), []);
  const loadChanges = useCallback(() => GetTimetableBook().then((book) => setChanges((book?.changes || []) as ChangeLike[])).catch(() => undefined), []);
  useEffect(() => { void loadEvents(); void loadTodos(); void loadChanges(); }, [loadEvents, loadTodos, loadChanges]);
  useVaultChanges([changeEvents.schedule, changeEvents.memo, changeEvents.timetable], (name) => {
    if (name === changeEvents.schedule) void loadEvents();
    else if (name === changeEvents.memo) void loadTodos();
    else void loadChanges();
  });
  useEffect(() => { try { localStorage.setItem(showKey, JSON.stringify(show)); } catch { /* 저장 못 해도 화면은 동작 */ } }, [show]);

  const [year, month] = selected.split("-").map(Number);
  const range = view === "월" ? (() => { const grid = monthGrid(year, month); return [grid[0].date, grid[41].date]; })() : (() => { const days = weekDays(selected); return [days[0], days[6]]; })();
  const entries = useMemo(() => entriesByDate(events, todos, changes, range[0], range[1], show), [events, todos, changes, range[0], range[1], show]);

  function move(step: number) {
    if (view === "주") return setSelected(addDays(selected, step * 7));
    const date = new Date(year, month - 1 + step, 1);
    setSelected(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`);
  }
  const add = (date: string) => setDialog({ open: true, event: null, date });
  function openEntry(entry: CalendarEntry) {
    if (entry.event) setDialog({ open: true, event: entry.event as Event, date: entry.date });
    else if (entry.kind === "todo") navigate("메모 · 할 일");
    else navigate("시간표");
  }
  async function remove() {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    try {
      await DeleteScheduleEvent(target.id);
      setNotice("일정을 지웠습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  const title = view === "월" ? `${year}년 ${month}월` : (() => { const d = weekDays(selected); return `${Number(d[0].slice(5, 7))}월 ${Number(d[0].slice(8))}일 ~ ${Number(d[6].slice(5, 7))}월 ${Number(d[6].slice(8))}일`; })();

  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">업무용 · 프로그램 안 일정</p>
          <h2>일정</h2>
          <p>학교 행사·회의·상담 일정을 달력에 적고, 할 일 마감과 시간표 교체·보강을 함께 봅니다.</p>
        </div>
        <button className="primary-button schedule-add" onClick={() => add(selected)}>＋ 일정</button>
      </section>
      <HelpGuide
        title="처음 사용 안내 · 일정"
        description="일정은 이 컴퓨터의 암호화 보관함에만 저장됩니다. 구글 캘린더 연결은 아직 없습니다(나중에 따로 결정)."
        steps={[
          { title: "적기", detail: "‘＋ 일정’을 누르거나 달력 날짜를 두 번 누릅니다(키보드는 날짜에서 Enter). 여러 날 일정과 종일·시각 일정을 만들 수 있습니다." },
          { title: "보기", detail: "‘월’과 ‘주’ 보기를 바꿉니다. 날짜를 한 번 누르면 아래에 그날 목록이 나옵니다." },
          { title: "함께 보기", detail: "할 일 마감과 시간표 교체·보강을 켜고 끌 수 있습니다. 누르면 그 메뉴로 갑니다." },
          { title: "알림", detail: "일정마다 미리 알림을 고를 수 있습니다. 실제 Windows 알림은 환경 설정에서 켜야 울립니다." },
        ]}
        note="학생 이름·상담 내용을 제목에 쓰면 Windows 알림에 보일 수 있습니다. 알림 내용은 기본으로 ‘보호 표시’입니다."
      />
      <section className="panel schedule-panel">
        <div className="schedule-toolbar">
          <div className="schedule-nav">
            <button className="icon-button" onClick={() => move(-1)} aria-label={view === "월" ? "이전 달" : "이전 주"}>‹</button>
            <h3 aria-live="polite">{title}</h3>
            <button className="icon-button" onClick={() => move(1)} aria-label={view === "월" ? "다음 달" : "다음 주"}>›</button>
            <button className="quiet-button" onClick={() => setSelected(today)}>오늘</button>
          </div>
          <div className="schedule-view" role="tablist" aria-label="보기">
            {(["월", "주"] as const).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}
          </div>
          <div className="schedule-show">
            <label className="inline-check"><input type="checkbox" checked={show.todos} onChange={(e) => setShow({ ...show, todos: e.target.checked })} /> 할 일 마감</label>
            <label className="inline-check"><input type="checkbox" checked={show.changes} onChange={(e) => setShow({ ...show, changes: e.target.checked })} /> 시간표 교체·보강</label>
          </div>
        </div>
        {view === "월" ? (
          <>
            <MonthCalendar year={year} month={month} today={today} selected={selected} entries={entries} onSelect={setSelected} onAdd={add} onOpen={openEntry} />
            <div className="schedule-day-detail">
              <DayList days={[selected]} today={today} entries={entries} emptyText={`${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8))}일에는 항목이 없습니다. 날짜를 두 번 누르면 일정을 추가합니다.`} onOpen={openEntry} onAdd={add} />
            </div>
          </>
        ) : (
          <DayList days={weekDays(selected)} today={today} entries={entries} emptyText="이번 주에는 항목이 없습니다." onOpen={openEntry} onAdd={add} />
        )}
      </section>
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <EventDialog open={dialog.open} event={dialog.event} date={dialog.date} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} onSaved={setNotice} onDelete={setDeleteTarget} />
      <AlertDialog.Root open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>일정을 지울까요?</AlertDialog.Title>
            <AlertDialog.Description>“{deleteTarget?.title}” 일정을 지웁니다. 지운 뒤에는 되돌릴 수 없습니다.</AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button">취소</button></AlertDialog.Cancel>
              <AlertDialog.Action asChild><button className="danger-button" onClick={() => void remove()}>지우기</button></AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
