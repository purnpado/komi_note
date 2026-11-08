export function weekday(value: string) {
  const labels = ["일", "월", "화", "수", "목", "금", "토"];
  return labels[new Date(`${value}T12:00:00`).getDay()];
}

export function koreanDate(value: string) {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return matched ? `${matched[1]}년 ${matched[2]}월 ${matched[3]}일` : value;
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
