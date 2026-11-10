import { todayLocal } from "../shared/format";
import type { StudentCardView } from "./useStudentCard";

/** StudentDetail.tsx에서 떼어 낸 화면 구역 */
export function StudentAttendancePanel({ view }: { view: StudentCardView }) {
  const { attendanceYear, setAttendanceYear, attendanceSemester, setAttendanceSemester, attendanceMonth, setAttendanceMonth, attendanceYears, filteredAttendance, attendanceCounts, experienceUsage, semesterExperienceUsage, value, student, config, requestNavigation } = view;
  return (
    <>
      <section className="student-card-grid future-links">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 누적</p>
              <h3>출결</h3>
            </div>
            <button
              className="text-button"
              onClick={() =>
                requestNavigation({
                  destination: "출결 관리",
                  date: todayLocal(),
                })
              }
            >
              출결 관리 →
            </button>
          </div>
          <div className="attendance-filters">
            <select
              value={attendanceYear}
              onChange={(event) => setAttendanceYear(event.target.value)}
            >
              <option value="">전체 학년도</option>
              {attendanceYears.map((year) => (
                <option key={year} value={year}>
                  {year}학년도
                </option>
              ))}
            </select>
            <select
              value={attendanceSemester}
              onChange={(event) => setAttendanceSemester(event.target.value)}
            >
              <option>전체</option>
              <option>1학기</option>
              <option>2학기</option>
            </select>
            <select
              value={attendanceMonth}
              onChange={(event) => setAttendanceMonth(event.target.value)}
            >
              <option>전체</option>
              {Array.from({ length: 12 }, (_, index) =>
                String(index + 1).padStart(2, "0"),
              ).map((month) => (
                <option key={month} value={month}>
                  {Number(month)}월
                </option>
              ))}
            </select>
          </div>
          <div className="student-attendance-summary">
            <span>
              결석 <b>{attendanceCounts.결석 || 0}일</b>
            </span>
            <span>
              지각 <b>{attendanceCounts.지각 || 0}회</b>
            </span>
            <span>
              조퇴 <b>{attendanceCounts.조퇴 || 0}회</b>
            </span>
            <span>
              결과 <b>{attendanceCounts.결과 || 0}회</b>
            </span>
            <span>
              교외체험 <b>{attendanceCounts.교외체험학습 || 0}일</b>
            </span>
          </div>
          {config?.experienceLearningUnit === "학기" ? (
            <div className="experience-usage">
              <span>
                1학기{" "}
                <b>
                  {semesterExperienceUsage("1")} /{" "}
                  {config.semester1ExperienceLimit || 0}일
                </b>
              </span>
              <span>
                2학기{" "}
                <b>
                  {semesterExperienceUsage("2")} /{" "}
                  {config.semester2ExperienceLimit || 0}일
                </b>
              </span>
            </div>
          ) : (
            <div className="experience-usage">
              <span>
                교외체험학습{" "}
                <b>
                  {experienceUsage} / {config?.experienceLearningYearLimit || 0}
                  일
                </b>
                <small>
                  {" "}
                  · 잔여{" "}
                  {Math.max(
                    0,
                    (config?.experienceLearningYearLimit || 0) -
                      experienceUsage,
                  )}
                  일
                </small>
              </span>
            </div>
          )}
          <div className="student-attendance-list">
            {filteredAttendance.length === 0 ? (
              <p className="empty-state">
                선택한 기간의 비출석 기록이 없습니다.
              </p>
            ) : (
              filteredAttendance.map(({ day, entry }) => (
                <button
                  className={`student-attendance-record ${entry.status}`}
                  key={`${day.date}-${entry.studentId}`}
                  onClick={() =>
                    requestNavigation({ destination: "출결 관리", date: day.date })
                  }
                >
                  <time>
                    {entry.startDate || day.date}
                    {entry.endDate ? ` ~ ${entry.endDate}` : ""}
                  </time>
                  <strong>{entry.status}</strong>
                  <span>
                    {entry.status === "교외체험학습"
                      ? "학교장허가 교외체험학습"
                      : `${entry.reasonCategory || "사유 미입력"}${entry.reason ? ` · ${entry.reason}` : ""}`}
                  </span>
                  <small>
                    {entry.status === "결석"
                      ? `${entry.schoolDays || 1}일간`
                      : entry.status === "교외체험학습"
                        ? "1일 사용"
                        : entry.period || "교시 미입력"}
                  </small>
                </button>
              ))
            )}
          </div>
        </article>
        <article className="panel">
          <h3>수행평가 · 학교생활기록</h3>
          <p>평가와 창체·행동특성 기록을 학생별로 연결할 예정입니다.</p>
        </article>
      </section>
    </>
  );
}
