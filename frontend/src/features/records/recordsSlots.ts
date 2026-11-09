import { main as models } from "../../../wailsjs/go/models";
import { type Area, type TargetKind } from "./recordsState";

/** 학교생활기록의 대상·학생·기록 칸을 가리키는 타입과 작은 도우미입니다. */
export type Pupil = { key: string; label: string; name: string; number: string; note?: string };
export type Slot = { schoolYear: string; area: Area; targetKind: TargetKind; targetId: string; subject: string };
export type Target = {
  value: string;
  kind: TargetKind;
  id: string;
  label: string;
  pupils: Pupil[];
  roster?: models.CourseRoster;
};

export const defaultSubject = "과목";

export function slotOf(entry: models.RecordEntry): string {
  return [entry.schoolYear, entry.area, entry.targetKind, entry.targetId, entry.subject].join("\u0000");
}

export function slotKey(slot: Slot): string {
  return [slot.schoolYear, slot.area, slot.targetKind, slot.targetId, slot.area === "subject" ? slot.subject : ""].join(
    "\u0000",
  );
}

// sameText는 보관함이 저장하는 방식(앞뒤 공백 제거·줄바꿈 통일)으로 두 문장을 비교합니다.
export function sameText(draft: string, stored: string) {
  return draft.replace(/\r\n?/g, "\n").trim() === stored;
}

export function trimNumber(value: string | number) {
  return String(value)
    .trim()
    .replace(/^0+(?=\d)/, "");
}
