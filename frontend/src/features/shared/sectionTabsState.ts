// 화면 위 탭의 순수 계산: 바로가기 탭이 강조할 구역, 화살표 키로 옮길 탭.

export type SectionTop = { id: string; top: number };

/**
 * 지금 보고 있는 구역: 기준선(탭 줄 바로 아래)을 지난 구역 중 마지막 것.
 * 맨 아래까지 내렸으면 마지막 구역(짧은 마지막 구역도 강조되게), 아무것도 안 지났으면 첫 구역.
 */
export function activeSectionId(sections: SectionTop[], line: number, atBottom: boolean): string {
  if (!sections.length) return "";
  if (atBottom) return sections[sections.length - 1].id;
  let current = sections[0].id;
  for (const section of sections) {
    if (section.top <= line) current = section.id;
  }
  return current;
}

/** 탭 목록에서 화살표·Home·End 키로 옮길 위치(맨 끝에서 처음으로 돈다). 다른 키는 -1. */
export function nextTabIndex(index: number, count: number, key: string): number {
  if (count <= 0) return -1;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}
