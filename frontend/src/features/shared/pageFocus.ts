// 다른 화면에서 "이 반으로 가기"를 눌렀을 때, 이동한 화면이 처음 열릴 때 한 번만 읽는 선택값입니다.
// 학생 정보는 담지 않고 수업 명렬 ID나 학년도·학년·반만 넘깁니다.

export type CourseFocus = { courseRosterId: string; schoolYear?: string; grade?: string; className?: string };

let pending: { page: string; focus: CourseFocus } | null = null;

export function setPageFocus(page: string, focus: CourseFocus) {
  pending = { page, focus };
}

export function takePageFocus(page: string): CourseFocus | null {
  if (!pending || pending.page !== page) return null;
  const focus = pending.focus;
  pending = null;
  return focus;
}
