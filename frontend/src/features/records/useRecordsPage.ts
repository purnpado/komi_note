import { useEffect, useMemo, useState } from "react";
import { GetRecordBook, ListAssessments, ListCourseRosters } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";
import { rosterLabel } from "../timetable/timetableState";
import { courseKey } from "../grouping/groupingState";
import { areaLabels, availableTargets, entryStatus, memberKey, progress, recordYears, sortMembers, visibleTabs, type Area, type TabKey, type TargetKind } from "./recordsState";
import { type BulkCandidate } from "./PhraseParts";
import "./records-page.css";

export type Pupil = { key: string; label: string; name: string; number: string; note?: string };
export type Slot = { schoolYear: string; area: Area; targetKind: TargetKind; targetId: string; subject: string };
export type Target = { value: string; kind: TargetKind; id: string; label: string; pupils: Pupil[]; roster?: models.CourseRoster };

export const defaultSubject = "과목";

export function slotOf(entry: models.RecordEntry): string {
  return [entry.schoolYear, entry.area, entry.targetKind, entry.targetId, entry.subject].join("\u0000");
}

export function slotKey(slot: Slot): string {
  return [slot.schoolYear, slot.area, slot.targetKind, slot.targetId, slot.area === "subject" ? slot.subject : ""].join("\u0000");
}

// sameText는 보관함이 저장하는 방식(앞뒤 공백 제거·줄바꿈 통일)으로 두 문장을 비교합니다.
export function sameText(draft: string, stored: string) {
  return draft.replace(/\r\n?/g, "\n").trim() === stored;
}

export function trimNumber(value: string | number) {
  return String(value).trim().replace(/^0+(?=\d)/, "");
}

/** RecordsPage 화면의 상태·계산·처리 함수. 화면(JSX)은 RecordsPage.tsx에 있다. */
export function useRecordsPage({
  students,
  config,
  isHomeroomTeacher,
}: {
  students: models.Student[];
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
  const [book, setBook] = useState<models.RecordBook | null>(null);
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [assessments, setAssessments] = useState<models.Assessment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const shownTabs = visibleTabs(isHomeroomTeacher);
  const [tabKey, setTabKey] = useState<TabKey>("subject");
  const tab = shownTabs.find((item) => item.key === tabKey) || shownTabs[0];
  const [creativeArea, setCreativeArea] = useState<Area>("autonomy");
  const area: Area = tab.key === "creative" ? creativeArea : tab.areas[0];
  const [year, setYear] = useState(config?.schoolYear || String(new Date().getFullYear()));
  const [targetValue, setTargetValue] = useState("");
  const [subject, setSubject] = useState((config?.teachingSubject || "").trim() || defaultSubject);
  const [selectedKey, setSelectedKey] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [listDialog, setListDialog] = useState<models.RecordActivityList | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [view, setView] = useState<"write" | "phrases">("write");
  const [bulkYear, setBulkYear] = useState<string | null>(null);

  async function reload() {
    try {
      const [nextBook, nextRosters, nextAssessments] = await Promise.all([GetRecordBook(), ListCourseRosters(), ListAssessments()]);
      setBook(nextBook);
      setRosters(nextRosters || []);
      setAssessments(nextAssessments || []);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const years = useMemo(
    () =>
      recordYears(config?.schoolYear || "", [
        ...(book?.entries || []).map((entry) => entry.schoolYear),
        ...(book?.lists || []).map((list) => list.schoolYear),
        ...rosters.map((roster) => roster.schoolYear),
      ]),
    [book, rosters, config?.schoolYear],
  );

  const targets = useMemo<Target[]>(() => {
    const result: Target[] = [];
    for (const kind of availableTargets(tab, isHomeroomTeacher)) {
      if (kind === "homeroom") {
        const label = config?.grade && config?.classNumber ? `우리 반 (${config.grade}-${config.classNumber})` : "우리 반";
        const pupils = [...students]
          .sort((a, b) => a.number - b.number)
          .map((student) => ({ key: student.id, label: `${student.number}번 ${student.name}`, name: student.name, number: String(student.number) }));
        result.push({ value: "homeroom", kind, id: "", label, pupils });
      }
      if (kind === "course") {
        rosters
          .filter((roster) => roster.schoolYear === year)
          .sort((a, b) => rosterLabel(a).localeCompare(rosterLabel(b), "ko", { numeric: true }))
          .forEach((roster) => {
            const pupils = [...roster.students]
              .sort((a, b) => Number(a.number) - Number(b.number))
              .map((student) => ({
                key: courseKey(student.number, student.name),
                label: `${student.number}번 ${student.name}`,
                name: student.name,
                number: student.number,
                note: student.status === "전출" ? "전출" : undefined,
              }));
            result.push({ value: `course:${roster.id}`, kind, id: roster.id, label: `수업 반 ${rosterLabel(roster)}`, pupils, roster });
          });
      }
      if (kind === "list") {
        (book?.lists || [])
          .filter((list) => list.schoolYear === year)
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .forEach((list) => {
            const pupils = sortMembers(list.members).map((member) => ({
              key: memberKey(member),
              label: `${member.grade}-${member.className} ${member.number}번 ${member.name}`,
              name: member.name,
              number: member.number,
            }));
            result.push({ value: `list:${list.id}`, kind, id: list.id, label: `활동 명단 · ${list.name}`, pupils });
          });
      }
    }
    return result;
  }, [tab, isHomeroomTeacher, students, rosters, book, year, config?.grade, config?.classNumber]);

  const target = targets.find((item) => item.value === targetValue) || targets[0];

  useEffect(() => {
    if (target && target.value !== targetValue) setTargetValue(target.value);
  }, [target, targetValue]);

  const slot: Slot | null = target
    ? { schoolYear: year, area, targetKind: target.kind, targetId: target.id, subject: area === "subject" ? subject.trim() || defaultSubject : "" }
    : null;

  const slotEntries = useMemo(() => {
    const map = new Map<string, models.RecordEntry>();
    if (!slot || !book) return map;
    const key = slotKey(slot);
    book.entries.filter((entry) => slotOf(entry) === key).forEach((entry) => map.set(entry.studentKey, entry));
    return map;
  }, [book, slot && slotKey(slot)]);

  const pupils = target?.pupils || [];
  const orphanEntries = useMemo(() => {
    const keys = new Set(pupils.map((pupil) => pupil.key));
    return [...slotEntries.values()].filter((entry) => !keys.has(entry.studentKey));
  }, [slotEntries, pupils]);

  const statuses = pupils.map((pupil) => entryStatus(slotEntries.get(pupil.key)));
  const counts = progress(statuses);
  const shownPupils = pupils.filter((pupil, index) => !onlyMissing || statuses[index] === "empty" || statuses[index] === "memo");
  const orphanPupils: Pupil[] = orphanEntries.map((entry) => ({
    key: entry.studentKey,
    label: target?.kind === "homeroom" ? "삭제된 학생" : entry.studentKey.replace("|", " "),
    name: entry.studentKey.split("|")[1] || "",
    number: "",
    note: "명단에 없음",
  }));
  const selectable = [...shownPupils, ...orphanPupils];
  const selected = selectable.find((pupil) => pupil.key === selectedKey) || null;

  useEffect(() => {
    if (!selected && selectable.length > 0) setSelectedKey(selectable[0].key);
  }, [selected, selectable.length, target?.value, area]);

  const subjectSuggestions = useMemo(() => {
    const values = new Set<string>();
    if (config?.teachingSubject?.trim()) values.add(config.teachingSubject.trim());
    (book?.entries || []).filter((entry) => entry.area === "subject").forEach((entry) => values.add(entry.subject));
    if (target?.roster) {
      assessments
        .filter((item) => item.grade === target.roster?.grade && item.className === target.roster?.className)
        .forEach((item) => item.subject.trim() && values.add(item.subject.trim()));
    }
    return [...values];
  }, [book, assessments, target?.roster, config?.teachingSubject]);

  // 환경 설정에 담당 교과가 없으면 이 반 수행평가의 과목 이름을 기본값으로 쓴다
  useEffect(() => {
    if (subject === defaultSubject && subjectSuggestions.length > 0) setSubject(subjectSuggestions[0]);
  }, [subject, subjectSuggestions]);

  function onSaved(saved: models.RecordEntry) {
    setBook((current) => {
      if (!current) return current;
      const entries = current.entries.filter((entry) => entry.id !== saved.id);
      entries.push(saved);
      return new models.RecordBook({ ...current, entries });
    });
  }

  function onDeleted(id: string) {
    setBook((current) => (current ? new models.RecordBook({ ...current, entries: current.entries.filter((entry) => entry.id !== id) }) : current));
  }

  function onPhraseSaved(saved: models.RecordPhrase) {
    setBook((current) => {
      if (!current) return current;
      const phrases = current.phrases.filter((phrase) => phrase.id !== saved.id);
      phrases.push(saved);
      return new models.RecordBook({ ...current, phrases });
    });
  }

  function onPhraseRemoved(id: string) {
    setBook((current) => (current ? new models.RecordBook({ ...current, phrases: current.phrases.filter((phrase) => phrase.id !== id) }) : current));
  }

  // 학년말 한꺼번에 보관할 후보: 그 학년도의 검토 완료 문장(학생 이름은 대화상자에서 ○○로 바꿈)
  function bulkCandidates(forYear: string): BulkCandidate[] {
    if (!book) return [];
    return book.entries
      .filter((entry) => entry.schoolYear === forYear && entry.reviewed && entry.text.trim())
      .map((entry) => {
        const student = entry.targetKind === "homeroom" ? students.find((item) => item.id === entry.studentKey) : undefined;
        const studentName = student ? student.name : entry.studentKey.split("|")[1] || "";
        const where =
          entry.targetKind === "homeroom"
            ? "우리 반"
            : entry.targetKind === "course"
              ? `수업 반 ${(() => { const roster = rosters.find((item) => item.id === entry.targetId); return roster ? rosterLabel(roster) : ""; })()}`
              : book.lists.find((list) => list.id === entry.targetId)?.name || "활동 명단";
        const [code, keyName = ""] = entry.studentKey.split("|");
        const parts = code.split("-");
        const who = student
          ? `${student.number}번 ${student.name}`
          : parts.length === 3
            ? `${parts[0]}-${parts[1]} ${parts[2]}번 ${keyName}`
            : `${code}번 ${keyName}`;
        return { id: entry.id, label: `${areaLabels[entry.area as Area] || entry.area}${entry.subject ? `(${entry.subject})` : ""} · ${where} · ${who}`, area: entry.area, subject: entry.subject, text: entry.text, studentName };
      });
  }

  const everyName = useMemo(() => {
    const names = new Set<string>();
    students.forEach((student) => names.add(student.name));
    rosters.forEach((roster) => roster.students.forEach((student) => names.add(student.name)));
    (book?.lists || []).forEach((list) => list.members.forEach((member) => names.add(member.name)));
    return [...names];
  }, [students, rosters, book?.lists]);

  function moveSelection(step: number) {
    const index = selectable.findIndex((pupil) => pupil.key === selectedKey);
    const next = selectable[index + step];
    if (next) setSelectedKey(next.key);
  }

  const limit = book?.limits?.[area] || 500;
  const allNames = useMemo(() => {
    const names = new Set<string>();
    students.forEach((student) => names.add(student.name));
    pupils.forEach((pupil) => pupil.name && names.add(pupil.name));
    return [...names];
  }, [students, pupils]);

  return { book, setBook, rosters, setRosters, assessments, setAssessments, loadError, setLoadError, notice, setNotice, shownTabs, tabKey, setTabKey, tab, creativeArea, setCreativeArea, area, year, setYear, targetValue, setTargetValue, subject, setSubject, selectedKey, setSelectedKey, onlyMissing, setOnlyMissing, listDialog, setListDialog, limitsOpen, setLimitsOpen, cleanupOpen, setCleanupOpen, view, setView, bulkYear, setBulkYear, reload, years, targets, target, slot, slotEntries, pupils, orphanEntries, statuses, counts, shownPupils, orphanPupils, selectable, selected, subjectSuggestions, onSaved, onDeleted, onPhraseSaved, onPhraseRemoved, bulkCandidates, everyName, moveSelection, limit, allNames };
}
