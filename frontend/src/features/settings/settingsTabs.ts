// 환경 설정 탭 목록과 마지막으로 연 탭 기억(브라우저 저장소, 개인정보 없음).
import type { SectionTabItem } from "../shared/SectionTabs";

export type SettingsTab =
  | "settings-basic"
  | "settings-academic"
  | "settings-display"
  | "settings-password"
  | "settings-backup"
  | "settings-background"
  | "settings-feedback";

export const settingsTabs: (SectionTabItem & { id: SettingsTab })[] = [
  { id: "settings-basic", label: "기본 정보" },
  { id: "settings-academic", label: "학사 일정" },
  { id: "settings-display", label: "화면 · 메뉴" },
  { id: "settings-password", label: "비밀번호" },
  { id: "settings-backup", label: "백업" },
  { id: "settings-background", label: "알림 · 자동 시작" },
  { id: "settings-feedback", label: "의견 보내기" },
];

/** 설정 저장 버튼을 함께 쓰는 탭(한 양식 안에 있다). */
export const formTabs: SettingsTab[] = ["settings-basic", "settings-academic", "settings-display"];

const storageKey = "kkomi.settings.tab";

export function readSettingsTab(): SettingsTab {
  try {
    const value = sessionStorage.getItem(storageKey);
    return settingsTabs.some((item) => item.id === value) ? (value as SettingsTab) : "settings-basic";
  } catch {
    return "settings-basic";
  }
}

export function storeSettingsTab(tab: SettingsTab) {
  try {
    sessionStorage.setItem(storageKey, tab);
  } catch {
    // 탭을 기억하지 못해도 지금 화면은 그대로 쓴다.
  }
}
