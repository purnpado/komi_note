// 학교생활기록 화면의 계산 규칙(글자 수·나이스 바이트·문장 점검·활동 명단 붙여 넣기)입니다.
// 화면과 따로 두어 node 테스트로 검사합니다.

export type Area = "subject" | "autonomy" | "club" | "career" | "behavior" | "freeSemester";
export type TargetKind = "homeroom" | "course" | "list";
export type TabKey = "subject" | "creative" | "behavior" | "freeSemester";

export type TabInfo = {
  key: TabKey;
  label: string;
  description: string;
  homeroomOnly?: boolean;
  areas: Area[];
  targets: TargetKind[];
};

export const areaLabels: Record<Area, string> = {
  subject: "교과세특",
  autonomy: "자율·자치활동",
  club: "동아리활동",
  career: "진로활동",
  behavior: "행동특성 및 종합의견",
  freeSemester: "자유학기 활동",
};

export const tabs: TabInfo[] = [
  { key: "subject", label: "교과세특", description: "수업 반 학생별 과목 세부능력 및 특기사항", areas: ["subject"], targets: ["course"] },
  { key: "creative", label: "창체", description: "자율·자치활동 · 동아리활동 · 진로활동", areas: ["autonomy", "club", "career"], targets: ["homeroom", "list", "course"] },
  { key: "behavior", label: "행동특성", description: "우리 반 학생의 행동특성 및 종합의견(담임)", homeroomOnly: true, areas: ["behavior"], targets: ["homeroom"] },
  { key: "freeSemester", label: "자유학기제", description: "자유학기 활동(주제선택·진로탐색 등)", areas: ["freeSemester"], targets: ["course", "list", "homeroom"] },
];

export function visibleTabs(isHomeroomTeacher: boolean) {
  return tabs.filter((tab) => isHomeroomTeacher || !tab.homeroomOnly);
}

export function availableTargets(tab: TabInfo, isHomeroomTeacher: boolean) {
  return tab.targets.filter((target) => isHomeroomTeacher || target !== "homeroom");
}

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter("ko", { granularity: "grapheme" }) : null;

function normaliseNewlines(text: string) {
  return text.replace(/\r\n?/g, "\n");
}

// charCount는 공백·줄바꿈을 포함한 글자 수입니다(나이스 화면의 글자 수와 같은 방식).
export function charCount(text: string) {
  const value = normaliseNewlines(text);
  if (segmenter) return Array.from(segmenter.segment(value)).length;
  return Array.from(value).length;
}

// neisBytes는 나이스 입력 바이트 기준(한글 3, 영문·숫자·공백 1, 줄바꿈 2)으로 셉니다.
// 그 밖의 기호는 UTF-8 길이로 셉니다.
export function neisBytes(text: string) {
  let bytes = 0;
  for (const char of normaliseNewlines(text)) {
    if (char === "\n") {
      bytes += 2;
      continue;
    }
    const code = char.codePointAt(0) || 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

// byteLimit은 글자 수 한도를 나이스 바이트 한도로 바꿉니다(한글 1자 = 3바이트).
export function byteLimit(charLimit: number) {
  return charLimit * 3;
}

export type Measure = { chars: number; bytes: number; limitChars: number; limitBytes: number; over: boolean };

export function measure(text: string, charLimit: number): Measure {
  const bytes = neisBytes(text);
  const limitBytes = byteLimit(charLimit);
  return { chars: charCount(text), bytes, limitChars: charLimit, limitBytes, over: bytes > limitBytes };
}

// 기재요령상 확인이 필요한 표현 후보입니다. 막지 않고 알려 주기만 합니다.
const cautionWords: { words: string[]; reason: string }[] = [
  { words: ["수상", "입상", "최우수상", "우수상", "장려상", "금상", "은상", "동상"], reason: "수상 실적" },
  { words: ["자격증", "인증시험", "토익", "TOEIC", "토플", "TOEFL", "텝스", "TEPS", "HSK", "JLPT", "한자능력"], reason: "자격·어학 시험" },
  { words: ["논문", "학회", "특허", "출간", "출판"], reason: "논문·도서 출간·특허" },
  { words: ["어학연수", "교외", "학원", "과외", "사교육"], reason: "교외 활동·사교육" },
  { words: ["부모", "아버지", "어머니", "부친", "모친", "직업이"], reason: "부모의 직업·사회경제적 지위" },
  { words: ["장학금", "장학생"], reason: "장학생·장학금" },
  { words: ["모의고사", "등수", "석차"], reason: "성적·석차" },
];

export type TextWarning = { kind: "name" | "caution" | "format"; message: string };

// checkText는 기재 문장에서 확인할 점을 찾습니다(외부 전송 없음, 이 컴퓨터에서만 검사).
export function checkText(text: string, studentNames: string[]): TextWarning[] {
  const value = normaliseNewlines(text).trim();
  if (!value) return [];
  const warnings: TextWarning[] = [];
  const names = [...new Set(studentNames.map((name) => name.trim()).filter((name) => name.length >= 2))];
  const found = names.filter((name) => value.includes(name));
  if (found.length > 0) {
    warnings.push({ kind: "name", message: `학생 이름(${found.join(", ")})이 문장에 들어 있습니다. 학생부에는 이름을 쓰지 않습니다.` });
  }
  for (const group of cautionWords) {
    const hits = group.words.filter((word) => value.toLowerCase().includes(word.toLowerCase()));
    if (hits.length > 0) {
      warnings.push({ kind: "caution", message: `${group.reason} 관련 표현(${hits.join(", ")})이 있습니다. 기재요령상 쓸 수 있는 내용인지 확인해 주세요.` });
    }
  }
  if (/ {2,}/.test(value)) warnings.push({ kind: "format", message: "띄어쓰기가 두 번 이상 들어간 곳이 있습니다." });
  if (/\n/.test(value)) warnings.push({ kind: "format", message: "줄바꿈이 있습니다. 나이스에서는 줄바꿈 하나가 2바이트로 세어집니다." });
  if (!/[.!?。]["'”’)]?$/.test(value)) warnings.push({ kind: "format", message: "문장이 마침표로 끝나지 않습니다." });
  return warnings;
}

export type EntryLike = { text: string; reviewed: boolean; memos: { text: string }[] };
export type EntryStatus = "empty" | "memo" | "writing" | "reviewed";

export function entryStatus(entry: EntryLike | undefined): EntryStatus {
  if (!entry) return "empty";
  if (entry.text.trim()) return entry.reviewed ? "reviewed" : "writing";
  return entry.memos.length > 0 ? "memo" : "empty";
}

export const statusLabels: Record<EntryStatus, string> = {
  empty: "비어 있음",
  memo: "메모만",
  writing: "작성 중",
  reviewed: "검토 완료",
};

export type Progress = { total: number; written: number; reviewed: number };

export function progress(statuses: EntryStatus[]): Progress {
  return {
    total: statuses.length,
    written: statuses.filter((status) => status === "writing" || status === "reviewed").length,
    reviewed: statuses.filter((status) => status === "reviewed").length,
  };
}

export type ParsedMember = { grade: string; className: string; number: string; name: string };

// memberKey는 활동 명단 학생을 가리키는 값입니다(Go records.Member.Key와 같아야 함).
export function memberKey(member: ParsedMember) {
  return `${member.grade}-${member.className}-${member.number}|${member.name}`;
}

function trimNumber(value: string) {
  return value.trim().replace(/^0+(?=\d)/, "");
}

// parseMembers는 엑셀에서 복사한 줄(학년·반·번호·이름) 또는 "2-3-15 홍길동", "2 3 15 홍길동",
// "20315 홍길동"(학년 1자리·반 2자리·번호 2자리) 형식을 학생 목록으로 바꿉니다.
export function parseMembers(text: string): { members: ParsedMember[]; errors: string[] } {
  const members: ParsedMember[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  normaliseNewlines(text)
    .split("\n")
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line) return;
      let parts = line.split(/\t+/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 4) parts = line.replace(/[-.,/]/g, " ").split(/\s+/).filter(Boolean);
      let member: ParsedMember | null = null;
      if (parts.length >= 4 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
        member = { grade: trimNumber(parts[0]), className: trimNumber(parts[1]), number: trimNumber(parts[2]), name: parts.slice(3).join(" ") };
      } else if (parts.length >= 2 && /^\d{5}$/.test(parts[0])) {
        const code = parts[0];
        member = { grade: code.slice(0, 1), className: trimNumber(code.slice(1, 3)), number: trimNumber(code.slice(3)), name: parts.slice(1).join(" ") };
      }
      if (!member || !member.name || /^\d+$/.test(member.name)) {
        if (index === 0 && /학년|이름|성명/.test(line)) return; // 머리글 줄은 건너뛴다
        errors.push(`${index + 1}번째 줄을 읽지 못했습니다: "${line}"`);
        return;
      }
      const key = memberKey(member);
      if (seen.has(key)) {
        errors.push(`${index + 1}번째 줄 학생이 이미 있습니다: ${member.grade}학년 ${member.className}반 ${member.number}번 ${member.name}`);
        return;
      }
      seen.add(key);
      members.push(member);
    });
  return { members, errors };
}

export function sortMembers<T extends ParsedMember>(members: T[]) {
  return [...members].sort(
    (a, b) =>
      Number(a.grade) - Number(b.grade) ||
      a.className.localeCompare(b.className, "ko", { numeric: true }) ||
      Number(a.number) - Number(b.number) ||
      a.name.localeCompare(b.name, "ko"),
  );
}

// recordYears는 고를 수 있는 학년도 목록입니다(최신 먼저).
export function recordYears(configYear: string, others: string[]) {
  const years = new Set<string>();
  if (/^\d{4}$/.test(configYear)) years.add(configYear);
  others.forEach((year) => /^\d{4}$/.test(year) && years.add(year));
  if (years.size === 0) years.add(String(new Date().getFullYear()));
  return [...years].sort((a, b) => b.localeCompare(a));
}
