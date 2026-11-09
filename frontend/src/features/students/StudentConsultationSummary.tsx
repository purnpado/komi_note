import type { StudentCardView } from "./useStudentCard";

/** StudentDetail.tsx에서 떼어 낸 화면 구역 */
export function StudentConsultationSummary({ view }: { view: StudentCardView }) {
  const { consultations, consultationYear, setConsultationYear, consultationSemester, setConsultationSemester, consultationMonth, setConsultationMonth, consultationYears, filteredConsultations, value, student, requestNavigation } = view;
  return (
    <>
      <section className="student-card-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">학생별 누적</p>
              <h3>상담 기록</h3>
            </div>
            <span>{filteredConsultations.length}건</span>
          </div>
          <div className="attendance-filters consultation-summary-filters">
            <select
              value={consultationYear}
              onChange={(event) => setConsultationYear(event.target.value)}
            >
              <option value="">전체 학년도</option>
              {consultationYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
            <select
              value={consultationSemester}
              onChange={(event) => setConsultationSemester(event.target.value)}
            >
              <option>전체</option>
              <option>1학기</option>
              <option>2학기</option>
            </select>
            <select
              value={consultationMonth}
              onChange={(event) => setConsultationMonth(event.target.value)}
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
          <div className="student-consultation-recent">
            {filteredConsultations.length === 0 ? (
              <p className="empty-state">선택한 기간의 상담 기록이 없습니다.</p>
            ) : (
              filteredConsultations.slice(0, 3).map((item) => (
                <article key={item.id}>
                  <time>{item.date}</time>
                  <b>
                    {item.parentId ? "↳ " : ""}
                    {item.type}
                  </b>
                  <p>{item.content}</p>
                </article>
              ))
            )}
          </div>
        </article>
        <article className="panel consultation-summary-card">
          <p className="eyebrow">상담 현황</p>
          <h3>상담 기록 요약</h3>
          <div className="consultation-summary-values">
            <span>
              전체 기록 <b>{consultations.length}건</b>
            </span>
            <span>
              상담 흐름{" "}
              <b>{consultations.filter((item) => !item.parentId).length}건</b>
            </span>
            <span>
              확인 필요{" "}
              <b>
                {
                  consultations.filter(
                    (item) => item.followUpDate && !item.followUpDone,
                  ).length
                }
                건
              </b>
            </span>
          </div>
          <p>상담 작성과 후속 기록은 상담 기록 메뉴에서 관리합니다.</p>
          <button
            className="primary-button"
            onClick={() =>
              requestNavigation({ destination: "상담 기록", studentID: student.id })
            }
          >
            상담 기록 열기 →
          </button>
        </article>
      </section>
    </>
  );
}
