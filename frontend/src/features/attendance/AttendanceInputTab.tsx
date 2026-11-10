export function AttendanceInputTab(props: any) {
  const { date, weekday, markAllPresent, day, busy, saveAttendance, notice, moveDate, dateInputRef, setDate, summary, studentByID, openStudent, updateEntry, resizeReason } = props;
  return (
    <>
          <section className="attendance-toolbar">
            <div>
              <p className="eyebrow">일별 출결 · 암호화 보관</p>
              <p>
                {date} {weekday(date)}요일 · 전입일 이후의 재학생만 표시됩니다.
              </p>
            </div>
            <div className="page-actions">
              <button
                className="quiet-button"
                onClick={markAllPresent}
                disabled={!day || busy}
              >
                전체 출석 처리
              </button>
              <button
                className="primary-button"
                onClick={() => void saveAttendance()}
                disabled={!day || busy}
              >
                {busy ? "저장 중입니다" : "출결 저장"}
              </button>
            </div>
          </section>
          {notice && (
            <p className={day ? "app-toast" : "app-toast attendance-blocked"} role={day ? "status" : "alert"}>
              {notice}
            </p>
          )}
          <section className="panel attendance">
            <div className="attendance-date">
              <button
                className="date-move-button"
                aria-label="이전 날짜"
                onClick={() => moveDate(-1)}
                disabled={busy}
              >
                ‹
              </button>
              <div className="attendance-date-card">
                <span>
                  출결 기준일 ·{" "}
                  {date.replace(/(\d{4})-(\d{2})-(\d{2})/, "$1년 $2월 $3일")}{" "}
                  {weekday(date)}요일
                </span>
                <label
                  className="attendance-calendar-button"
                  aria-label="출결 기준일 선택"
                >
                  <span aria-hidden="true">▦</span>
                  <input
                    ref={dateInputRef}
                    aria-label="출결 기준일 선택"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
              </div>
              <button
                className="date-move-button"
                aria-label="다음 날짜"
                onClick={() => moveDate(1)}
                disabled={busy}
              >
                ›
              </button>
            </div>
            {day && (
              <>
                <div className="attendance-summary">
                  {(
                    [
                      "출석",
                      "결석",
                      "지각",
                      "조퇴",
                      "결과",
                      "교외체험학습",
                    ] as const
                  ).map((status) => (
                    <span key={status} className={`attendance-count ${status}`}>
                      {status} <b>{summary[status]}명</b>
                    </span>
                  ))}
                </div>
                <div className="attendance-grid attendance-editor-grid">
                  <div className="table-head">
                    <span>번호</span>
                    <span>학생</span>
                    <span>출결 상태</span>
                    <span>사유 구분</span>
                    <span>교시</span>
                    <span>상세 사유</span>
                  </div>
                  {day.entries.map((entry: models.AttendanceEntry) => {
                    const student = studentByID.get(entry.studentId);
                    const absent = entry.status !== "출석";
                    const experienceLearning = entry.status === "교외체험학습";
                    return (
                      <div
                        className="attendance-row attendance-editor-row"
                        key={entry.studentId}
                      >
                        <span>
                          {String(student?.number || entry.departedNumber || 0).padStart(2, "0")}
                        </span>
                        {student ? (
                          <button
                            className="attendance-student-link"
                            onClick={() => openStudent(student)}
                          >
                            {student.name}
                          </button>
                        ) : entry.departedName ? (
                          <strong className="attendance-departed" title="학적변동으로 지금은 명단에 없는 학생(이 날은 재학)">
                            {entry.departedName} <small>(전출)</small>
                          </strong>
                        ) : (
                          <strong>학생 정보 없음</strong>
                        )}
                        <select
                          value={entry.status}
                          onChange={(event) =>
                            updateEntry(entry.studentId, {
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="출석">출석</option>
                          <option value="결석">결석</option>
                          <option value="지각">지각</option>
                          <option value="조퇴">조퇴</option>
                          <option value="결과">결과</option>
                          <option value="교외체험학습">교외체험학습</option>
                        </select>
                        <select
                          value={entry.reasonCategory}
                          disabled={!absent || experienceLearning}
                          onChange={(event) =>
                            updateEntry(entry.studentId, {
                              reasonCategory: event.target.value,
                            })
                          }
                        >
                          <option value="">선택 안 함</option>
                          <option value="질병">질병</option>
                          <option value="미인정">미인정</option>
                          <option value="기타">기타</option>
                          <option value="출석인정">출석인정</option>
                          <option value="직접 입력">직접 입력</option>
                        </select>
                        <input
                          value={entry.period}
                          disabled={
                            !(["지각", "조퇴", "결과"] as string[]).includes(
                              entry.status,
                            )
                          }
                          onChange={(event) =>
                            updateEntry(entry.studentId, {
                              period: event.target.value,
                            })
                          }
                          placeholder={
                            ["지각", "조퇴", "결과"].includes(entry.status)
                              ? "예: 1~2교시"
                              : "결석은 입력 안 함"
                          }
                        />
                        <textarea
                          rows={1}
                          value={entry.reason}
                          disabled={!absent || experienceLearning}
                          onChange={(event) =>
                            updateEntry(entry.studentId, {
                              reason: event.target.value,
                            })
                          }
                          onInput={(event) => resizeReason(event.currentTarget)}
                          placeholder={
                            experienceLearning
                              ? "신청서 제출 · 별도 서류 출력 없음"
                              : absent
                                ? "사유 입력"
                                : "출석"
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                {day.entries.length === 0 && (
                  <p className="empty-state">
                    이 날짜에 출결 대상 재학생이 없습니다.
                  </p>
                )}
              </>
            )}
          </section>
    </>
  );
}
import { main as models } from "../../../wailsjs/go/models";
