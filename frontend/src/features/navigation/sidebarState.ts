// 왼쪽 메뉴의 순수 계산: 보이는 메뉴·묶음, 한 묶음만 펼치기, 숨긴 메뉴. 화면·저장소 호출은 여기 두지 않는다.

import { menuGroups, menus, type MenuGroup, type MenuItem, type MenuKey, type PageKey } from "./menuTypes.ts";

/** 늘 펼쳐 두는 묶음(대시보드 하나뿐이라 접을 까닭이 없다). 나머지 묶음은 한 번에 하나만 펼친다. */
export const alwaysOpenGroup: MenuGroup = "오늘";

/** 숨길 수 없는 메뉴(환경 설정은 메뉴 목록 밖 아래쪽에 따로 있다). */
export const fixedMenus: MenuKey[] = ["대시보드"];

/** 그 화면이 든 묶음. 자리배정·청소배정은 학급 운영(담임용) 아래, 환경 설정은 묶음 밖. */
export function groupOfPage(page: PageKey): MenuGroup | null {
  if (page === "자리배정" || page === "청소배정") return "담임용";
  return menus.find((item) => item.key === page)?.group || null;
}

/** 역할과 숨긴 메뉴를 반영한 보이는 메뉴. */
export function visibleMenus(isHomeroomTeacher: boolean, hidden: readonly string[] = []): MenuItem[] {
  const hiddenSet = new Set(hidden);
  return menus.filter(
    (item) => (isHomeroomTeacher || !item.homeroomOnly) && (fixedMenus.includes(item.key) || !hiddenSet.has(item.key)),
  );
}

/** 보이는 메뉴가 하나라도 있는 묶음. */
export function visibleGroups(items: MenuItem[]): MenuGroup[] {
  return menuGroups.filter((group) => items.some((item) => item.group === group));
}

/** 묶음 머리를 눌렀을 때 펼쳐질 묶음: 펼친 묶음을 다시 누르면 접고, 다른 묶음은 그것만 펼친다. */
export function toggleOpenGroup(current: MenuGroup | null, clicked: MenuGroup): MenuGroup | null {
  if (clicked === alwaysOpenGroup) return current;
  return current === clicked ? null : clicked;
}

export function isGroupOpen(group: MenuGroup, openGroup: MenuGroup | null) {
  return group === alwaysOpenGroup || group === openGroup;
}

/** 화면을 옮겼을 때 펼칠 묶음: 그 화면이 든 묶음(오늘·환경 설정이면 지금 그대로). */
export function openGroupForPage(current: MenuGroup | null, page: PageKey): MenuGroup | null {
  const group = groupOfPage(page);
  if (!group || group === alwaysOpenGroup) return current;
  return group;
}

/** 저장해 둔 값이 올바른 묶음 이름일 때만 쓴다. */
export function parseOpenGroup(value: string | null): MenuGroup | null {
  return menuGroups.includes(value as MenuGroup) && value !== alwaysOpenGroup ? (value as MenuGroup) : null;
}

/** 환경 설정에서 숨길 수 있는 메뉴(역할에 맞는 것만). */
export function hideableMenus(isHomeroomTeacher: boolean): MenuItem[] {
  return menus.filter((item) => !fixedMenus.includes(item.key) && (isHomeroomTeacher || !item.homeroomOnly));
}

/** 메뉴 하나를 숨기거나 다시 보이게 한다. */
export function toggleHiddenMenu(hidden: readonly string[], key: MenuKey): string[] {
  if (fixedMenus.includes(key)) return [...hidden];
  return hidden.includes(key) ? hidden.filter((item) => item !== key) : [...hidden, key];
}
