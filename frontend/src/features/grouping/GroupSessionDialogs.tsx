import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ConfirmGroupingLeaders, SetGroupingPots, StartGroupingDraft, StartGroupingSession } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { defaultGroupNames, shuffle, cryptoRandom } from "./groupingState";
import { SessionSource, Mode, Run, MODE_TEXT } from "./GroupSessionPanel";

// 학생 참여 회차 시작 창
export function StartSessionDialog({
  open, onOpenChange, source, presentCount, defaultCount, excludedKeys, onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: SessionSource | null;
  presentCount: number;
  defaultCount: number;
  excludedKeys: string[];
  onStarted: (info: models.GroupSessionInfo) => void;
}) {
  const [mode, setMode] = useState<Mode>("preference");
  const [count, setCount] = useState(defaultCount || 4);
  const [names, setNames] = useState<string[]>(defaultGroupNames(defaultCount || 4));
  const [limit, setLimit] = useState(3);
  const [minutes, setMinutes] = useState(3);
  const [voteMinutes, setVoteMinutes] = useState(2);
  const [turnSeconds, setTurnSeconds] = useState(30);
  const [leaderPublic, setLeaderPublic] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = Math.max(2, Math.min(defaultCount || 4, 20));
    setCount(initial);
    setNames(defaultGroupNames(initial));
    setLimit(Math.min(3, initial));
    setError("");
  }, [open, defaultCount]);

  function changeCount(value: number) {
    const next = Math.max(2, Math.min(20, value || 2));
    setCount(next);
    setNames((current) => Array.from({ length: next }, (_, index) => current[index] || `${index + 1}모둠`));
    setLimit((current) => Math.min(current, next));
  }

  async function start() {
    if (!source) return;
    if (presentCount < count) return setError(`학생(${presentCount}명)이 모둠 수보다 적습니다.`);
    setBusy(true);
    try {
      const info = new models.GroupSessionInfo(await StartGroupingSession(new models.GroupSessionRequest({
        sourceKind: source.kind, sourceId: source.id, sourceLabel: source.label, groupNames: names,
        preferenceLimit: limit, submitSeconds: Math.round(minutes * 60), excludedKeys,
        mode, voteSeconds: Math.round(voteMinutes * 60), turnSeconds, leaderPublic: mode !== "preference" && leaderPublic,
      })));
      onStarted(info);
      onOpenChange(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  const base = Math.floor(presentCount / Math.max(count, 1));
  const usesPreference = mode !== "draft";
  const usesLeaders = mode !== "preference";
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content grouping-dialog">
          <Dialog.Title>학생 참여로 편성</Dialog.Title>
          <Dialog.Description className="grouping-dialog-description">
            학생이 QR로 들어와 번호와 이름을 확인하면 회차 닉네임이 생깁니다. 모든 배정이 끝날 때까지 친구들은 닉네임만 보고, 선생님의 편성 조건(넣지 않기·함께 넣기)은 학생 모르게 지켜집니다.
          </Dialog.Description>
          <div className="grouping-mode-choice" role="radiogroup" aria-label="참여 방식">
            {(Object.keys(MODE_TEXT) as Mode[]).map((key) => (
              <button key={key} type="button" role="radio" aria-checked={mode === key} className={mode === key ? "selected" : ""} onClick={() => setMode(key)}>
                <b>{MODE_TEXT[key].label}</b>
                <span>{MODE_TEXT[key].detail}</span>
              </button>
            ))}
          </div>
          <div className="grouping-session-form">
            <label className="grouping-field">
              <span>대상</span>
              <input value={`${source?.label || ""} · ${presentCount}명`} disabled />
            </label>
            <label className="grouping-field">
              <span>모둠 수{usesLeaders ? " (= 모둠장 수)" : ""}</span>
              <input inputMode="numeric" value={count} onChange={(event) => changeCount(Number(event.target.value.replace(/\D/g, "")))} />
            </label>
            {usesLeaders && (
              <label className="grouping-field">
                <span>모둠장 투표 시간</span>
                <select value={voteMinutes} onChange={(event) => setVoteMinutes(Number(event.target.value))}>
                  {[1, 2, 3, 5].map((value) => <option key={value} value={value}>{value}분</option>)}
                </select>
              </label>
            )}
            {mode === "draft" && (
              <label className="grouping-field">
                <span>카드 고르는 시간 <HelpTip>모둠장 한 명이 카드를 고르는 시간입니다. 지나면 자동으로 한 장이 뽑힙니다.</HelpTip></span>
                <select value={turnSeconds} onChange={(event) => setTurnSeconds(Number(event.target.value))}>
                  {[15, 20, 30, 45, 60].map((value) => <option key={value} value={value}>{value}초</option>)}
                </select>
              </label>
            )}
            {usesPreference && (
              <>
                <label className="grouping-field">
                  <span>지망 개수</span>
                  <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                    {[1, 2, 3].filter((value) => value <= count).map((value) => <option key={value} value={value}>{value}지망까지</option>)}
                  </select>
                </label>
                <label className="grouping-field">
                  <span>제출 시간 <HelpTip>지망을 받는 시간입니다. 진행 중에 1분씩 늘리거나 바로 마감할 수 있습니다.</HelpTip></span>
                  <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 7, 10].map((value) => <option key={value} value={value}>{value}분</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          {usesLeaders && (
            <label className="grouping-leader-public">
              <input type="checkbox" checked={leaderPublic} onChange={(event) => setLeaderPublic(event.target.checked)} />
              <span>
                <b>모둠장을 확정하자마자 공개</b>
                {mode === "leaderPreference"
                  ? " · 학생이 모둠장을 보고 지망하게 됩니다. 인기 있는 모둠장에게 몰리거나 지원이 적은 모둠장이 서운할 수 있어요. 끄면 모둠 이름·주제만 보고 고르고 모둠장은 결과 발표 때 공개됩니다."
                  : " · 전자칠판에 모둠장 실명이 처음부터 보입니다(뽑힌 모둠원은 끝날 때까지 닉네임). 끄면 모둠장도 닉네임으로 보이다가 결과 발표 때 함께 공개됩니다."}
              </span>
            </label>
          )}
          <p className="grouping-muted">모둠마다 {base}{presentCount % count ? `~${base + 1}` : ""}명{usesLeaders ? "(모둠장 포함)" : ""}. 모둠 이름에 탐구 주제를 적으면 학생이 주제를 보고 고릅니다.</p>
          <div className="grouping-session-names">
            {names.map((name, index) => (
              <input key={index} aria-label={`${index + 1}번째 모둠 이름`} value={name} maxLength={30} onChange={(event) => setNames(names.map((item, at) => (at === index ? event.target.value : item)))} />
            ))}
          </div>
          {error && <p className="grouping-notice" role="alert">{error}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild><button type="button" className="quiet-button" disabled={busy}>취소</button></Dialog.Close>
            <button type="button" className="primary-button" disabled={busy || !source} onClick={() => void start()}>QR 회차 열기</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 모둠장 확정 창(교사만 보기: 득표수가 보임)
export function LeaderDialog({ open, onOpenChange, info, run }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; run: Run }) {
  const [choice, setChoice] = useState<string[]>([]);
  useEffect(() => {
    if (open) setChoice(info.groupNames.map((_, index) => info.suggested[index] || ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const votes = new Map(info.voteCounts.map((item) => [item.key, item.count]));
  const people = [...info.participants].sort((a, b) => (votes.get(b.key) || 0) - (votes.get(a.key) || 0) || Number(a.number) - Number(b.number));
  const duplicated = choice.some((key, index) => key && choice.indexOf(key) !== index);
  const ready = choice.every(Boolean) && !duplicated;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content grouping-dialog">
          <Dialog.Title>모둠장 확정(교사만 보기)</Dialog.Title>
          <Dialog.Description className="grouping-dialog-description">
            ⚠️ 이 창에는 득표수가 보입니다. 화면이 전자칠판에 비치고 있다면 화면 공유를 잠시 멈춘 뒤 확인하세요. 득표가 많은 순서로 추천해 두었고, 바꿀 수 있습니다.
          </Dialog.Description>
          <div className="grouping-leader-grid">
            {info.groupNames.map((name, index) => (
              <label key={index} className="grouping-field">
                <span>{name}</span>
                <select value={choice[index] || ""} onChange={(event) => setChoice(choice.map((item, at) => (at === index ? event.target.value : item)))}>
                  <option value="">고르기</option>
                  {people.map((person) => (
                    <option key={person.key} value={person.key}>
                      {person.number}번 {person.name} · {votes.get(person.key) || 0}표{person.joined ? "" : " (미입장)"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {duplicated && <p className="grouping-notice" role="alert">한 학생을 두 모둠의 모둠장으로 고를 수 없습니다.</p>}
          <p className="grouping-muted">투표한 학생 {info.voted}명 · 표를 받은 학생 {info.voteCounts.length}명</p>
          <div className="dialog-actions">
            <Dialog.Close asChild><button type="button" className="quiet-button">닫기</button></Dialog.Close>
            <button type="button" className="primary-button" disabled={!ready} onClick={() => void run(() => ConfirmGroupingLeaders(choice)).then(() => onOpenChange(false))}>
              모둠장 확정{info.mode === "leaderPreference" ? "하고 지망 받기" : ""}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 포트 나누기 창(교사만 보기: 나눈 기준은 학생에게 공개하지 않음)
export function PotsDialog({ open, onOpenChange, info, run }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; run: Run }) {
  const size = info.groupNames.length;
  const leaders = new Set(info.leaders);
  const rest = info.participants.filter((person) => !leaders.has(person.key));
  const potCount = Math.max(1, Math.ceil(rest.length / size));
  const [potOf, setPotOf] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!open) return;
    const next: Record<string, number> = {};
    info.pots.forEach((pot, index) => pot.forEach((key) => (next[key] = index)));
    setPotOf(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pots = Array.from({ length: potCount }, (_, index) => rest.filter((person) => potOf[person.key] === index));
  const unplaced = rest.filter((person) => potOf[person.key] === undefined || potOf[person.key] >= potCount);
  const overfull = pots.findIndex((pot) => pot.length > size);
  const ready = !unplaced.length && overfull < 0;
  function randomise() {
    const next: Record<string, number> = {};
    shuffle(rest, cryptoRandom).forEach((person, index) => (next[person.key] = Math.floor(index / size)));
    setPotOf(next);
  }
  const save = (startDraft: boolean) =>
    run(async () => {
      const result = await SetGroupingPots(pots.map((pot) => pot.map((person) => person.key)));
      return startDraft ? StartGroupingDraft() : result;
    }).then(() => startDraft && onOpenChange(false));
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content grouping-dialog grouping-pots-dialog">
          <Dialog.Title>포트 나누기(교사만 보기)</Dialog.Title>
          <Dialog.Description className="grouping-dialog-description">
            같은 포트 학생은 한 모둠에 한 명씩만 들어갑니다(월드컵 조 추첨처럼). 비슷한 학생끼리 같은 포트에 넣으면 모둠마다 고르게 나뉩니다. 포트 하나에 {size}명까지, 나눈 기준은 학생에게 보이지 않습니다. 이 화면은 전자칠판에 비치지 않게 해 주세요.
          </Dialog.Description>
          <div className="grouping-pots-actions">
            <button type="button" className="quiet-button" onClick={randomise}>무작위로 다시 나누기</button>
            <span className="grouping-muted">포트 {potCount}개 · 모둠장 제외 {rest.length}명</span>
          </div>
          <div className="grouping-pots">
            {pots.map((pot, index) => (
              <section key={index} className={pot.length > size ? "over" : ""}>
                <h3>포트 {index + 1} <small>{pot.length}/{size}명</small></h3>
                <ul>{pot.map((person) => <li key={person.key}>{person.number}번 {person.name}</li>)}</ul>
              </section>
            ))}
          </div>
          <details className="grouping-pots-edit" open>
            <summary>학생별 포트 고르기</summary>
            <div className="grouping-pots-list">
              {rest.map((person) => (
                <label key={person.key}>
                  <span>{person.number}번 {person.name}</span>
                  <select value={potOf[person.key] ?? ""} onChange={(event) => setPotOf({ ...potOf, [person.key]: Number(event.target.value) })}>
                    <option value="" disabled>포트</option>
                    {Array.from({ length: potCount }, (_, index) => <option key={index} value={index}>포트 {index + 1}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
          {unplaced.length > 0 && <p className="grouping-notice" role="alert">포트를 고르지 않은 학생이 {unplaced.length}명 있습니다.</p>}
          {overfull >= 0 && <p className="grouping-notice" role="alert">포트 {overfull + 1}에 {size}명보다 많습니다.</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild><button type="button" className="quiet-button">닫기</button></Dialog.Close>
            <button type="button" className="quiet-button" disabled={!ready} onClick={() => void save(false)}>저장</button>
            <button type="button" className="primary-button" disabled={!ready} onClick={() => void save(true)}>저장하고 지명 시작</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
