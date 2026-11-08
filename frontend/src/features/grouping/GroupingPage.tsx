import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DeleteGroupPlan, GetGroupingBook, ListCourseRosters, SaveGroupPlan, SaveGroupRules } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { printSheet } from "../shared/desktopActions";
import { errorMessage, todayLocal } from "../shared/format";
import { rosterLabel } from "../timetable/timetableState";
import {
  assignRoles,
  courseKey,
  defaultGroupNames,
  evaluate,
  groupCount,
  makeGroups,
  moveMember,
  pairsInPlan,
  parseRoles,
  swapMembers,
  type GroupDraft,
  type Pair,
  type Pupil,
} from "./groupingState";
import "./grouping.css";

type Source = { value: string; kind: "homeroom" | "course"; id: string; label: string; pupils: Pupil[] };
type Draft = { id: string; updatedAt: string; createdAt: string; title: string; roles: string[]; groups: GroupDraft[]; excluded: Pupil[] };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function memberLabel(member: Pupil) {
  return `${member.number ? `${member.number}번 ` : ""}${member.name}`;
}

export function GroupingPage({ students, isHomeroomTeacher, config }: { students: models.Student[]; isHomeroomTeacher: boolean; config: models.ClassConfig | null }) {
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
  }, []);

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

  return (
    <div className="grouping-page">
      <header className="grouping-hero">
        <div>
          <p className="eyebrow">수업용 · 암호화 보관</p>
          <h2>모둠 편성</h2>
          <p>반을 고르고 인원을 정하면 고르게 나눕니다. 학생을 눌러 옮기거나 맞바꾼 뒤 전자칠판에 보여 주세요.</p>
        </div>
      </header>

      <HelpGuide
        title="모둠 편성 사용 순서"
        description="번호와 이름만 씁니다. 성적·연락처는 쓰지 않습니다."
        defaultOpen={!book.plans.length}
        steps={[
          { title: "반 고르기", detail: isHomeroomTeacher ? "우리 반(학생 명렬) 또는 수업 명렬의 반을 고릅니다." : "수업 명렬의 반을 고릅니다. 명렬은 평가 관리에서 나이스 파일을 가져오면 생깁니다." },
          { title: "인원 정하기", detail: "모둠당 인원 또는 모둠 수를 정하고, 오늘 빠지는 학생을 체크합니다. 역할(모둠장·기록 등)은 적고 싶을 때만 적습니다." },
          { title: "편성 조건(선택)", detail: "같은 모둠에 넣지 않을 학생·함께 넣을 학생을 정합니다. 교사 화면에만 보이고 전자칠판·인쇄물에는 나오지 않습니다." },
          { title: "조정하기", detail: "학생을 누른 뒤 다른 학생을 누르면 맞바꾸고, 다른 모둠의 [여기로]를 누르면 옮깁니다." },
          { title: "저장·발표", detail: "[저장]하면 이력이 남고, 다음 편성 때 지난 모둠과 겹치지 않게 나눌 수 있습니다. [전자칠판 보기]·[인쇄]로 학생에게 알립니다." },
        ]}
        note="모둠 편성과 조건은 이 컴퓨터의 암호화 보관함에만 저장되고 암호화 백업에 함께 들어갑니다."
      />

      {notice && <p className="grouping-notice" role="alert">{notice}</p>}
      {feedback && <p className="grouping-feedback" role="status">{feedback}</p>}

      {!sources.length ? (
        <section className="panel grouping-empty">
          <strong>모둠을 만들 학생 명렬이 없습니다</strong>
          <p>{isHomeroomTeacher ? "학생 명렬을 가져오거나, 평가 관리에서 나이스 수행평가 파일을 가져와 수업 명렬을 만들어 주세요." : "평가 관리에서 나이스 수행평가 파일을 가져오면 수업 명렬이 생깁니다."}</p>
        </section>
      ) : (
        <div className="grouping-layout">
          <aside className="panel grouping-history" aria-label="모둠 편성 이력">
            <h3>편성 이력 <small>{plans.length}개</small></h3>
            {plans.length ? (
              <ul>
                {plans.map((plan) => (
                  <li key={plan.id}>
                    <button type="button" className={draft?.id === plan.id ? "active" : ""} onClick={() => void openPlan(plan)}>
                      <strong>{plan.title}</strong>
                      <span>{plan.groups.length}모둠 · {plan.groups.reduce((sum, group) => sum + group.members.length, 0)}명 · {formatDate(plan.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="grouping-muted">이 반은 아직 저장한 모둠이 없습니다.</p>
            )}
          </aside>

          <div className="grouping-main">
            <section className="panel grouping-setup">
              <div className="grouping-setup-row">
                <label className="grouping-field">
                  <span>반</span>
                  <select value={sourceValue} onChange={async (event) => { const value = event.target.value; if (await confirmDiscard()) { setSourceValue(value); setDraft(null); setDirty(false); setFeedback(""); } }}>
                    {sources.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.pupils.length}명</option>)}
                  </select>
                </label>
                <div className="grouping-field">
                  <span>나누는 방법</span>
                  <div className="grouping-mode">
                    <select aria-label="나누는 방법" value={mode} onChange={(event) => setMode(event.target.value as "size" | "count")}>
                      <option value="size">모둠당 인원</option>
                      <option value="count">모둠 수</option>
                    </select>
                    <input aria-label={mode === "size" ? "모둠당 인원" : "모둠 수"} inputMode="numeric" value={amount || ""} onChange={(event) => setAmount(Number(event.target.value.replace(/\D/g, "")) || 0)} />
                    <span>{mode === "size" ? "명씩" : "개 모둠"}</span>
                  </div>
                </div>
                <label className="grouping-field grouping-roles">
                  <span>역할 <small>(선택, 쉼표로 구분)</small> <HelpTip>예: 모둠장, 기록, 발표. 모둠마다 무작위로 한 명씩 맡기고, 나중에 바꿀 수 있습니다.</HelpTip></span>
                  <input value={rolesText} placeholder="예: 모둠장, 기록, 발표" onChange={(event) => setRolesText(event.target.value)} />
                </label>
              </div>
              <details className="grouping-absent">
                <summary>오늘 빠지는 학생 {excluded.size ? <b>{excluded.size}명</b> : <small>(없음)</small>}</summary>
                <div className="grouping-absent-list">
                  {(source?.pupils || []).map((pupil) => (
                    <label key={pupil.key}>
                      <input type="checkbox" checked={excluded.has(pupil.key)} onChange={(event) => { const next = new Set(excluded); if (event.target.checked) next.add(pupil.key); else next.delete(pupil.key); setExcluded(next); }} />
                      {memberLabel(pupil)}
                    </label>
                  ))}
                </div>
              </details>
              <div className="grouping-setup-actions">
                <label className="grouping-check">
                  <input type="checkbox" checked={rules.avoidRepeat} disabled={busy || !source} onChange={(event) => source && void saveRules(new models.GroupRules({ ...rules, sourceKind: source.kind, sourceId: source.id, avoidRepeat: event.target.checked }), event.target.checked ? "지난 모둠과 겹치지 않게 나눕니다." : "지난 모둠과 상관없이 나눕니다.")} />
                  지난 모둠과 겹치지 않게 {previousPlan ? <small>(기준: {previousPlan.title})</small> : <small>(저장한 이력이 없어 아직 적용 안 됨)</small>}
                </label>
                <button type="button" className="quiet-button" onClick={() => { setPairDraft({ kind: "separate", a: "", b: "" }); setRulesOpen(true); }}>
                  편성 조건(교사만 보기){ruleCount ? ` ${ruleCount}개` : ""}
                </button>
                <button type="button" className="primary-button" disabled={busy || !count} onClick={() => void createGroups()}>
                  모둠 만들기{count ? ` (${present.length}명 → ${count}모둠)` : ""}
                </button>
              </div>
            </section>

            {draft && (
              <section className="panel grouping-result">
                <div className="grouping-result-head">
                  <label className="grouping-title">
                    <span className="sr-only">모둠 편성 이름</span>
                    <input aria-label="모둠 편성 이름" value={draft.title} maxLength={60} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setDirty(true); }} />
                  </label>
                  {dirty ? <span className="grouping-dirty">저장하지 않음</span> : draft.id ? <span className="grouping-saved">저장됨</span> : null}
                  <div className="grouping-result-actions">
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => void reshuffle()}>다시 섞기</button>
                    <button type="button" className="quiet-button" onClick={() => setPresentOpen(true)}>전자칠판 보기</button>
                    <button type="button" className="quiet-button" onClick={print}>인쇄</button>
                    {draft.id && <button type="button" className="danger-button" disabled={busy} onClick={() => void deletePlan()}>삭제</button>}
                    <button type="button" className="primary-button" disabled={busy || !dirty} onClick={() => void savePlan()}>저장</button>
                  </div>
                </div>
                {check && (check.separateBroken.length > 0 || check.togetherBroken.length > 0 || check.spread > 1 || check.repeats > 0) && (
                  <ul className="grouping-warnings" role="status">
                    {check.separateBroken.map((pair) => <li key={`s-${pair.a}-${pair.b}`} className="bad">{pairName(pair.a)}·{pairName(pair.b)} 학생이 같은 모둠입니다(넣지 않을 학생).</li>)}
                    {check.togetherBroken.map((pair) => <li key={`t-${pair.a}-${pair.b}`} className="bad">{pairName(pair.a)}·{pairName(pair.b)} 학생이 다른 모둠입니다(함께 넣을 학생).</li>)}
                    {check.spread > 1 && <li className="bad">모둠 인원 차이가 {check.spread}명입니다.</li>}
                    {check.repeats > 0 && <li>지난 모둠과 같은 짝이 {check.repeats}쌍 있습니다.</li>}
                  </ul>
                )}
                {selectedKey && <p className="grouping-hint" role="status">{nameOf.get(selectedKey) || "선택한 학생"}을(를) 골랐습니다. 다른 학생을 누르면 맞바꾸고, 다른 모둠의 [여기로]를 누르면 옮깁니다. 같은 학생을 다시 누르면 취소합니다.</p>}
                <div className="grouping-cards">
                  {draft.groups.map((group, groupIndex) => {
                    const holdsSelected = group.members.some((member) => member.key === selectedKey);
                    return (
                      <article key={groupIndex} className="grouping-card">
                        <header>
                          <input aria-label={`${groupIndex + 1}번째 모둠 이름`} value={group.name} maxLength={30} onChange={(event) => { setDraft({ ...draft, groups: draft.groups.map((item, index) => (index === groupIndex ? { ...item, name: event.target.value } : item)) }); setDirty(true); }} />
                          <small>{group.members.length}명</small>
                          {selectedKey && !holdsSelected && <button type="button" className="text-button" onClick={() => moveTo(groupIndex)}>여기로</button>}
                        </header>
                        <ul>
                          {group.members.map((member) => (
                            <li key={member.key} className={member.key === selectedKey ? "selected" : ""}>
                              <button type="button" aria-pressed={member.key === selectedKey} onClick={() => clickMember(member.key)}>{memberLabel(member)}</button>
                              {draft.roles.length > 0 && (
                                <select aria-label={`${member.name} 역할`} value={member.role} onChange={(event) => setRole(groupIndex, member.key, event.target.value)}>
                                  <option value="">역할 없음</option>
                                  {draft.roles.map((role) => <option key={role} value={role}>{role}</option>)}
                                  {member.role && !draft.roles.includes(member.role) && <option value={member.role}>{member.role}</option>}
                                </select>
                              )}
                            </li>
                          ))}
                          {!group.members.length && <li className="grouping-muted">비어 있음</li>}
                        </ul>
                      </article>
                    );
                  })}
                </div>
                {draft.excluded.length > 0 && <p className="grouping-muted">빠진 학생: {draft.excluded.map(memberLabel).join(", ")}</p>}
              </section>
            )}
          </div>
        </div>
      )}

      <Dialog.Root open={rulesOpen} onOpenChange={(open) => !busy && setRulesOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content grouping-dialog">
            <Dialog.Title>편성 조건 · {source?.label}</Dialog.Title>
            <Dialog.Description className="grouping-dialog-description">
              이 조건은 교사 화면에만 보이고 전자칠판·인쇄물에는 절대 나오지 않습니다. 반마다 따로 저장되어 다음 편성에도 쓰입니다.
            </Dialog.Description>
            {notice && <p className="grouping-notice" role="alert">{notice}</p>}
            <div className="grouping-pair-form">
              <select aria-label="조건 종류" value={pairDraft.kind} onChange={(event) => setPairDraft({ ...pairDraft, kind: event.target.value as "separate" | "together" })}>
                <option value="separate">같은 모둠에 넣지 않기</option>
                <option value="together">같은 모둠에 함께 넣기</option>
              </select>
              <select aria-label="첫째 학생" value={pairDraft.a} onChange={(event) => setPairDraft({ ...pairDraft, a: event.target.value })}>
                <option value="">학생 고르기</option>
                {(source?.pupils || []).map((pupil) => <option key={pupil.key} value={pupil.key}>{memberLabel(pupil)}</option>)}
              </select>
              <select aria-label="둘째 학생" value={pairDraft.b} onChange={(event) => setPairDraft({ ...pairDraft, b: event.target.value })}>
                <option value="">학생 고르기</option>
                {(source?.pupils || []).filter((pupil) => pupil.key !== pairDraft.a).map((pupil) => <option key={pupil.key} value={pupil.key}>{memberLabel(pupil)}</option>)}
              </select>
              <button type="button" className="primary-button" disabled={busy || !pairDraft.a || !pairDraft.b} onClick={addPair}>추가</button>
            </div>
            {(["separate", "together"] as const).map((kind) => (
              <div key={kind} className="grouping-pair-list">
                <h3>{kind === "separate" ? "같은 모둠에 넣지 않기" : "같은 모둠에 함께 넣기"} <small>{(kind === "separate" ? rules.separate : rules.together).length}개</small></h3>
                {(kind === "separate" ? rules.separate : rules.together).length ? (
                  <ul>
                    {(kind === "separate" ? rules.separate : rules.together).map((pair) => (
                      <li key={`${pair.a}-${pair.b}`}>
                        <span>{pairName(pair.a)} · {pairName(pair.b)}</span>
                        <button type="button" className="text-button danger-text" disabled={busy} onClick={() => removePair(kind, pair)}>지우기</button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="grouping-muted">없음</p>
                )}
              </div>
            ))}
            <div className="dialog-actions">
              <Dialog.Close asChild><button type="button" className="quiet-button">닫기</button></Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={presentOpen} onOpenChange={setPresentOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="grouping-present-overlay" />
          <Dialog.Content className="grouping-present" aria-describedby={undefined}>
            {draft && (
              <>
                <header>
                  <Dialog.Title>{draft.title}</Dialog.Title>
                  <Dialog.Close asChild><button type="button" className="grouping-present-close">닫기 (Esc)</button></Dialog.Close>
                </header>
                <div className={`grouping-present-grid count-${Math.min(draft.groups.length, 10)}`}>
                  {draft.groups.map((group, index) => (
                    <article key={index}>
                      <h3>{group.name}</h3>
                      <ul>
                        {group.members.map((member) => (
                          <li key={member.key}>
                            <b>{memberLabel(member)}</b>
                            {member.role && <span>{member.role}</span>}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
