export function weekday(value: string) {
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  return labels[new Date(`${value}T12:00:00`).getDay()];
}

export function koreanDate(value: string) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return matched ? `${matched[1]}년 ${Number(matched[2])}월 ${Number(matched[3])}일` : value;
}

export function parseHWPXCustomValues(source: string) {
  const values: Record<string, string> = {};
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("기타 치환값은 한 줄에 ‘항목=값’ 형식으로 입력해 주세요.");
    }
    values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return values;
}

/** 학년도: 3월 1일 ~ 다음 해 2월 말. 2027-02-10 → "2026". (2026-11-10: 집계를 달력 연도가 아닌 학년도로) */
export function schoolYearOf(value: string): string {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  if (!year || !month) return "";
  return String(month >= 3 ? year : year - 1);
}

/** 교외체험학습 사용 일수가 허용 일수를 넘는지. 넘으면 안내 문장, 아니면 "". limit 0이면 확인하지 않는다. */
export function experienceOverLimitMessage(name: string, used: number, limit: number, unitLabel: string): string {
  if (!limit || used <= limit) return "";
  return `${name}: 교외체험학습 ${used}일째로 ${unitLabel} 허용 일수 ${limit}일을 넘습니다. 학교 규정을 확인해 주세요.`;
}
