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
  students: "students:변경",
  consultation: "consultation:변경",
  attendance: "attendance:변경",
  submissions: "submissions:변경",
  settings: "settings:변경",
  // 학급 운영·모둠·학교생활기록(2026-11-09): 지금은 보내기만 한다. 같은 화면은 입력 중 덮어쓰지 않도록 받지 않는다.
  seating: "seating:변경",
  cleaning: "cleaning:변경",
  grouping: "grouping:변경",
  records: "records:변경",
} as const;

/** 수행평가 점수·명단이 바뀌는 알림(수행평가 전용 알림 이름). 학교생활기록의 수행평가 참고가 다시 읽는다. */
export const assessmentDataEvents = ["assessment:평가가져옴", "assessment:점수변경", "assessment:학생추가"] as const;

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
