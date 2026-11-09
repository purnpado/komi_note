export type MenuKey =
  | "대시보드"
  | "학생 명렬"
  | "학생 통계"
  | "제출서류 관리"
  | "상담 기록"
  | "출결 관리"
  | "학급 운영"
  | "수업 명렬"
  | "시간표"
  | "평가 관리"
  | "학교생활기록"
  | "모둠 편성"
  | "설문 조사"
  | "메모 · 할 일"
  | "일정"
  | "예산 관리";

export type PageKey = MenuKey | "자리배정" | "청소배정" | "환경 설정";

export type MenuItem = {
  key: MenuKey;
  icon: string;
  group: MenuGroup;
  homeroomOnly?: boolean;
};

export type MenuGroup = "오늘" | "담임용" | "수업용" | "업무용";

export const menuGroups: MenuGroup[] = ["오늘", "담임용", "수업용", "업무용"];

export const menus: MenuItem[] = [
  { key: "대시보드", icon: "▦", group: "오늘" },
  { key: "학생 명렬", icon: "♙", group: "담임용", homeroomOnly: true },
  { key: "학생 통계", icon: "▥", group: "담임용", homeroomOnly: true },
  { key: "제출서류 관리", icon: "▤", group: "담임용", homeroomOnly: true },
  { key: "상담 기록", icon: "◌", group: "담임용", homeroomOnly: true },
  { key: "출결 관리", icon: "✓", group: "담임용", homeroomOnly: true },
  { key: "학급 운영", icon: "⌘", group: "담임용", homeroomOnly: true },
  { key: "수업 명렬", icon: "♙", group: "수업용" },
  { key: "시간표", icon: "◫", group: "수업용" },
  { key: "평가 관리", icon: "▤", group: "수업용" },
  { key: "학교생활기록", icon: "▱", group: "수업용" },
  { key: "모둠 편성", icon: "⌘", group: "수업용" },
  { key: "설문 조사", icon: "▥", group: "업무용" },
  { key: "메모 · 할 일", icon: "▤", group: "업무용" },
  { key: "일정", icon: "◴", group: "업무용" },
  { key: "예산 관리", icon: "₩", group: "업무용" },
];
