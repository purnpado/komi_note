// 변경 알림(이벤트) 이름과 구독 묶음. Go app_events.go의 이름과 같게 유지한다.
// 알림에는 종류(kind)와 내부 번호(id)만 들어 있으므로, 받는 화면은 자기 바인딩으로 다시 읽는다.

export const changeEvents = {
  courseRoster: "course-roster:변경",
  survey: "survey:변경",
  memo: "memo:변경",
  schedule: "schedule:변경",
  timetable: "timetable:변경",
  budget: "budget:변경",
  reminder: "reminder:변경",
} as const;

export type ChangeEventName = (typeof changeEvents)[keyof typeof changeEvents];
export type ChangeNotice = { kind?: string; id?: string };
export type EventOn = (name: string, callback: (data: unknown) => void) => () => void;

function toNotice(data: unknown): ChangeNotice {
  if (!data || typeof data !== "object") return {};
  const value = data as Record<string, unknown>;
  return {
    kind: typeof value.kind === "string" ? value.kind : undefined,
    id: typeof value.id === "string" ? value.id : undefined,
  };
}

/** 여러 알림을 한 번에 구독하고, 돌려준 함수를 부르면 모두 해제한다. 해제 뒤 들어온 알림은 무시한다. */
export function subscribeChanges(
  on: EventOn,
  names: readonly string[],
  handler: (name: string, notice: ChangeNotice) => void,
): () => void {
  let active = true;
  const offs = [...new Set(names)].map((name) =>
    on(name, (data) => {
      if (active) handler(name, toNotice(data));
    }),
  );
  return () => {
    if (!active) return;
    active = false;
    for (const off of offs) off();
  };
}
