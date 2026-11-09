// '확인할 알림' 목록의 순수 계산.

export type InboxLike = { key: string; kind: string; refId: string; title: string; at: string; eventAt: string; missed: boolean; quiet: boolean };

/** 알림 한 줄의 설명: "11월 9일 14:30 일정 · 지난 알림" */
export function inboxNote(item: InboxLike) {
  const event = new Date(item.eventAt);
  const when = Number.isNaN(event.getTime()) ? "" : `${event.getMonth() + 1}월 ${event.getDate()}일 ${String(event.getHours()).padStart(2, "0")}:${String(event.getMinutes()).padStart(2, "0")}`;
  const tags = [item.missed ? "꺼져 있던 동안 지난 알림" : "", item.quiet ? "조용한 시간" : ""].filter(Boolean);
  return [when && `${when} ${item.kind}`, ...tags].filter(Boolean).join(" · ");
}

/** 알림을 누르면 갈 메뉴 */
export function inboxTarget(item: InboxLike): "일정" | "메모 · 할 일" {
  return item.kind === "일정" ? "일정" : "메모 · 할 일";
}

/** 메모·할 일 알림 시각 입력값("YYYY-MM-DDTHH:MM")이 지금보다 뒤인지 */
export function remindProblem(value: string, now: Date) {
  if (!value) return "";
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "알림 시각을 확인해 주세요.";
  if (at.getTime() <= now.getTime()) return "알림 시각은 지금보다 뒤여야 합니다.";
  return "";
}
