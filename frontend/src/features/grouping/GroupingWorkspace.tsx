import { GroupSessionPanel } from "./GroupSessionPanel";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { formatDate, memberLabel } from "./useGroupingPage";
import type { GroupingView } from "./GroupingPage";

/** 모둠 편성 작업 구역: 대상 반 고르기, 인원·모둠 수, 편성 결과와 이력. */
export function GroupingWorkspace({ view }: { view: GroupingView }) {
  const {
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
    setRulesOpen,
    setPresentOpen,
    setPairDraft,
    setFeedback,
    busy,
    sessionInfo,
    setSessionInfo,
    setStartOpen,
    sources,
    source,
    rules,
    plans,
    previousPlan,
    nameOf,
    present,
    count,
    check,
    saveRules,
    confirmDiscard,
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
    pairName,
    ruleCount,
    isHomeroomTeacher,
  } = view;
  return (
    <>
      {!sources.length ? (
        <section className="panel grouping-empty">
          <strong>모둠을 만들 학생 명렬이 없습니다</strong>
          <p>
            {isHomeroomTeacher
              ? "학생 명렬을 가져오거나, 평가 관리에서 나이스 수행평가 파일을 가져와 수업 명렬을 만들어 주세요."
              : "평가 관리에서 나이스 수행평가 파일을 가져오면 수업 명렬이 생깁니다."}
          </p>
        </section>
      ) : (
        <div className="grouping-layout">
          <aside className="panel grouping-history" aria-label="모둠 편성 이력">
            <h3>
              편성 이력 <small>{plans.length}개</small>
            </h3>
            {plans.length ? (
              <ul>
                {plans.map((plan) => (
                  <li key={plan.id}>
                    <button
                      type="button"
                      className={draft?.id === plan.id ? "active" : ""}
                      onClick={() => void openPlan(plan)}
                    >
                      <strong>{plan.title}</strong>
                      <span>
                        {plan.groups.length}모둠 · {plan.groups.reduce((sum, group) => sum + group.members.length, 0)}명
                        · {formatDate(plan.createdAt)}
                      </span>
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
                  <select
                    value={sourceValue}
                    onChange={async (event) => {
                      const value = event.target.value;
                      if (await confirmDiscard()) {
                        setSourceValue(value);
                        setDraft(null);
                        setDirty(false);
                        setFeedback("");
                      }
                    }}
                  >
                    {sources.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label} · {item.pupils.length}명
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grouping-field">
                  <span>나누는 방법</span>
                  <div className="grouping-mode">
                    <select
                      aria-label="나누는 방법"
                      value={mode}
                      onChange={(event) => setMode(event.target.value as "size" | "count")}
                    >
                      <option value="size">모둠당 인원</option>
                      <option value="count">모둠 수</option>
                    </select>
                    <input
                      aria-label={mode === "size" ? "모둠당 인원" : "모둠 수"}
                      inputMode="numeric"
                      value={amount || ""}
                      onChange={(event) => setAmount(Number(event.target.value.replace(/\D/g, "")) || 0)}
                    />
                    <span>{mode === "size" ? "명씩" : "개 모둠"}</span>
                  </div>
                </div>
                <label className="grouping-field grouping-roles">
                  <span>
                    역할 <small>(선택, 쉼표로 구분)</small>{" "}
                    <HelpTip>
                      예: 모둠장, 기록, 발표. 모둠마다 무작위로 한 명씩 맡기고, 나중에 바꿀 수 있습니다.
                    </HelpTip>
                  </span>
                  <input
                    value={rolesText}
                    placeholder="예: 모둠장, 기록, 발표"
                    onChange={(event) => setRolesText(event.target.value)}
                  />
                </label>
              </div>
              <details className="grouping-absent">
                <summary>오늘 빠지는 학생 {excluded.size ? <b>{excluded.size}명</b> : <small>(없음)</small>}</summary>
                <div className="grouping-absent-list">
                  {(source?.pupils || []).map((pupil) => (
                    <label key={pupil.key}>
                      <input
                        type="checkbox"
                        checked={excluded.has(pupil.key)}
                        onChange={(event) => {
                          const next = new Set(excluded);
                          if (event.target.checked) next.add(pupil.key);
                          else next.delete(pupil.key);
                          setExcluded(next);
                        }}
                      />
                      {memberLabel(pupil)}
                    </label>
                  ))}
                </div>
              </details>
              <div className="grouping-setup-actions">
                <label className="grouping-check">
                  <input
                    type="checkbox"
                    checked={rules.avoidRepeat}
                    disabled={busy || !source}
                    onChange={(event) =>
                      source &&
                      void saveRules(
                        new models.GroupRules({
                          ...rules,
                          sourceKind: source.kind,
                          sourceId: source.id,
                          avoidRepeat: event.target.checked,
                        }),
                        event.target.checked ? "지난 모둠과 겹치지 않게 나눕니다." : "지난 모둠과 상관없이 나눕니다.",
                      )
                    }
                  />
                  지난 모둠과 겹치지 않게{" "}
                  {previousPlan ? (
                    <small>(기준: {previousPlan.title})</small>
                  ) : (
                    <small>(저장한 이력이 없어 아직 적용 안 됨)</small>
                  )}
                </label>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => {
                    setPairDraft({ kind: "separate", a: "", b: "" });
                    setRulesOpen(true);
                  }}
                >
                  편성 조건(교사만 보기){ruleCount ? ` ${ruleCount}개` : ""}
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  disabled={busy || Boolean(sessionInfo) || present.length < 2}
                  onClick={() => setStartOpen(true)}
                  title={sessionInfo ? "진행 중인 학생 참여 회차가 있습니다" : undefined}
                >
                  학생 참여로 편성
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || !count}
                  onClick={() => void createGroups()}
                >
                  모둠 만들기{count ? ` (${present.length}명 → ${count}모둠)` : ""}
                </button>
              </div>
            </section>

            {draft && (
              <section className="panel grouping-result">
                <div className="grouping-result-head">
                  <label className="grouping-title">
                    <span className="sr-only">모둠 편성 이름</span>
                    <input
                      aria-label="모둠 편성 이름"
                      value={draft.title}
                      maxLength={60}
                      onChange={(event) => {
                        setDraft({ ...draft, title: event.target.value });
                        setDirty(true);
                      }}
                    />
                  </label>
                  {dirty ? (
                    <span className="grouping-dirty">저장하지 않음</span>
                  ) : draft.id ? (
                    <span className="grouping-saved">저장됨</span>
                  ) : null}
                  <div className="grouping-result-actions">
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => void reshuffle()}>
                      다시 섞기
                    </button>
                    <button type="button" className="quiet-button" onClick={() => setPresentOpen(true)}>
                      전자칠판 보기
                    </button>
                    <button type="button" className="quiet-button" onClick={print}>
                      인쇄
                    </button>
                    {draft.id && (
                      <button type="button" className="danger-button" disabled={busy} onClick={() => void deletePlan()}>
                        삭제
                      </button>
                    )}
                    <button
                      type="button"
                      className="primary-button"
                      disabled={busy || !dirty}
                      onClick={() => void savePlan()}
                    >
                      저장
                    </button>
                  </div>
                </div>
                {check &&
                  (check.separateBroken.length > 0 ||
                    check.togetherBroken.length > 0 ||
                    check.spread > 1 ||
                    check.repeats > 0) && (
                    <ul className="grouping-warnings" role="status">
                      {check.separateBroken.map((pair) => (
                        <li key={`s-${pair.a}-${pair.b}`} className="bad">
                          {pairName(pair.a)}·{pairName(pair.b)} 학생이 같은 모둠입니다(넣지 않을 학생).
                        </li>
                      ))}
                      {check.togetherBroken.map((pair) => (
                        <li key={`t-${pair.a}-${pair.b}`} className="bad">
                          {pairName(pair.a)}·{pairName(pair.b)} 학생이 다른 모둠입니다(함께 넣을 학생).
                        </li>
                      ))}
                      {check.spread > 1 && <li className="bad">모둠 인원 차이가 {check.spread}명입니다.</li>}
                      {check.repeats > 0 && <li>지난 모둠과 같은 짝이 {check.repeats}쌍 있습니다.</li>}
                    </ul>
                  )}
                {selectedKey && (
                  <p className="grouping-hint" role="status">
                    {nameOf.get(selectedKey) || "선택한 학생"}을(를) 골랐습니다. 다른 학생을 누르면 맞바꾸고, 다른
                    모둠의 [여기로]를 누르면 옮깁니다. 같은 학생을 다시 누르면 취소합니다.
                  </p>
                )}
                <div className="grouping-cards">
                  {draft.groups.map((group, groupIndex) => {
                    const holdsSelected = group.members.some((member) => member.key === selectedKey);
                    return (
                      <article key={groupIndex} className="grouping-card">
                        <header>
                          <input
                            aria-label={`${groupIndex + 1}번째 모둠 이름`}
                            value={group.name}
                            maxLength={30}
                            onChange={(event) => {
                              setDraft({
                                ...draft,
                                groups: draft.groups.map((item, index) =>
                                  index === groupIndex ? { ...item, name: event.target.value } : item,
                                ),
                              });
                              setDirty(true);
                            }}
                          />
                          <small>{group.members.length}명</small>
                          {selectedKey && !holdsSelected && (
                            <button type="button" className="text-button" onClick={() => moveTo(groupIndex)}>
                              여기로
                            </button>
                          )}
                        </header>
                        <ul>
                          {group.members.map((member) => (
                            <li key={member.key} className={member.key === selectedKey ? "selected" : ""}>
                              <button
                                type="button"
                                aria-pressed={member.key === selectedKey}
                                onClick={() => clickMember(member.key)}
                              >
                                {memberLabel(member)}
                              </button>
                              {draft.roles.length > 0 && (
                                <select
                                  aria-label={`${member.name} 역할`}
                                  value={member.role}
                                  onChange={(event) => setRole(groupIndex, member.key, event.target.value)}
                                >
                                  <option value="">역할 없음</option>
                                  {draft.roles.map((role) => (
                                    <option key={role} value={role}>
                                      {role}
                                    </option>
                                  ))}
                                  {member.role && !draft.roles.includes(member.role) && (
                                    <option value={member.role}>{member.role}</option>
                                  )}
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
                {draft.excluded.length > 0 && (
                  <p className="grouping-muted">빠진 학생: {draft.excluded.map(memberLabel).join(", ")}</p>
                )}
              </section>
            )}
          </div>
        </div>
      )}
    </>
  );
}
