// 학사 일정 '법정 공휴일 불러오기'용 표(2026-11-10 기준으로 알려진 날짜).
// 대체공휴일 규칙: 삼일절·광복절·개천절·한글날·어린이날·부처님오신날·성탄절이 주말이면 다음 평일,
// 설날·추석 연휴가 일요일과 겹치면 연휴 다음 평일. 선거일 등 정부 발표로 바뀔 수 있어 교사가 꼭 확인한다.

export type Holiday = { date: string; name: string };

export const KOREAN_PUBLIC_HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날 연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날 연휴" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "대체공휴일(삼일절)" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "부처님오신날" },
  { date: "2026-05-25", name: "대체공휴일(부처님오신날)" },
  { date: "2026-06-03", name: "전국동시지방선거" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "대체공휴일(광복절)" },
  { date: "2026-09-24", name: "추석 연휴" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-26", name: "추석 연휴" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "대체공휴일(개천절)" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },
  { date: "2027-01-01", name: "신정" },
  { date: "2027-02-06", name: "설날 연휴" },
  { date: "2027-02-07", name: "설날" },
  { date: "2027-02-08", name: "설날 연휴" },
  { date: "2027-02-09", name: "대체공휴일(설날)" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "대체공휴일(광복절)" },
  { date: "2027-09-14", name: "추석 연휴" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석 연휴" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "대체공휴일(개천절)" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "대체공휴일(한글날)" },
  { date: "2027-12-25", name: "성탄절" },
  { date: "2027-12-27", name: "대체공휴일(성탄절)" },
  { date: "2028-01-01", name: "신정" },
  { date: "2028-01-25", name: "설날 연휴" },
  { date: "2028-01-26", name: "설날" },
  { date: "2028-01-27", name: "설날 연휴" },
];

const WEEKEND = new Set([0, 6]);

function isWeekend(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKEND.has(new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

/** 학년도(3월 1일 ~ 다음 해 2월 말)에 들어가는 평일 법정 공휴일. 주말 공휴일은 어차피 출결이 없어 뺀다. */
export function publicHolidaysForSchoolYear(schoolYear: string | number): Holiday[] {
  const year = Number(schoolYear);
  if (!Number.isInteger(year)) return [];
  const start = `${year}-03-01`;
  const end = `${year + 1}-02-29`;
  return KOREAN_PUBLIC_HOLIDAYS.filter((item) => item.date >= start && item.date <= end && !isWeekend(item.date));
}

/** 기존 목록에 새 날짜를 더한다(이미 있는 날짜는 교사가 적은 이름을 그대로 둔다). 날짜순. */
export function mergeHolidays(current: Holiday[], added: Holiday[]): { list: Holiday[]; addedCount: number } {
  const byDate = new Map(current.map((item) => [item.date, item]));
  let addedCount = 0;
  for (const item of added) {
    if (!byDate.has(item.date)) {
      byDate.set(item.date, item);
      addedCount++;
    }
  }
  return { list: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), addedCount };
}

/** 학년도 안에 우리 데이터 표가 없으면(예: 2029학년도) 안내용으로 false. */
export function hasHolidayTable(schoolYear: string | number): boolean {
  return publicHolidaysForSchoolYear(schoolYear).length > 0;
}
