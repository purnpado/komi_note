// 메모·할 일 화면의 순수 계산: 거르기·찾기·묶기·태그. 저장·Wails 호출은 두지 않는다.

export type MemoKind = "메모" | "할 일";
export type MemoLike = {
  id: string; kind: string; title: string; body: string; color: string; tags: string[] | null;
  pinned: boolean; archived: boolean; dueDate?: string; dueTime?: string; priority?: string;
  done: boolean; doneAt?: string; createdAt: string; updatedAt: string;
};

export const memoFilters = ["전체", "메모", "할 일", "오늘", "이번 주", "완료", "보관"] as const;
export type MemoFilter = (typeof memoFilters)[number];

export const memoColors = ["기본", "파랑", "초록", "노랑", "주황", "빨강", "보라", "회색"] as const;
export const colorClass: Record<string, string> = { 기본: "c-default", 파랑: "c-blue", 초록: "c-green", 노랑: "c-yellow", 주황: "c-orange", 빨강: "c-red", 보라: "c-purple", 회색: "c-gray" };

const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** 이번 주(월~일)의 마지막 날 */
export function weekEnd(today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

function matchesSearch(item: MemoLike, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.title, item.body, ...(item.tags || [])].some((text) => text.toLowerCase().includes(q));
}

export function filterMemos(items: MemoLike[], filter: MemoFilter, today: string, query = "", tag = ""): MemoLike[] {
  const end = weekEnd(today);
  return items.filter((item) => {
    if (tag && !(item.tags || []).includes(tag)) return false;
    if (!matchesSearch(item, query)) return false;
    if (filter === "보관") return item.archived;
    if (item.archived) return false;
    switch (filter) {
      case "메모": return item.kind !== "할 일";
      case "할 일": return item.kind === "할 일" && !item.done;
      case "오늘": return item.kind === "할 일" && !item.done && !!item.dueDate && item.dueDate <= today;
      case "이번 주": return item.kind === "할 일" && !item.done && !!item.dueDate && item.dueDate <= end;
      case "완료": return item.kind === "할 일" && item.done;
      default: return !(item.kind === "할 일" && item.done);
    }
  });
}

export function filterCounts(items: MemoLike[], today: string): Record<MemoFilter, number> {
  return Object.fromEntries(memoFilters.map((f) => [f, filterMemos(items, f, today).length])) as Record<MemoFilter, number>;
}

/** 메모는 고정 먼저, 그다음 최근 고친 순 */
export function sortMemos(items: MemoLike[]) {
  return [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}

const priorityRank: Record<string, number> = { 높음: 0, 보통: 1, 낮음: 2 };

/** 할 일은 마감 날짜·시각 → 우선순위 순, 날짜 없는 것은 뒤로 */
export function sortTodos(items: MemoLike[]) {
  return [...items].sort((a, b) => {
    const da = a.dueDate ? `${a.dueDate} ${a.dueTime || "99:99"}` : "9999";
    const db = b.dueDate ? `${b.dueDate} ${b.dueTime || "99:99"}` : "9999";
    return da.localeCompare(db) || (priorityRank[a.priority || "보통"] ?? 1) - (priorityRank[b.priority || "보통"] ?? 1) || b.updatedAt.localeCompare(a.updatedAt);
  });
}

export type TodoGroup = { key: string; label: string; items: MemoLike[] };

/** 할 일을 지남·오늘·이번 주·나중·날짜 없음·완료로 묶는다 */
export function groupTodos(items: MemoLike[], today: string): TodoGroup[] {
  const end = weekEnd(today);
  const groups: TodoGroup[] = [
    { key: "late", label: "마감 지남", items: [] },
    { key: "today", label: "오늘", items: [] },
    { key: "week", label: "이번 주", items: [] },
    { key: "later", label: "나중", items: [] },
    { key: "none", label: "날짜 없음", items: [] },
    { key: "done", label: "완료", items: [] },
  ];
  const at = (key: string) => groups.find((g) => g.key === key)!.items;
  for (const item of sortTodos(items)) {
    if (item.done) at("done").push(item);
    else if (!item.dueDate) at("none").push(item);
    else if (item.dueDate < today) at("late").push(item);
    else if (item.dueDate === today) at("today").push(item);
    else if (item.dueDate <= end) at("week").push(item);
    else at("later").push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** 쓰인 태그를 많이 쓴 순으로 */
export function tagList(items: MemoLike[]) {
  const counts = new Map<string, number>();
  for (const item of items) if (!item.archived) for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, count]) => ({ tag, count }));
}

/** "업무, #학부모 상담" 같은 글자를 태그 목록으로 */
export function parseTags(text: string) {
  return [...new Set(text.split(/[,\n]/).map((t) => t.trim().replace(/^#+/, "").trim()).filter(Boolean))];
}

export function dueLabel(item: MemoLike, today: string) {
  if (!item.dueDate) return "";
  const [y, m, d] = item.dueDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(ty, tm - 1, td).getTime()) / 86400000);
  const time = item.dueTime ? ` ${item.dueTime}` : "";
  if (days === 0) return `오늘${time}`;
  if (days === 1) return `내일${time}`;
  if (days === -1) return `어제${time} (지남)`;
  if (days < 0) return `${-days}일 지남`;
  return `${m}월 ${d}일${time} · ${days}일 남음`;
}

/** 대시보드: 마감 지남·오늘 할 일(완료 안 함)과 고정 메모 */
export function dashboardMemos(items: MemoLike[], today: string) {
  const active = items.filter((item) => !item.archived);
  return {
    todayTodos: sortTodos(active.filter((item) => item.kind === "할 일" && !item.done && !!item.dueDate && item.dueDate <= today)),
    pinned: sortMemos(active.filter((item) => item.kind !== "할 일" && item.pinned)).slice(0, 4),
    openTodoCount: active.filter((item) => item.kind === "할 일" && !item.done).length,
  };
}
