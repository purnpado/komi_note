// 상담 기록 화면의 계산 규칙(확인할 일·찾기·학생 상태·인쇄 순서)입니다. node 테스트로 검사합니다.

export type ConsultLike = {
  id: string;
  studentId: string;
  parentId: string;
  rootId: string;
  date: string;
  type: string;
  content: string;
  followUpDate: string;
  followUpDone: boolean;
  recordedAt: string;
};

// pendingFollowUps는 예정일이 있고 아직 확인하지 않은 기록이다. 예정일이 이른 것(지난 것)부터.
export function pendingFollowUps<T extends ConsultLike>(items: T[]) {
  return items
    .filter((item) => item.followUpDate && !item.followUpDone)
    .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate) || a.date.localeCompare(b.date));
}

export type StudentStatus = { total: number; overdue: number; planned: number; lastDate: string };

export function studentStatus(items: ConsultLike[], studentId: string, today: string): StudentStatus {
  const mine = items.filter((item) => item.studentId === studentId);
  const pending = pendingFollowUps(mine);
  return {
    total: mine.length,
    overdue: pending.filter((item) => item.followUpDate < today).length,
    planned: pending.filter((item) => item.followUpDate >= today).length,
    lastDate: mine.reduce((latest, item) => (item.date > latest ? item.date : latest), ""),
  };
}

export type SearchFilter = { studentId: string; type: string; from: string; to: string; query: string };

// searchConsultations는 학생·유형·기간·낱말(내용·유형)로 찾는다. 최신 상담부터.
export function searchConsultations<T extends ConsultLike>(items: T[], filter: SearchFilter) {
  const words = filter.query.trim().split(/\s+/).filter(Boolean);
  return items
    .filter(
      (item) =>
        (!filter.studentId || item.studentId === filter.studentId) &&
        (!filter.type || item.type === filter.type) &&
        (!filter.from || item.date >= filter.from) &&
        (!filter.to || item.date <= filter.to) &&
        words.every((word) => item.content.includes(word) || item.type.includes(word)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt));
}

// flowOrder는 학생 상담일지 인쇄 순서다. 첫 상담(오래된 것부터) 아래에 후속 기록을 이어 붙이고,
// 기간 안에 든 기록만 남긴다. depth는 들여쓰기 단계.
export function flowOrder<T extends ConsultLike>(items: T[], from: string, to: string) {
  const inRange = (item: T) => (!from || item.date >= from) && (!to || item.date <= to);
  const children = new Map<string, T[]>();
  items.forEach((item) => {
    if (!item.parentId) return;
    const list = children.get(item.parentId) || [];
    list.push(item);
    children.set(item.parentId, list);
  });
  const result: { item: T; depth: number }[] = [];
  const visit = (item: T, depth: number) => {
    if (inRange(item)) result.push({ item, depth });
    (children.get(item.id) || [])
      .sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt))
      .forEach((child) => visit(child, depth + 1));
  };
  items
    .filter((item) => !item.parentId)
    .sort((a, b) => a.date.localeCompare(b.date) || a.recordedAt.localeCompare(b.recordedAt))
    .forEach((root) => visit(root, 0));
  return result;
}
