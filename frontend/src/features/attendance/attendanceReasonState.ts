/** 출결 사유 구분(학교생활기록부와 같음, 2026-11-10 정리). Go internal/attendance AttendanceReasonCategoryList와 같아야 한다. */
export const REASON_CATEGORIES = ["질병", "미인정", "기타", "출석인정"] as const;

export type ReasonOption = { value: string; label: string };

/** 사유 구분 선택지. 목록에 없는 예전 값(예: '직접 입력')이 저장돼 있으면 "예전 값: …"으로 하나 더 보여 준다. */
export function reasonOptions(current: string): ReasonOption[] {
  const options: ReasonOption[] = [
    { value: "", label: "선택 안 함" },
    ...REASON_CATEGORIES.map((item) => ({ value: item, label: item })),
  ];
  const value = (current || "").trim();
  if (value && !(REASON_CATEGORIES as readonly string[]).includes(value)) {
    options.push({ value, label: `예전 값: ${value}` });
  }
  return options;
}

export type AttendanceTally = {
  status: "결석" | "지각" | "조퇴" | "결과";
  unit: "일" | "회";
  total: number;
  byReason: { label: string; count: number }[];
};

export type AttendanceSummary = {
  tallies: AttendanceTally[];
  /** 출석인정(결석·지각·조퇴·결과 모두): 학교생활기록부에서 출석으로 치므로 위 집계에서 뺀다. */
  recognised: number;
  experience: number;
};

const TALLY_STATUSES = [
  ["결석", "일"],
  ["지각", "회"],
  ["조퇴", "회"],
  ["결과", "회"],
] as const;

/** 학생 상세 출결 집계. 출석인정은 결석·지각·조퇴·결과에서 빼 따로 세고, 나머지는 질병·미인정·기타·사유 미입력으로 나눈다. */
export function summariseAttendance(entries: { status: string; reasonCategory?: string }[]): AttendanceSummary {
  const counts = new Map<string, Map<string, number>>();
  let recognised = 0;
  let experience = 0;
  for (const entry of entries) {
    if (entry.status === "교외체험학습") {
      experience += 1;
      continue;
    }
    const reason = (entry.reasonCategory || "").trim();
    if (reason === "출석인정" || reason === "인정") {
      if (entry.status !== "출석") recognised += 1;
      continue;
    }
    const byReason = counts.get(entry.status) || new Map<string, number>();
    const label = (REASON_CATEGORIES as readonly string[]).includes(reason) ? reason : reason ? "예전 값" : "사유 미입력";
    byReason.set(label, (byReason.get(label) || 0) + 1);
    counts.set(entry.status, byReason);
  }
  const order = ["질병", "미인정", "기타", "예전 값", "사유 미입력"];
  const tallies = TALLY_STATUSES.map(([status, unit]) => {
    const byReason = counts.get(status) || new Map<string, number>();
    const list = order.filter((label) => byReason.has(label)).map((label) => ({ label, count: byReason.get(label) || 0 }));
    return { status, unit, total: list.reduce((sum, item) => sum + item.count, 0), byReason: list };
  });
  return { tallies, recognised, experience };
}
