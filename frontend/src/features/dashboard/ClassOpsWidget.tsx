import { useCallback, useEffect, useState } from "react";
import { ListCleaningPlans, ListSeatingPlans } from "../../../bindings/TeacherNote/app";
import type { CleaningPlan } from "../../../bindings/TeacherNote/internal/cleaning/models";
import type { SeatingPlan } from "../../../bindings/TeacherNote/internal/seating/models";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { todayLocal } from "../shared/format";
import { ageLabel, latestPlan, planAge, upcomingBirthdays, type BirthdayStudent } from "./classOpsState";
import "./class-ops.css";

type Props = {
  students: BirthdayStudent[];
  onOpenSeating: () => void;
  onOpenCleaning: () => void;
};

/**
 * 대시보드 '학급 운영' 카드(담임만): 다가오는 생일, 자리 바꾼 지 며칠, 청소 편성한 지 며칠.
 * 전자칠판에 비칠 수 있으므로 생일 학생 이름은 [이름 보기]를 눌렀을 때만 보인다(다른 메뉴에 다녀오면 다시 가려짐).
 */
export function ClassOpsWidget({ students, onOpenSeating, onOpenCleaning }: Props) {
  const [seating, setSeating] = useState<SeatingPlan[]>([]);
  const [cleaning, setCleaning] = useState<CleaningPlan[]>([]);
  const [showNames, setShowNames] = useState(false);
  const reload = useCallback(() => {
    ListSeatingPlans()
      .then((items) => setSeating(items || []))
      .catch(() => setSeating([]));
    ListCleaningPlans()
      .then((items) => setCleaning(items || []))
      .catch(() => setCleaning([]));
  }, []);
  useEffect(reload, [reload]);
  useVaultChanges([changeEvents.seating, changeEvents.cleaning, changeEvents.students, changeEvents.settings], reload);

  const today = todayLocal();
  const birthdays = upcomingBirthdays(students, today, 7);
  const todayCount = birthdays.filter((item) => item.daysLeft === 0).length;
  const seat = latestPlan(seating);
  const clean = latestPlan(cleaning);
  const seatAge = seat ? planAge(seat, today) : null;
  const cleanAge = clean ? planAge(clean, today) : null;

  return (
    <section className="panel class-ops-widget" aria-label="학급 운영 요약">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">학급 운영</p>
          <h3>생일 · 자리 · 청소</h3>
        </div>
      </div>
      <ul className="class-ops-list">
        <li className="class-ops-birthday">
          <div className="class-ops-row">
            <span className="class-ops-label">생일</span>
            <strong>
              {!birthdays.length
                ? "7일 안에 생일인 학생이 없습니다"
                : [todayCount ? `오늘 ${todayCount}명` : "", birthdays.length - todayCount ? `7일 안 ${birthdays.length - todayCount}명` : ""]
                    .filter(Boolean)
                    .join(" · ")}
            </strong>
            {birthdays.length > 0 && (
              <button
                type="button"
                className="text-button"
                aria-expanded={showNames}
                onClick={() => setShowNames((value) => !value)}
              >
                {showNames ? "이름 가리기" : "이름 보기"}
              </button>
            )}
          </div>
          {showNames && birthdays.length > 0 && (
            <ol className="class-ops-names">
              {birthdays.map((item) => (
                <li key={item.id} className={item.daysLeft === 0 ? "today" : ""}>
                  <span>
                    {item.month}/{item.day}
                    {item.daysLeft === 0 ? " (오늘)" : ` (${item.daysLeft}일 뒤)`}
                  </span>
                  <b>
                    {item.number}번 {item.name}
                  </b>
                </li>
              ))}
            </ol>
          )}
        </li>
        <li>
          <button type="button" className="class-ops-row class-ops-link" onClick={onOpenSeating}>
            <span className="class-ops-label">자리배정</span>
            {seat && seatAge ? (
              <>
                <strong>{ageLabel(seatAge.days, "바꾼", "바꿈")}</strong>
                <small>{seat.title}</small>
              </>
            ) : (
              <strong className="muted">아직 저장한 자리 배치가 없습니다</strong>
            )}
            <span aria-hidden="true">→</span>
          </button>
        </li>
        <li>
          <button type="button" className="class-ops-row class-ops-link" onClick={onOpenCleaning}>
            <span className="class-ops-label">청소</span>
            {clean && cleanAge ? (
              <>
                <strong>
                  {ageLabel(cleanAge.days, "편성한", "편성")}
                  {cleanAge.ended && <em className="class-ops-ended">기간 끝남</em>}
                </strong>
                <small>{clean.title}</small>
              </>
            ) : (
              <strong className="muted">아직 저장한 청소 편성이 없습니다</strong>
            )}
            <span aria-hidden="true">→</span>
          </button>
        </li>
      </ul>
    </section>
  );
}
