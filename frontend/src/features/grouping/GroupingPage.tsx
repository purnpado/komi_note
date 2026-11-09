import * as Dialog from "@radix-ui/react-dialog";
import { GroupSessionPanel } from "./GroupSessionPanel";
import { StartSessionDialog } from "./GroupSessionDialogs";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import "./grouping.css";
import { useGroupingPage, formatDate, memberLabel } from "./useGroupingPage";

export function GroupingPage({ students, isHomeroomTeacher, config }: { students: models.Student[]; isHomeroomTeacher: boolean; config: models.ClassConfig | null }) {
  const { book, setBook, rosters, setRosters, sourceValue, setSourceValue, mode, setMode, amount, setAmount, excluded, setExcluded, rolesText, setRolesText, draft, setDraft, dirty, setDirty, selectedKey, setSelectedKey, rulesOpen, setRulesOpen, presentOpen, setPresentOpen, pairDraft, setPairDraft, notice, setNotice, feedback, setFeedback, busy, setBusy, loaded, setLoaded, sessionInfo, setSessionInfo, startOpen, setStartOpen, reload, sources, source, rules, plans, previousPlan, previousPairs, nameOf, present, count, check, saveRules, confirmDiscard, build, createGroups, reshuffle, importSession, clickMember, moveTo, setRole, savePlan, openPlan, deletePlan, print, addPair, removePair, pairName, ruleCount } = useGroupingPage({ students, isHomeroomTeacher, config });
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
            {sessionInfo && <GroupSessionPanel info={sessionInfo} setInfo={setSessionInfo} onImport={importSession} />}
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
                <button type="button" className="quiet-button" disabled={busy || Boolean(sessionInfo) || present.length < 2} onClick={() => setStartOpen(true)} title={sessionInfo ? "진행 중인 학생 참여 회차가 있습니다" : undefined}>
                  학생 참여로 편성
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

      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        source={source ? { kind: source.kind, id: source.id, label: source.label.replace(" (우리 반)", "") } : null}
        presentCount={present.length}
        defaultCount={count || 4}
        excludedKeys={[...excluded]}
        onStarted={(info) => { setSessionInfo(info); setFeedback("학생 참여 회차를 열었습니다. [전자칠판 보기]로 QR을 보여 주세요."); }}
      />

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
