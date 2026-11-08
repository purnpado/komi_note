import { useEffect, useMemo, useState } from "react";
import { GetTimetableBook, ListCourseRosters } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { PageKey } from "../navigation/menuTypes";
import { setPageFocus } from "../shared/pageFocus";
import { DAY_LABELS, lessonState, lessonsForDate, weekDates, type Lesson } from "./timetableState";

function shortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// DashboardTimetable은 대시보드의 시간표 묶음입니다: 오늘 내 수업, 우리 반 오늘 시간표(담임), 이번 주 시간표.
export function DashboardTimetable({ today, isHomeroomTeacher, navigate }: { today: string; isHomeroomTeacher: boolean; navigate: (page: PageKey) => void }) {
  const [book, setBook] = useState<models.TimetableBook | null>(null);
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [nowMinutes, setNowMinutes] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());

  useEffect(() => {
    let active = true;
    GetTimetableBook().then((value) => active && setBook(new models.TimetableBook(value))).catch(() => undefined);
    ListCourseRosters().then((items) => active && setRosters(items || [])).catch(() => undefined);
    // 지난 수업 흐리게 표시를 위해 1분마다 시각만 갱신한다(자료는 다시 읽지 않음).
    const timer = window.setInterval(() => setNowMinutes(new Date().getHours() * 60 + new Date().getMinutes()), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const lessons = useMemo(() => (book ? lessonsForDate(book, "teacher", today) : []), [book, today]);
  const classLessons = useMemo(() => (book && isHomeroomTeacher ? lessonsForDate(book, "class", today) : []), [book, isHomeroomTeacher, today]);
  const week = useMemo(() => weekDates(today), [today]);
  const weekLessons = useMemo(() => (book ? week.dates.map((date) => lessonsForDate(book, "teacher", date)) : []), [book, week]);

  if (!book) return null;

  const configured = book.periods.length > 0 && book.timetables.some((table) => table.cells.length > 0);
  if (!configured) {
    return (
      <section className="panel dashboard-timetable-setup">
        <div>
          <p className="eyebrow">시간표</p>
          <h3>시간표를 입력하면 오늘 수업이 여기에 나옵니다</h3>
          <p>교시 시간과 내 수업을 한 번 적어 두면 대시보드에서 오늘 수업과 이번 주 시간표를 볼 수 있습니다.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => navigate("시간표")}>시간표 입력하기</button>
      </section>
    );
  }

  const weekend = week.nextWeek;
  const rosterOf = (lesson: Lesson) => rosters.find((roster) => roster.id === lesson.courseRosterId);
  const goRoster = (lesson: Lesson) => {
    setPageFocus("수업 명렬", { courseRosterId: lesson.courseRosterId });
    navigate("수업 명렬");
  };
  const goAssessment = (lesson: Lesson) => {
    const roster = rosterOf(lesson);
    if (!roster) return;
    setPageFocus("평가 관리", { courseRosterId: roster.id, schoolYear: roster.schoolYear, grade: roster.grade, className: roster.className });
    navigate("평가 관리");
  };
  const semesterText = `${book.activeSchoolYear}학년도 ${book.activeSemester}학기`;

  return (
    <section className="dashboard-timetable">
      <div className="panel dashboard-today-lessons">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">오늘 수업 · {semesterText}</p>
            <h3>{weekend ? "주말에는 수업이 없습니다" : lessons.length ? `오늘 내 수업 ${lessons.filter((lesson) => lesson.change !== "결강").length}시간` : "오늘은 내 수업이 없습니다"}</h3>
          </div>
          <button type="button" className="text-button" onClick={() => navigate("시간표")}>시간표 →</button>
        </div>
        {lessons.length > 0 && (
          <ol className="dashboard-lesson-list">
            {lessons.map((lesson) => {
              const state = lessonState(lesson, nowMinutes);
              const linked = rosterOf(lesson);
              return (
                <li key={lesson.period} className={`lesson-${state}${lesson.change === "결강" ? " lesson-cancelled" : ""}`}>
                  <span className="dashboard-lesson-period">
                    <b>{lesson.period}교시</b>
                    <small>{lesson.start}~{lesson.end}</small>
                  </span>
                  <div className="dashboard-lesson-body">
                    <strong>
                      {lesson.subject || "수업"} {lesson.className && <em>{lesson.className}</em>}
                      {lesson.change && <span className={`timetable-change-kind kind-${lesson.change}`}>{lesson.change}</span>}
                      {state === "now" && lesson.change !== "결강" && <span className="dashboard-lesson-now">수업 중</span>}
                    </strong>
                    {(lesson.room || lesson.note) && <small>{[lesson.room, lesson.note].filter(Boolean).join(" · ")}</small>}
                  </div>
                  {linked && lesson.change !== "결강" && (
                    <span className="dashboard-lesson-links">
                      <button type="button" className="text-button" onClick={() => goRoster(lesson)}>명렬</button>
                      <button type="button" className="text-button" onClick={() => goAssessment(lesson)}>평가</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {isHomeroomTeacher && !weekend && (
          <div className="dashboard-class-today">
            <span>우리 반 오늘</span>
            {classLessons.length ? (
              <ol>
                {classLessons.map((lesson) => (
                  <li key={lesson.period} className={lesson.change === "결강" ? "lesson-cancelled" : lesson.change ? "lesson-changed" : ""} title={lesson.change ? `${lesson.change}${lesson.note ? ` · ${lesson.note}` : ""}` : lesson.note || undefined}>
                    <small>{lesson.period}</small>
                    {lesson.subject || "—"}
                  </li>
                ))}
              </ol>
            ) : (
              <em>우리 반 시간표가 비어 있습니다</em>
            )}
          </div>
        )}
      </div>

      <div className="panel dashboard-week">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{weekend ? "다음 주" : "이번 주"} 내 수업</p>
            <h3>{shortDate(week.dates[0])} ~ {shortDate(week.dates[4])}</h3>
          </div>
        </div>
        <div className="dashboard-week-wrap">
          <table className="dashboard-week-table">
            <thead>
              <tr>
                <th scope="col"><span className="sr-only">교시</span></th>
                {week.dates.map((date, index) => (
                  <th scope="col" key={date} className={date === today ? "today" : ""}>
                    {DAY_LABELS[index]} <small>{shortDate(date)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {book.periods.map((period) => (
                <tr key={period.number}>
                  <th scope="row">{period.number}</th>
                  {week.dates.map((date, index) => {
                    const lesson = weekLessons[index]?.find((item) => item.period === period.number);
                    return (
                      <td key={date} className={[date === today ? "today" : "", lesson?.change ? `changed kind-${lesson.change}` : ""].join(" ").trim() || undefined} title={lesson?.change ? `${lesson.change}${lesson.note ? ` · ${lesson.note}` : ""}` : undefined}>
                        {lesson ? (lesson.change === "결강" ? "결강" : lesson.className || lesson.subject) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
