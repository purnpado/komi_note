import { main as models } from "../../../wailsjs/go/models";
import { type GroupDraft, type Pupil } from "./groupingState";
import { useGroupingState } from "./useGroupingState";
import { groupingActions } from "./groupingActions";
import "./grouping.css";

export type Source = { value: string; kind: "homeroom" | "course"; id: string; label: string; pupils: Pupil[] };
export type Draft = {
  id: string;
  updatedAt: string;
  createdAt: string;
  title: string;
  roles: string[];
  groups: GroupDraft[];
  excluded: Pupil[];
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char,
  );
}

export function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function memberLabel(member: Pupil) {
  return `${member.number ? `${member.number}번 ` : ""}${member.name}`;
}

/** GroupingPage 화면의 상태·계산·처리 함수. 화면(JSX)은 GroupingPage.tsx에 있다. */

export function useGroupingPage({
  students,
  isHomeroomTeacher,
  config,
}: {
  students: models.Student[];
  isHomeroomTeacher: boolean;
  config: models.ClassConfig | null;
}) {
  const state = useGroupingState({ students, isHomeroomTeacher, config });
  const actions = groupingActions(state);
  const { rules, nameOf } = { ...state, ...actions };
  const pairName = (key: string) => nameOf.get(key) || "명렬에 없는 학생";
  const ruleCount = rules.separate.length + rules.together.length;

  return {
    book: state.book,
    setBook: state.setBook,
    rosters: state.rosters,
    setRosters: state.setRosters,
    sourceValue: state.sourceValue,
    setSourceValue: state.setSourceValue,
    mode: state.mode,
    setMode: state.setMode,
    amount: state.amount,
    setAmount: state.setAmount,
    excluded: state.excluded,
    setExcluded: state.setExcluded,
    rolesText: state.rolesText,
    setRolesText: state.setRolesText,
    draft: state.draft,
    setDraft: state.setDraft,
    dirty: state.dirty,
    setDirty: state.setDirty,
    selectedKey: state.selectedKey,
    setSelectedKey: state.setSelectedKey,
    rulesOpen: state.rulesOpen,
    setRulesOpen: state.setRulesOpen,
    presentOpen: state.presentOpen,
    setPresentOpen: state.setPresentOpen,
    pairDraft: state.pairDraft,
    setPairDraft: state.setPairDraft,
    notice: state.notice,
    setNotice: state.setNotice,
    feedback: state.feedback,
    setFeedback: state.setFeedback,
    busy: state.busy,
    setBusy: state.setBusy,
    loaded: state.loaded,
    setLoaded: state.setLoaded,
    sessionInfo: state.sessionInfo,
    setSessionInfo: state.setSessionInfo,
    startOpen: state.startOpen,
    setStartOpen: state.setStartOpen,
    reload: state.reload,
    sources: state.sources,
    source: state.source,
    rules,
    plans: state.plans,
    previousPlan: state.previousPlan,
    previousPairs: state.previousPairs,
    nameOf,
    present: state.present,
    count: state.count,
    check: state.check,
    saveRules: actions.saveRules,
    confirmDiscard: actions.confirmDiscard,
    build: actions.build,
    createGroups: actions.createGroups,
    reshuffle: actions.reshuffle,
    importSession: actions.importSession,
    clickMember: actions.clickMember,
    moveTo: actions.moveTo,
    setRole: actions.setRole,
    savePlan: actions.savePlan,
    openPlan: actions.openPlan,
    deletePlan: actions.deletePlan,
    print: actions.print,
    addPair: actions.addPair,
    removePair: actions.removePair,
    pairName,
    ruleCount,
  };
}
