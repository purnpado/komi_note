import "./cleaning.css";
import { main as models } from "../../../wailsjs/go/models";
import { useCleaningPage, makeZone } from "./useCleaningPage";

export function CleaningPage({ students }: { students: models.Student[] }) {
  const {
    plans,
    selectedID,
    title,
    setTitle,
    periodType,
    setPeriodType,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    zones,
    setZones,
    assignments,
    setAssignments,
    notice,
    studentsByNumber,
    previousPlan,
    byStudent,
    duplicateIDs,
    previousZone,
    unvisitedCountByStudent,
    studentsWithUnvisitedZone,
    unassigned,
    loadPlan,
    resetPlan,
    savePlan,
    printPlan,
  } = useCleaningPage({ students });

  return (
    <section className="cleaning-page">
      <header className="cleaning-hero">
        <div>
          <p className="eyebrow">학급 운영 · 청소구역</p>
          <h1>청소구역 편성표</h1>
          <p>교사가 직접 배치하고, 중복과 이전 담당 이력은 경고로만 확인합니다.</p>
        </div>
        <div className="cleaning-actions">
          <button className="secondary-button" type="button" onClick={resetPlan}>
            새 편성표
          </button>
          <button className="accent-button" type="button" onClick={() => void savePlan()}>
            저장
          </button>
          <button className="secondary-button" type="button" onClick={printPlan}>
            인쇄
          </button>
        </div>
      </header>
      <details className="first-use-guide">
        <summary>청소구역 편성 처음 사용 안내</summary>
        <ol>
          <li>
            <b>기간과 제목 설정</b>
            <span>주간·격주·월간·직접 지정 중 운영 기간과 시작·종료일을 정합니다.</span>
          </li>
          <li>
            <b>구역과 필요 인원 추가</b>
            <span>교실·복도처럼 실제 청소구역을 만들고 구역별 필요 인원과 안내를 입력합니다.</span>
          </li>
          <li>
            <b>학생 직접 편성</b>
            <span>
              구역마다 학생을 직접 추가합니다. 노란 경고는 중복 배정·직전 구역·미경험 구역 확인용이며 저장을 막지
              않습니다.
            </span>
          </li>
          <li>
            <b>저장·이력·인쇄</b>
            <span>저장한 편성표는 왼쪽 이력에서 다시 열 수 있고, 인쇄 전에 기간·구역별 인원을 확인합니다.</span>
          </li>
        </ol>
        <p className="first-use-note">
          학생 이름과 배정 이력은 이 컴퓨터의 암호화 보관함에만 저장됩니다. 실제 학생 정보가 포함된 인쇄물은 교실 밖
          공유에 주의하세요.
        </p>
      </details>
      {notice && <p className="form-notice">{notice}</p>}
      <div className="cleaning-layout">
        <aside className="cleaning-history">
          <h2>편성 이력</h2>
          <button type="button" className="history-new" onClick={resetPlan}>
            ＋ 새 기간
          </button>
          {plans.length ? (
            plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                className={plan.id === selectedID ? "history-item active" : "history-item"}
                onClick={() => loadPlan(plan)}
              >
                <strong>{plan.title}</strong>
                <small>
                  {plan.periodType} · {plan.startDate || "날짜 미정"}
                </small>
              </button>
            ))
          ) : (
            <p>저장한 편성표가 없습니다.</p>
          )}
        </aside>
        <main className="cleaning-editor">
          <section className="cleaning-settings">
            <label>
              편성표 제목
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              운영 기간
              <select value={periodType} onChange={(event) => setPeriodType(event.target.value)}>
                <option>주간</option>
                <option>격주</option>
                <option>월간</option>
                <option>직접 지정</option>
              </select>
            </label>
            <label>
              시작일
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              종료일
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </section>
          <section className="cleaning-warnings" aria-live="polite">
            <strong>편성 점검</strong>
            <span className={duplicateIDs.size ? "warning" : "ok"}>중복 배정 {duplicateIDs.size}명</span>
            <span className={unassigned.length ? "warning" : "ok"}>미배정 {unassigned.length}명</span>
            <span className={studentsWithUnvisitedZone ? "warning" : "ok"}>
              미경험 구역이 있는 학생 {studentsWithUnvisitedZone}명
            </span>
            <span>{previousPlan ? `직전 이력: ${previousPlan.title}` : "직전 이력 없음"}</span>
          </section>
          <section className="cleaning-zones">
            {zones.map((zone) => {
              const zoneAssignments = assignments.filter((assignment) => assignment.zoneId === zone.id);
              const difference = zone.requiredCount - zoneAssignments.length;
              return (
                <article className="cleaning-zone" key={zone.id}>
                  <header>
                    <input
                      aria-label="구역 이름"
                      value={zone.name}
                      onChange={(event) =>
                        setZones((current) =>
                          current.map((item) => (item.id === zone.id ? { ...item, name: event.target.value } : item)),
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="구역 삭제"
                      onClick={() => {
                        setZones((current) => current.filter((item) => item.id !== zone.id));
                        setAssignments((current) => current.filter((assignment) => assignment.zoneId !== zone.id));
                      }}
                    >
                      ×
                    </button>
                  </header>
                  <div className="zone-fields">
                    <label>
                      필요 인원
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={zone.requiredCount}
                        onChange={(event) =>
                          setZones((current) =>
                            current.map((item) =>
                              item.id === zone.id ? { ...item, requiredCount: Number(event.target.value) || 1 } : item,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      요일
                      <input
                        placeholder="예: 월·수"
                        value={zone.day}
                        onChange={(event) =>
                          setZones((current) =>
                            current.map((item) => (item.id === zone.id ? { ...item, day: event.target.value } : item)),
                          )
                        }
                      />
                    </label>
                  </div>
                  <input
                    className="zone-note"
                    placeholder="교사용 안내 또는 유의사항"
                    value={zone.note}
                    onChange={(event) =>
                      setZones((current) =>
                        current.map((item) => (item.id === zone.id ? { ...item, note: event.target.value } : item)),
                      )
                    }
                  />
                  <p className={difference === 0 ? "zone-count ok" : "zone-count warning"}>
                    {zoneAssignments.length}/{zone.requiredCount}명{" "}
                    {difference > 0
                      ? `· ${difference}명 더 필요`
                      : difference < 0
                        ? `· ${-difference}명 초과`
                        : "· 인원 충족"}
                  </p>
                  <select
                    value=""
                    aria-label={`${zone.name} 담당 학생 추가`}
                    onChange={(event) => {
                      if (event.target.value)
                        setAssignments((current) => [
                          ...current,
                          { studentId: event.target.value, zoneId: zone.id, note: "" },
                        ]);
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="">학생 직접 추가…</option>
                    {studentsByNumber.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.number}. {student.name}
                      </option>
                    ))}
                  </select>
                  <ul>
                    {zoneAssignments.map((assignment) => {
                      const student = studentsByNumber.find((candidate) => candidate.id === assignment.studentId);
                      const index = assignments.indexOf(assignment);
                      return (
                        <li key={`${assignment.studentId}-${index}`}>
                          <span>
                            {student ? `${student.number}. ${student.name}` : "명렬에서 제외된 학생"}
                            {duplicateIDs.has(assignment.studentId) && <em className="warning">중복</em>}
                            {previousZone.get(assignment.studentId) === zone.id && (
                              <em className="warning">직전 동일</em>
                            )}
                          </span>
                          <button
                            type="button"
                            aria-label="배정 제거"
                            onClick={() =>
                              setAssignments((current) => current.filter((_, currentIndex) => currentIndex !== index))
                            }
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
            <button
              type="button"
              className="add-zone"
              onClick={() => setZones((current) => [...current, makeZone("새 청소구역")])}
            >
              ＋ 청소구역 추가
            </button>
          </section>
        </main>
        <aside className="cleaning-students">
          <h2>학생 배정 현황</h2>
          <p>
            {studentsByNumber.length}명 중 {studentsByNumber.length - unassigned.length}명 배정
          </p>
          {studentsByNumber.map((student) => {
            const studentAssignments = byStudent.get(student.id) || [];
            const unvisited = unvisitedCountByStudent.get(student.id) || 0;
            return (
              <div
                key={student.id}
                className={duplicateIDs.has(student.id) ? "student-assignment warning-box" : "student-assignment"}
              >
                <strong>
                  {student.number}. {student.name}
                </strong>
                <span>
                  {studentAssignments.length
                    ? studentAssignments
                        .map((assignment) => zones.find((zone) => zone.id === assignment.zoneId)?.name || "삭제된 구역")
                        .join(" · ")
                    : "미배정"}
                  {unvisited > 0 && <em> · 미경험 {unvisited}구역</em>}
                </span>
              </div>
            );
          })}
        </aside>
      </div>
    </section>
  );
}
