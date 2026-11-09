// 대시보드 '학급 운영' 카드의 계산: 다가오는 생일, 자리배정·청소 편성 뒤 지난 날짜.
// 화면(Wails·React)과 떼어 두어 node 테스트로 확인한다. 날짜는 모두 'YYYY-MM-DD'(컴퓨터 시간대) 기준이다.

export type BirthdayStudent = { id: string; number: number; name: string; birthDate: string };
export type Birthday = { id: string; number: number; name: string; month: number; day: number; daysLeft: number };
export type DatedPlan = { title: string; createdAt: string; startDate?: string; endDate?: string };

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(value: string): [number, number, number] | null {
  const m = DATE.exec((value || "").slice(0, 10));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}

function utcDay(y: number, m: number, d: number) {
  return Date.UTC(y, m - 1, d) / 86400000;
}

function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 두 날짜('YYYY-MM-DD') 사이의 날 수(to - from). 날짜가 잘못되면 null. */
export function daysBetween(from: string, to: string): number | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return null;
  return utcDay(b[0], b[1], b[2]) - utcDay(a[0], a[1], a[2]);
}

/** 저장 시각(RFC3339 등)을 컴퓨터 시간대의 'YYYY-MM-DD'로 바꾼다. 이미 날짜면 그대로. */
export function localDate(value: string): string {
  if (!value) return "";
  if (DATE.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 오늘부터 days일 안(오늘 포함)에 생일이 오는 학생을 가까운 날짜순으로. 2월 29일생은 평년에 2월 28일로 본다. */
export function upcomingBirthdays(students: BirthdayStudent[], today: string, days = 7): Birthday[] {
  const t = parts(today);
  if (!t) return [];
  const result: Birthday[] = [];
  for (const student of students) {
    const b = parts(student.birthDate);
    if (!b) continue;
    let [, month, day] = b;
    let year = t[0];
    const dayIn = (y: number) => (month === 2 && day === 29 && !isLeap(y) ? 28 : day);
    let left = utcDay(year, month, dayIn(year)) - utcDay(t[0], t[1], t[2]);
    if (left < 0) {
      year += 1;
      left = utcDay(year, month, dayIn(year)) - utcDay(t[0], t[1], t[2]);
    }
    if (left <= days) {
      day = dayIn(year);
      result.push({ id: student.id, number: student.number, name: student.name, month, day, daysLeft: left });
    }
  }
  return result.sort((a, b) => a.daysLeft - b.daysLeft || a.number - b.number);
}

/** 가장 최근에 만든 편성(createdAt 기준). 없으면 null. */
export function latestPlan<T extends DatedPlan>(plans: T[] | null | undefined): T | null {
  const list = [...(plans || [])];
  if (!list.length) return null;
  return list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))[0];
}

/** 편성 뒤 지난 날 수(시작일이 미래면 음수). 청소처럼 시작일이 있으면 시작일, 없으면 만든 날 기준. 기간이 지났으면 ended. */
export function planAge(plan: DatedPlan, today: string): { days: number | null; ended: boolean } {
  const base = plan.startDate && DATE.test(plan.startDate) ? plan.startDate : localDate(plan.createdAt);
  const days = daysBetween(base, today);
  const ended = Boolean(plan.endDate && DATE.test(plan.endDate) && today > plan.endDate);
  return { days, ended };
}

/** '바꾼 지 3일', 오늘이면 '오늘 바꿈', 시작일이 아직 안 왔으면 '3일 뒤 시작'. past는 '바꾼', done은 '바꿈'처럼 넘긴다. */
export function ageLabel(days: number | null, past: string, done: string): string {
  if (days === null) return "";
  if (days < 0) return `${-days}일 뒤 시작`;
  return days === 0 ? `오늘 ${done}` : `${past} 지 ${days}일`;
}
