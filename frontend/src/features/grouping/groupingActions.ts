import { DeleteGroupPlan, SaveGroupPlan, SaveGroupRules } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { printSheet } from "../shared/desktopActions";
import { errorMessage, todayLocal } from "../shared/format";
import {
  assignRoles,
  defaultGroupNames,
  makeGroups,
  moveMember,
  parseRoles,
  swapMembers,
  type Pair,
} from "./groupingState";
import type { GroupingState } from "./useGroupingState";
import { escapeHtml, memberLabel } from "./useGroupingPage";

/** 모둠 편성 처리: 조건 저장, 편성 만들기·다시 섞기, 학생 옮기기·역할, 저장·열기·삭제, 인쇄, 조건 쌍 추가·삭제. */
export function groupingActions(state: GroupingState) {
  const {
    sourceValue,
    setSourceValue,
    excluded,
    rolesText,
    draft,
    setDraft,
    dirty,
    setDirty,
    selectedKey,
    setSelectedKey,
    pairDraft,
    setPairDraft,
    setNotice,
    setFeedback,
    setBusy,
    reload,
    sources,
    source,
    rules,
    previousPairs,
    present,
    count,
  } = state;
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
    return confirmWithRadix({
      title: "저장하지 않은 모둠이 있습니다",
      description: "지금 모둠을 저장하지 않고 넘어가면 바꾼 내용이 사라집니다.",
      actionLabel: "저장하지 않고 넘어가기",
    });
  }

  function build(keepID: boolean) {
    if (!source) return;
    if (!count) {
      setNotice(
        present.length ? "모둠당 인원이나 모둠 수를 1 이상으로 입력해 주세요." : "모둠에 넣을 학생이 없습니다.",
      );
      return;
    }
    const roles = parseRoles(rolesText);
    const groups = assignRoles(
      makeGroups(present, {
        count,
        separate: rules.separate,
        together: rules.together,
        previous: rules.avoidRepeat ? previousPairs : new Set(),
      }),
      roles,
    );
    const names = defaultGroupNames(groups.length);
    setDraft({
      id: keepID && draft ? draft.id : "",
      updatedAt: keepID && draft ? draft.updatedAt : "",
      createdAt: keepID && draft ? draft.createdAt : "",
      title: keepID && draft ? draft.title : `${todayLocal()} ${source.label.replace(" (우리 반)", "")} 모둠`,
      roles,
      groups: groups.map((members, index) => ({
        name: keepID && draft?.groups[index]?.name ? draft.groups[index].name : names[index],
        members,
      })),
      excluded: (source.pupils || []).filter((pupil) => excluded.has(pupil.key)),
    });
    setDirty(true);
    setSelectedKey("");
    setNotice("");
    setFeedback(
      `${present.length}명을 ${groups.length}개 모둠으로 나눴습니다. 학생을 눌러 옮기거나 맞바꾼 뒤 [저장]을 누르세요.`,
    );
    if ((rules.rolesTemplate || "") !== rolesText.trim()) {
      void SaveGroupRules(
        new models.GroupRules({
          ...rules,
          sourceKind: source.kind,
          sourceId: source.id,
          rolesTemplate: rolesText.trim(),
        }),
      )
        .then(() => reload())
        .catch(() => undefined);
    }
  }

  async function createGroups() {
    if (!(await confirmDiscard())) return;
    build(false);
  }

  async function reshuffle() {
    const ok = await confirmWithRadix({
      title: "모둠을 다시 섞을까요?",
      description:
        "지금 모둠과 직접 옮긴 내용이 새 무작위 편성으로 바뀝니다. 빠질 학생·조건·역할 설정은 그대로 씁니다.",
      actionLabel: "다시 섞기",
    });
    if (ok) build(true);
  }

  // 학생 참여 회차 결과를 편성 화면의 초안으로 옮긴다(역할은 지금 적힌 역할로 무작위 배정).
  function importSession(info: models.GroupSessionInfo) {
    const target = sources.find((item) => item.kind === info.sourceKind && item.id === info.sourceId);
    if (target && target.value !== sourceValue) setSourceValue(target.value);
    // 모둠장이 있는 방식이면 모둠장에게 "모둠장" 역할을 주고, 나머지 역할은 다른 학생에게 무작위로 나눈다.
    const leaders = new Set(info.leaders || []);
    const roles = leaders.size
      ? ["모둠장", ...parseRoles(rolesText).filter((role) => role !== "모둠장")]
      : parseRoles(rolesText);
    const otherRoles = leaders.size ? roles.slice(1) : roles;
    const groups = info.result.map((group) => {
      const members = group.members.map((member) => ({ key: member.key, number: member.number, name: member.name }));
      const leader = members
        .filter((member) => leaders.has(member.key))
        .map((member) => ({ ...member, role: "모둠장" }));
      const others = assignRoles([members.filter((member) => !leaders.has(member.key))], otherRoles)[0];
      return [...leader, ...others];
    });
    const placed = new Set(info.result.flatMap((group) => group.members.map((member) => member.key)));
    setDraft({
      id: "",
      updatedAt: "",
      createdAt: "",
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
    setDraft({
      ...draft,
      groups: draft.groups.map((group, index) =>
        index === groupIndex
          ? { ...group, members: group.members.map((member) => (member.key === key ? { ...member, role } : member)) }
          : group,
      ),
    });
    setDirty(true);
  }

  async function savePlan() {
    if (!draft || !source) return;
    setBusy(true);
    try {
      const saved = new models.GroupPlan(
        await SaveGroupPlan(
          new models.GroupPlan({
            id: draft.id,
            updatedAt: draft.updatedAt,
            createdAt: draft.createdAt,
            title: draft.title,
            sourceKind: source.kind,
            sourceId: source.id,
            sourceLabel: source.label.replace(" (우리 반)", ""),
            roles: draft.roles,
            groups: draft.groups,
            excluded: draft.excluded.map((pupil) => ({ ...pupil, role: "" })),
          }),
        ),
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
      id: plan.id,
      updatedAt: plan.updatedAt,
      createdAt: plan.createdAt,
      title: plan.title,
      roles: plan.roles,
      groups: plan.groups.map((group) => ({
        name: group.name,
        members: group.members.map((member) => ({ ...member })),
      })),
      excluded: plan.excluded.map((member) => ({ key: member.key, number: member.number, name: member.name })),
    });
    setDirty(false);
    setSelectedKey("");
    setFeedback("");
    setNotice("");
  }

  async function deletePlan() {
    if (!draft?.id) return;
    const ok = await confirmWithRadix({
      title: "이 모둠 편성 이력을 지울까요?",
      description: `"${draft.title}" 이력을 지웁니다. 지운 이력은 되돌릴 수 없고, 다음 편성의 겹침 줄이기에서도 빠집니다.`,
      actionLabel: "지우기",
    });
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
    const cards = draft.groups
      .map(
        (group) =>
          `<article><h2>${escapeHtml(group.name)}</h2><ol>${group.members.map((member) => `<li><b>${escapeHtml(memberLabel(member))}</b>${member.role ? `<span>${escapeHtml(member.role)}</span>` : ""}</li>`).join("")}</ol></article>`,
      )
      .join("");
    const p = ".print-sheet";
    const columns = draft.groups.length > 6 ? 4 : 3;
    const css = `@page{size:A4 landscape;margin:12mm}${p}{font-family:Arial,sans-serif;color:#1e2a44}${p} h1{text-align:center;margin:0 0 8mm;font-size:22pt}${p} .grid{display:grid;grid-template-columns:repeat(${columns},1fr);gap:6mm}${p} article{border:1px solid #777;border-radius:6px;padding:5mm;break-inside:avoid}${p} h2{margin:0 0 3mm;font-size:17pt}${p} ol{margin:0;padding-left:0;list-style:none}${p} li{display:flex;justify-content:space-between;gap:4mm;padding:1.5mm 0;border-bottom:1px dashed #bbb;font-size:13pt}${p} li span{color:#855a31;font-size:11pt}`;
    void printSheet(`<h1>${escapeHtml(draft.title)}</h1><main class="grid">${cards}</main>`, css).catch(() =>
      setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."),
    );
  }

  function addPair() {
    if (!source || !pairDraft.a || !pairDraft.b || pairDraft.a === pairDraft.b) return;
    const pair = { a: pairDraft.a, b: pairDraft.b };
    const next = new models.GroupRules({
      ...rules,
      sourceKind: source.kind,
      sourceId: source.id,
      separate: pairDraft.kind === "separate" ? [...rules.separate, pair] : rules.separate,
      together: pairDraft.kind === "together" ? [...rules.together, pair] : rules.together,
    });
    void saveRules(next, "편성 조건을 저장했습니다. 이 조건은 교사 화면에만 보입니다.");
    setPairDraft({ ...pairDraft, a: "", b: "" });
  }

  function removePair(kind: "separate" | "together", pair: Pair) {
    if (!source) return;
    const keep = (items: models.GroupPair[]) => items.filter((item) => !(item.a === pair.a && item.b === pair.b));
    const next = new models.GroupRules({
      ...rules,
      sourceKind: source.kind,
      sourceId: source.id,
      separate: kind === "separate" ? keep(rules.separate) : rules.separate,
      together: kind === "together" ? keep(rules.together) : rules.together,
    });
    void saveRules(next, "편성 조건을 지웠습니다.");
  }

  return {
    saveRules,
    confirmDiscard,
    build,
    createGroups,
    reshuffle,
    importSession,
    clickMember,
    moveTo,
    setRole,
    savePlan,
    openPlan,
    deletePlan,
    print,
    addPair,
    removePair,
  };
}
