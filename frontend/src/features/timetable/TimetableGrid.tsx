import { Fragment } from "react";
import { DAY_LABELS, cellAt } from "./timetableState";
import { semesterLabel } from "./useTimetablePage";
import type { TimetableUi } from "./TimetablePage";

/** 시간표 표 구역: 학기·종류 고르기와 요일×교시 표. */
export function TimetableGrid({ page }: { page: TimetableUi }) {
  const {
    kind,
    setKind,
    view,
    busy,
    yearOptions,
    isHomeroomTeacher,
    current,
    isActive,
    lunch,
    kindLabel,
    classTitle,
    openCell,
    openBell,
    changeSemester,
    makeActive,
  } = page;
  return (
    <section className="panel timetable-panel">
      <div className="timetable-toolbar">
        <div className="timetable-tabs" role="tablist" aria-label="시간표 종류">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "teacher"}
            className={kind === "teacher" ? "active" : ""}
            onClick={() => setKind("teacher")}
          >
            내 수업 시간표
          </button>
          {isHomeroomTeacher && (
            <button
              type="button"
              role="tab"
              aria-selected={kind === "class"}
              className={kind === "class" ? "active" : ""}
              onClick={() => setKind("class")}
            >
              우리 반 시간표 <small>{classTitle}</small>
            </button>
          )}
        </div>
        <div className="timetable-semester">
          <label>
            <span className="sr-only">학년도</span>
            <select
              aria-label="학년도"
              value={view.year}
              onChange={(event) => void changeSemester(event.target.value, view.semester)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}학년도
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">학기</span>
            <select
              aria-label="학기"
              value={view.semester}
              onChange={(event) => void changeSemester(view.year, event.target.value)}
            >
              <option value="1">1학기</option>
              <option value="2">2학기</option>
            </select>
          </label>
          {isActive ? (
            <span className="timetable-active-badge">지금 쓰는 시간표</span>
          ) : (
            <button type="button" className="text-button" disabled={busy} onClick={() => void makeActive()}>
              지금 쓰는 시간표로 정하기
            </button>
          )}
        </div>
      </div>

      {!current.periods.length ? (
        <div className="timetable-empty">
          <strong>아직 교시 시간이 없습니다</strong>
          <p>학교마다 1교시 시작과 점심시간이 다르므로, 먼저 우리 학교 교시 시각을 넣어 주세요.</p>
          <button type="button" className="primary-button" onClick={openBell}>
            교시 시간 설정
          </button>
        </div>
      ) : (
        <div className="timetable-grid-wrap">
          <table className="timetable-grid" aria-label={`${semesterLabel(view.year, view.semester)} ${kindLabel}`}>
            <thead>
              <tr>
                <th scope="col">교시</th>
                {DAY_LABELS.map((day) => (
                  <th scope="col" key={day}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.periods.map((period) => (
                <Fragment key={period.number}>
                  <tr>
                    <th scope="row">
                      <b>{period.number}교시</b>
                      <small>
                        {period.start}~{period.end}
                      </small>
                    </th>
                    {DAY_LABELS.map((day, index) => {
                      const cell = cellAt(current, kind, index + 1, period.number, view.year, view.semester);
                      return (
                        <td key={day}>
                          <button
                            type="button"
                            className={cell ? "timetable-cell filled" : "timetable-cell"}
                            aria-label={`${day}요일 ${period.number}교시 ${cell ? `${cell.subject} ${cell.className}` : "비어 있음"} 고치기`}
                            onClick={() => openCell(index + 1, period.number)}
                          >
                            {cell ? (
                              <>
                                <strong>{cell.subject || "(과목 없음)"}</strong>
                                {(cell.className || cell.room) && (
                                  <span>{[cell.className, cell.room].filter(Boolean).join(" · ")}</span>
                                )}
                                {cell.note && <small>{cell.note}</small>}
                                {cell.courseRosterId && (
                                  <i aria-hidden="true" title="수업 명렬과 연결됨">
                                    명렬
                                  </i>
                                )}
                              </>
                            ) : (
                              <span className="timetable-cell-empty">＋</span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {lunch === period.number && (
                    <tr className="timetable-lunch">
                      <th scope="row">점심</th>
                      <td colSpan={5}>
                        {period.end} ~ {current.periods[period.number]?.start}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
