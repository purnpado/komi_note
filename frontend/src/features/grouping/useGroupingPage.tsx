import { useEffect, useMemo, useState } from "react";
import { DeleteGroupPlan, GetGroupingBook, GetGroupingSessionInfo, ListCourseRosters, SaveGroupPlan, SaveGroupRules } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { printSheet } from "../shared/desktopActions";
import { useVaultChanges } from "../shared/useVaultChanges";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage, todayLocal } from "../shared/format";
import { rosterLabel } from "../timetable/timetableState";
import { assignRoles, courseKey, defaultGroupNames, evaluate, groupCount, makeGroups, moveMember, pairsInPlan, parseRoles, swapMembers, type GroupDraft, type Pair, type Pupil } from "./groupingState";
import "./grouping.css";

export type Source = { value: string; kind: "homeroom" | "course"; id: string; label: string; pupils: Pupil[] };
export type Draft = { id: string; updatedAt: string; createdAt: string; title: string; roles: string[]; groups: GroupDraft[]; excluded: Pupil[] };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
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
export function useGroupingPage({ students, isHomeroomTeacher, config }: { students: models.Student[]; isHomeroomTeacher: boolean; config: models.ClassConfig | null }) {
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
        value: "homeroom", kind: "homeroom", id: "homeroom", label: `${label} (우리 반)`,
        pupils: [...students].sort((a, b) => a.number - b.number).map((student) => ({ key: student.id, number: String(student.number), name: student.name })),
      });
    }
    for (const roster of rosters) {
      list.push({
        value: `course:${roster.id}`, kind: "course", id: roster.id, label: `${roster.schoolYear} ${rosterLabel(roster)}`,
        pupils: roster.students.filter((student) => student.status !== "전출").map((student) => ({ key: courseKey(student.number, student.name), number: student.number, name: student.name })),
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
    return found || new models.GroupRules({ sourceKind: source?.kind || "", sourceId: source?.id || "", avoidRepeat: true });
  }, [book.rules, source]);
  const plans = useMemo(() => book.plans.filter((plan) => source && plan.sourceKind === source.kind && plan.sourceId === source.id), [book.plans, source]);
  const previousPlan = plans.find((plan) => plan.id !== draft?.id);
  const previousPairs = useMemo(() => (previousPlan ? pairsInPlan(previousPlan.groups) : new Set<string>()), [previousPlan]);
  const nameOf = useMemo(() => new Map((source?.pupils || []).map((pupil) => [pupil.key, memberLabel(pupil)])), [source]);
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
    () => (draft ? evaluate(draft.groups, rules.separate, rules.together, rules.avoidRepeat ? previousPairs : new Set()) : null),
    [draft, rules, previousPairs],
  );

  async function saveRules(next: models.GroupRules, message: string) {
    setBusy(true);
    try {
      await SaveGroupRules(next);
      await reload();
      setFeedback(message);
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDiscard() {
    if (!dirty) return true;
    return confirmWithRadix({ title: "저장하지 않은 모둠이 있습니다", description: "지금 모둠을 저장하지 않고 넘어가면 바꾼 내용이 사라집니다.", actionLabel: "저장하지 않고 넘어가기" });
  }

  function build(keepID: boolean) {
    if (!source) return;
    if (!count) {
      setNotice(present.length ? "모둠당 인원이나 모둠 수를 1 이상으로 입력해 주세요." : "모둠에 넣을 학생이 없습니다.");
      return;
    }
    const roles = parseRoles(rolesText);
    const groups = assignRoles(
      makeGroups(present, { count, separate: rules.separate, together: rules.together, previous: rules.avoidRepeat ? previousPairs : new Set() }),
      roles,
    );
    const names = defaultGroupNames(groups.length);
    setDraft({
      id: keepID && draft ? draft.id : "",
      updatedAt: keepID && draft ? draft.updatedAt : "",
      createdAt: keepID && draft ? draft.createdAt : "",
      title: keepID && draft ? draft.title : `${todayLocal()} ${source.label.replace(" (우리 반)", "")} 모둠`,
      roles,
      groups: groups.map((members, index) => ({ name: keepID && draft?.groups[index]?.name ? draft.groups[index].name : names[index], members })),
      excluded: (source.pupils || []).filter((pupil) => excluded.has(pupil.key)),
    });
    setDirty(true);
    setSelectedKey("");
    setNotice("");
    setFeedback(`${present.length}명을 ${groups.length}개 모둠으로 나눴습니다. 학생을 눌러 옮기거나 맞바꾼 뒤 [저장]을 누르세요.`);
    if ((rules.rolesTemplate || "") !== rolesText.trim()) {
      void SaveGroupRules(new models.GroupRules({ ...rules, sourceKind: source.kind, sourceId: source.id, rolesTemplate: rolesText.trim() })).then(() => reload()).catch(() => undefined);
    }
  }

  async function createGroups() {
    if (!(await confirmDiscard())) return;
    build(false);
  }

  async function reshuffle() {
    const ok = await confirmWithRadix({ title: "모둠을 다시 섞을까요?", description: "지금 모둠과 직접 옮긴 내용이 새 무작위 편성으로 바뀝니다. 빠질 학생·조건·역할 설정은 그대로 씁니다.", actionLabel: "다시 섞기" });
    if (ok) build(true);
  }

  // 학생 참여 회차 결과를 편성 화면의 초안으로 옮긴다(역할은 지금 적힌 역할로 무작위 배정).
  function importSession(info: models.GroupSessionInfo) {
    const target = sources.find((item) => item.kind === info.sourceKind && item.id === info.sourceId);
    if (target && target.value !== sourceValue) setSourceValue(target.value);
    // 모둠장이 있는 방식이면 모둠장에게 "모둠장" 역할을 주고, 나머지 역할은 다른 학생에게 무작위로 나눈다.
    const leaders = new Set(info.leaders || []);
    const roles = leaders.size ? ["모둠장", ...parseRoles(rolesText).filter((role) => role !== "모둠장")] : parseRoles(rolesText);
    const otherRoles = leaders.size ? roles.slice(1) : roles;
    const groups = info.result.map((group) => {
      const members = group.members.map((member) => ({ key: member.key, number: member.number, name: member.name }));
      const leader = members.filter((member) => leaders.has(member.key)).map((member) => ({ ...member, role: "모둠장" }));
      const others = assignRoles([members.filter((member) => !leaders.has(member.key))], otherRoles)[0];
      return [...leader, ...others];
    });
    const placed = new Set(info.result.flatMap((group) => group.members.map((member) => member.key)));
    setDraft({
      id: "", updatedAt: "", createdAt: "",
      title: `${todayLocal()} ${info.sourceLabel} 모둠(${info.mode === "draft" ? "블라인드 지명" : "학생 지망"})`,
      roles,
      groups: groups.map((members, index) => ({ name: info.result[index]?.name || `${index + 1}모둠`, members })),
      excluded: (target?.pupils || []).filter((pupil) => !placed.has(pupil.key)),
    });
    setDirty(true);
    setSelectedKey("");
    setNotice("");
    setFeedback("학생 참여 편성 결과를 가져왔습니다. 확인·조정한 뒤 [저장]을 누르세요.");
  }

  function clickMember(key: string) {
    if (!draft) return;
    if (!selectedKey) return setSelectedKey(key);
    if (selectedKey === key) return setSelectedKey("");
    setDraft({ ...draft, groups: swapMembers(draft.groups, selectedKey, key) });
    setDirty(true);
    setSelectedKey("");
  }

  function moveTo(index: number) {
    if (!draft || !selectedKey) return;
    setDraft({ ...draft, groups: moveMember(draft.groups, selectedKey, index) });
    setDirty(true);
    setSelectedKey("");
  }

  function setRole(groupIndex: number, key: string, role: string) {
    if (!draft) return;
    setDraft({ ...draft, groups: draft.groups.map((group, index) => (index === groupIndex ? { ...group, members: group.members.map((member) => (member.key === key ? { ...member, role } : member)) } : group)) });
    setDirty(true);
  }

  async function savePlan() {
    if (!draft || !source) return;
    setBusy(true);
    try {
      const saved = new models.GroupPlan(
        await SaveGroupPlan(new models.GroupPlan({
          id: draft.id, updatedAt: draft.updatedAt, createdAt: draft.createdAt, title: draft.title,
          sourceKind: source.kind, sourceId: source.id, sourceLabel: source.label.replace(" (우리 반)", ""),
          roles: draft.roles, groups: draft.groups, excluded: draft.excluded.map((pupil) => ({ ...pupil, role: "" })),
        })),
      );
      await reload();
      setDraft({ ...draft, id: saved.id, updatedAt: saved.updatedAt, createdAt: saved.createdAt, title: saved.title });
      setDirty(false);
      setNotice("");
      setFeedback("모둠 편성을 암호화 보관함에 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function openPlan(plan: models.GroupPlan) {
    if (!(await confirmDiscard())) return;
    setDraft({
      id: plan.id, updatedAt: plan.updatedAt, createdAt: plan.createdAt, title: plan.title, roles: plan.roles,
      groups: plan.groups.map((group) => ({ name: group.name, members: group.members.map((member) => ({ ...member })) })),
      excluded: plan.excluded.map((member) => ({ key: member.key, number: member.number, name: member.name })),
    });
    setDirty(false);
    setSelectedKey("");
    setFeedback("");
    setNotice("");
  }

  async function deletePlan() {
    if (!draft?.id) return;
    const ok = await confirmWithRadix({ title: "이 모둠 편성 이력을 지울까요?", description: `"${draft.title}" 이력을 지웁니다. 지운 이력은 되돌릴 수 없고, 다음 편성의 겹침 줄이기에서도 빠집니다.`, actionLabel: "지우기" });
    if (!ok) return;
    setBusy(true);
    try {
      await DeleteGroupPlan(draft.id);
      await reload();
      setDraft(null);
      setDirty(false);
      setFeedback("모둠 편성 이력을 지웠습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function print() {
    if (!draft) return;
    const cards = draft.groups.map((group) => `<article><h2>${escapeHtml(group.name)}</h2><ol>${group.members.map((member) => `<li><b>${escapeHtml(memberLabel(member))}</b>${member.role ? `<span>${escapeHtml(member.role)}</span>` : ""}</li>`).join("")}</ol></article>`).join("");
    const p = ".print-sheet";
    const columns = draft.groups.length > 6 ? 4 : 3;
    const css = `@page{size:A4 landscape;margin:12mm}${p}{font-family:Arial,sans-serif;color:#1e2a44}${p} h1{text-align:center;margin:0 0 8mm;font-size:22pt}${p} .grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:6mm}${p} article{border:1px solid #777;border-radius:6px;padding:5mm;break-inside:avoid}${p} h2{margin:0 0 3mm;font-size:17pt}${p} ol{margin:0;padding-left:0;list-style:none}${p} li{display:flex;justify-content:space-between;gap:4mm;padding:1.5mm 0;border-bottom:1px dashed #bbb;font-size:13pt}${p} li span{color:#855a31;font-size:11pt}`;
    void printSheet(`<h1>${escapeHtml(draft.title)}</h1><main class="grid">${cards}</main>`, css).catch(() => setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."));
  }

  function addPair() {
    if (!source || !pairDraft.a || !pairDraft.b || pairDraft.a === pairDraft.b) return;
    const pair = { a: pairDraft.a, b: pairDraft.b };
    const next = new models.GroupRules({
      ...rules, sourceKind: source.kind, sourceId: source.id,
      separate: pairDraft.kind === "separate" ? [...rules.separate, pair] : rules.separate,
      together: pairDraft.kind === "together" ? [...rules.together, pair] : rules.together,
    });
    void saveRules(next, "편성 조건을 저장했습니다. 이 조건은 교사 화면에만 보입니다.");
    setPairDraft({ ...pairDraft, a: "", b: "" });
  }

  function removePair(kind: "separate" | "together", pair: Pair) {
    if (!source) return;
    const keep = (items: models.GroupPair[]) => items.filter((item) => !(item.a === pair.a && item.b === pair.b));
    const next = new models.GroupRules({ ...rules, sourceKind: source.kind, sourceId: source.id, separate: kind === "separate" ? keep(rules.separate) : rules.separate, together: kind === "together" ? keep(rules.together) : rules.together });
    void saveRules(next, "편성 조건을 지웠습니다.");
  }

  const pairName = (key: string) => nameOf.get(key) || "명렬에 없는 학생";
  const ruleCount = rules.separate.length + rules.together.length;

  return { book, setBook, rosters, setRosters, sourceValue, setSourceValue, mode, setMode, amount, setAmount, excluded, setExcluded, rolesText, setRolesText, draft, setDraft, dirty, setDirty, selectedKey, setSelectedKey, rulesOpen, setRulesOpen, presentOpen, setPresentOpen, pairDraft, setPairDraft, notice, setNotice, feedback, setFeedback, busy, setBusy, loaded, setLoaded, sessionInfo, setSessionInfo, startOpen, setStartOpen, reload, sources, source, rules, plans, previousPlan, previousPairs, nameOf, present, count, check, saveRules, confirmDiscard, build, createGroups, reshuffle, importSession, clickMember, moveTo, setRole, savePlan, openPlan, deletePlan, print, addPair, removePair, pairName, ruleCount };
}
