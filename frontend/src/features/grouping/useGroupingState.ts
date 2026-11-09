import { useEffect, useMemo, useState } from "react";
import { GetGroupingBook, GetGroupingSessionInfo, ListCourseRosters } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { useVaultChanges } from "../shared/useVaultChanges";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage } from "../shared/format";
import { rosterLabel } from "../timetable/timetableState";
import { courseKey, evaluate, groupCount, pairsInPlan } from "./groupingState";
import { Source, Draft, memberLabel } from "./useGroupingPage";

/** 모둠 편성 화면의 상태·불러오기·계산(대상 반, 인원, 조건, 편성안). */
export function useGroupingState({
  students,
  isHomeroomTeacher,
  config,
}: {
  students: models.Student[];
  isHomeroomTeacher: boolean;
  config: models.ClassConfig | null;
}) {
  const [book, setBook] = useState<models.GroupingBook>(new models.GroupingBook());
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [sourceValue, setSourceValue] = useState("");
  const [mode, setMode] = useState<"size" | "count">("size");
  const [amount, setAmount] = useState(4);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [rolesText, setRolesText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [presentOpen, setPresentOpen] = useState(false);
  const [pairDraft, setPairDraft] = useState({ kind: "separate" as "separate" | "together", a: "", b: "" });
  const [notice, setNotice] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<models.GroupSessionInfo | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  async function reload() {
    const next = new models.GroupingBook(await GetGroupingBook());
    setBook(next);
    return next;
  }

  useEffect(() => {
    void reload()
      .then(() => setLoaded(true))
      .catch((error) => setNotice(errorMessage(error)));
    ListCourseRosters()
      .then((items) => setRosters((items || []).map((item) => new models.CourseRoster(item))))
      .catch(() => undefined);
    // 다른 메뉴에 다녀와도 진행 중인 학생 참여 회차를 이어서 보여 준다.
    GetGroupingSessionInfo()
      .then((info) => {
        const value = new models.GroupSessionInfo(info);
        if (value.running) setSessionInfo(value);
      })
      .catch(() => undefined);
  }, []);

  // 학생·수업 명렬·설정(백업 되살리기)이 바뀌면 편성 이력과 수업 명렬을 다시 읽는다.
  useVaultChanges([changeEvents.students, changeEvents.courseRoster, changeEvents.settings], () => {
    void reload().catch(() => undefined);
    ListCourseRosters()
      .then((items) => setRosters((items || []).map((item) => new models.CourseRoster(item))))
      .catch(() => undefined);
  });

  const sources: Source[] = useMemo(() => {
    const list: Source[] = [];
    if (isHomeroomTeacher && students.length) {
      const label = config?.grade && config?.classNumber ? `${config.grade}-${config.classNumber}` : "우리 반";
      list.push({
        value: "homeroom",
        kind: "homeroom",
        id: "homeroom",
        label: `${label} (우리 반)`,
        pupils: [...students]
          .sort((a, b) => a.number - b.number)
          .map((student) => ({ key: student.id, number: String(student.number), name: student.name })),
      });
    }
    for (const roster of rosters) {
      list.push({
        value: `course:${roster.id}`,
        kind: "course",
        id: roster.id,
        label: `${roster.schoolYear} ${rosterLabel(roster)}`,
        pupils: roster.students
          .filter((student) => student.status !== "전출")
          .map((student) => ({
            key: courseKey(student.number, student.name),
            number: student.number,
            name: student.name,
          })),
      });
    }
    return list;
  }, [isHomeroomTeacher, students, rosters, config?.grade, config?.classNumber]);

  useEffect(() => {
    if (!sources.length) return;
    if (!sources.some((source) => source.value === sourceValue)) setSourceValue(sources[0].value);
  }, [sources, sourceValue]);

  const source = sources.find((item) => item.value === sourceValue) || null;
  const rules = useMemo(() => {
    const found = book.rules.find((item) => source && item.sourceKind === source.kind && item.sourceId === source.id);
    return (
      found || new models.GroupRules({ sourceKind: source?.kind || "", sourceId: source?.id || "", avoidRepeat: true })
    );
  }, [book.rules, source]);
  const plans = useMemo(
    () => book.plans.filter((plan) => source && plan.sourceKind === source.kind && plan.sourceId === source.id),
    [book.plans, source],
  );
  const previousPlan = plans.find((plan) => plan.id !== draft?.id);
  const previousPairs = useMemo(
    () => (previousPlan ? pairsInPlan(previousPlan.groups) : new Set<string>()),
    [previousPlan],
  );
  const nameOf = useMemo(
    () => new Map((source?.pupils || []).map((pupil) => [pupil.key, memberLabel(pupil)])),
    [source],
  );
  const present = (source?.pupils || []).filter((pupil) => !excluded.has(pupil.key));
  const count = groupCount(present.length, mode, amount);

  // 반을 바꾸면(또는 보관함 자료를 처음 다 읽으면) 그 반의 역할 기억값을 불러오고 빠질 학생 선택을 비운다.
  useEffect(() => {
    setExcluded(new Set());
    setRolesText(rules.rolesTemplate || "");
    setSelectedKey("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValue, loaded]);

  const check = useMemo(
    () =>
      draft
        ? evaluate(draft.groups, rules.separate, rules.together, rules.avoidRepeat ? previousPairs : new Set())
        : null,
    [draft, rules, previousPairs],
  );

  return {
    students,
    isHomeroomTeacher,
    config,
    book,
    setBook,
    rosters,
    setRosters,
    sourceValue,
    setSourceValue,
    mode,
    setMode,
    amount,
    setAmount,
    excluded,
    setExcluded,
    rolesText,
    setRolesText,
    draft,
    setDraft,
    dirty,
    setDirty,
    selectedKey,
    setSelectedKey,
    rulesOpen,
    setRulesOpen,
    presentOpen,
    setPresentOpen,
    pairDraft,
    setPairDraft,
    notice,
    setNotice,
    feedback,
    setFeedback,
    busy,
    setBusy,
    loaded,
    setLoaded,
    sessionInfo,
    setSessionInfo,
    startOpen,
    setStartOpen,
    reload,
    sources,
    source,
    rules,
    plans,
    previousPlan,
    previousPairs,
    nameOf,
    present,
    count,
    check,
  };
}

export type GroupingState = ReturnType<typeof useGroupingState>;
