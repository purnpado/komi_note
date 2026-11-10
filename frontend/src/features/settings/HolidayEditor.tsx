import { useState } from "react";
import { HelpTip } from "../shared/HelpTip";
import { hasHolidayTable, mergeHolidays, publicHolidaysForSchoolYear, type Holiday } from "./koreanHolidays";

// 학사 일정의 공휴일·학교 휴업일 편집(2026-11-10). 이 날은 출결을 입력하지 않고 결석일수에서도 뺀다.
// 저장은 환경 설정 [저장] 버튼으로 다른 설정과 함께 한다.
export function HolidayEditor({
  schoolYear,
  holidays,
  onChange,
}: {
  schoolYear: string;
  holidays: Holiday[];
  onChange: (next: Holiday[]) => void;
}) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [notice, setNotice] = useState("");
  const list = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  function loadPublic() {
    if (!hasHolidayTable(schoolYear)) {
      setNotice(`${schoolYear}학년도 공휴일 표가 아직 없습니다. 날짜를 직접 추가해 주세요.`);
      return;
    }
    const { list: next, addedCount } = mergeHolidays(list, publicHolidaysForSchoolYear(schoolYear));
    onChange(next);
    setNotice(
      addedCount
        ? `${schoolYear}학년도 평일 공휴일 ${addedCount}일을 넣었습니다. 정부 발표(선거일·임시공휴일 등)와 맞는지 확인한 뒤 [저장]을 눌러 주세요.`
        : "이미 모두 들어 있습니다.",
    );
  }

  function add() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setNotice("휴업일 날짜를 골라 주세요.");
      return;
    }
    const { list: next, addedCount } = mergeHolidays(list, [{ date, name: name.trim() || "휴업일" }]);
    if (!addedCount) {
      setNotice("이미 들어 있는 날짜입니다.");
      return;
    }
    onChange(next);
    setDate("");
    setName("");
    setNotice("");
  }

  return (
    <fieldset className="holiday-editor">
      <legend>
        공휴일·휴업일{" "}
        <HelpTip>
          여기 넣은 날은 출결 입력을 막고, 결석계의 결석일수와 연속 결석 기간을 셀 때 수업일에서 뺍니다. 재량휴업일·개교기념일도
          직접 추가하세요.
        </HelpTip>
      </legend>
      <div className="holiday-actions">
        <button type="button" className="quiet-button" onClick={loadPublic}>
          {schoolYear}학년도 법정 공휴일 불러오기
        </button>
        <label>
          날짜
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          이름
          <input value={name} maxLength={30} placeholder="예: 재량휴업일" onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="button" className="quiet-button" onClick={add}>
          ＋ 추가
        </button>
      </div>
      {notice && (
        <p className="setting-help" role="status">
          {notice}
        </p>
      )}
      {list.length === 0 ? (
        <p className="setting-help">아직 넣은 공휴일·휴업일이 없습니다.</p>
      ) : (
        <ul className="holiday-list">
          {list.map((item) => (
            <li key={item.date}>
              <span>{item.date}</span>
              <b>{item.name}</b>
              <button
                type="button"
                className="text-button"
                aria-label={`${item.date} ${item.name} 빼기`}
                onClick={() => onChange(list.filter((other) => other.date !== item.date))}
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
