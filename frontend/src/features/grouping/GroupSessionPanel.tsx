import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloseGroupingPreferences,
  CloseGroupingVote,
  ConfirmGroupingLeaders,
  ExtendGroupingDeadline,
  GetGroupingSessionInfo,
  GroupingDraftPick,
  OpenGroupingPreferences,
  OpenGroupingVote,
  ResetGroupingStudent,
  RevealGroupingNames,
  RevealGroupingNextRound,
  SetGroupingPots,
  StartGroupingDraft,
  StartGroupingSession,
  StopGroupingSession,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpTip } from "../shared/HelpTip";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import { errorMessage } from "../shared/format";
import { defaultGroupNames, shuffle, cryptoRandom } from "./groupingState";

export type SessionSource = { kind: "homeroom" | "course"; id: string; label: string };
type Mode = "preference" | "draft" | "leaderPreference";
type Run = (action: () => Promise<unknown>) => Promise<void>;

const MODE_TEXT: Record<Mode, { label: string; detail: string }> = {
  preference: { label: "지망 배정", detail: "학생이 가고 싶은 모둠을 1~3지망까지 냅니다. 정원보다 많으면 추첨하고, 떨어지면 다음 지망으로 넘어갑니다." },
  draft: { label: "모둠장 투표 + 블라인드 지명", detail: "학생 투표(본인 추천 가능)로 모둠장 후보를 정해 선생님이 확정하고, 선생님이 나눈 포트에서 모둠장이 뱀 순서로 뒤집힌 카드를 뽑습니다. 카드 내용은 뒤집는 순간 정해집니다." },
  leaderPreference: { label: "모둠장 투표 + 지망 배정", detail: "모둠장을 정한 뒤, 나머지 학생은 모둠 이름·주제만 보고 지망합니다. 모둠장은 결과 발표 때 공개됩니다." },
};

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

// 공개된 라운드까지의 모둠별 학생 key와, 마지막으로 공개한 라운드에서 새로 들어온 학생.
function revealedMembers(info: models.GroupSessionInfo) {
  const groups = info.groupNames.map(() => [] as string[]);
  const fresh = new Set<string>();
  info.rounds.slice(0, info.revealed).forEach((round, index) => {
    round.groups.forEach((group, g) => {
      groups[g].push(...group.accepted);
      if (index === info.revealed - 1) group.accepted.forEach((key) => fresh.add(key));
    });
  });
  return { groups, fresh };
}

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
function LeaderDialog({ open, onOpenChange, info, run }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; run: Run }) {
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
function PotsDialog({ open, onOpenChange, info, run }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; run: Run }) {
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

// 진행 중인 회차: 교사 조작 패널 + 전자칠판 보기
export function GroupSessionPanel({
  info, setInfo, onImport,
}: {
  info: models.GroupSessionInfo;
  setInfo: (info: models.GroupSessionInfo | null) => void;
  onImport: (info: models.GroupSessionInfo) => void;
}) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [leaderOpen, setLeaderOpen] = useState(false);
  const [potsOpen, setPotsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // 회차가 열려 있는 동안 1초마다 상태를 읽는다(인원, 남은 시간, 자동 마감, 지명 차례).
  useEffect(() => {
    let active = true;
    const timer = window.setInterval(() => {
      GetGroupingSessionInfo()
        .then((next) => {
          if (!active) return;
          const value = new models.GroupSessionInfo(next);
          setInfo(value.running ? value : null);
        })
        .catch(() => undefined);
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [setInfo]);

  const run: Run = async (action) => {
    setBusy(true);
    try {
      const next = await action();
      if (next) setInfo(new models.GroupSessionInfo(next));
      setNotice("");
    } catch (reason) {
      setNotice(errorMessage(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  };
  const safeRun: Run = (action) => run(action).catch(() => undefined);

  async function stop() {
    const ok = await confirmWithRadix({ title: "모둠 참여 회차를 끝낼까요?", description: "학생 QR 주소가 닫히고, 투표·지망·닉네임 기록은 지워집니다. 배정 결과를 쓰려면 먼저 [편성 화면으로 가져오기]를 누르세요.", actionLabel: "회차 끝내기" });
    if (!ok) return;
    await StopGroupingSession();
    setInfo(null);
  }

  async function importResult() {
    const ok = await confirmWithRadix({ title: "결과를 편성 화면으로 가져올까요?", description: "회차를 끝내고 배정 결과를 모둠 편성 화면으로 옮깁니다. 그곳에서 확인·조정한 뒤 [저장]을 누르세요.", actionLabel: "가져오기" });
    if (!ok) return;
    onImport(info);
    await StopGroupingSession();
    setInfo(null);
  }

  // 교사만 보는 창은 전자칠판 보기를 닫고 연다.
  const openTeacherOnly = (which: "leader" | "pots") => {
    setBoardOpen(false);
    if (which === "leader") setLeaderOpen(true);
    else setPotsOpen(true);
  };
  const mode = (info.mode || "preference") as Mode;

  return (
    <section className="panel grouping-session" aria-label="학생 참여 모둠 회차">
      <div className="grouping-session-head">
        <div>
          <p className="eyebrow">학생 참여 · {MODE_TEXT[mode].label}</p>
          <h3>{info.sourceLabel} · {info.phase}{info.paused ? " (일시정지)" : ""}</h3>
        </div>
        <div className="grouping-result-actions">
          <button type="button" className="primary-button" onClick={() => setBoardOpen(true)}>전자칠판 보기</button>
          <button type="button" className="danger-button" onClick={() => void stop()}>회차 끝내기</button>
        </div>
      </div>
      {notice && <p className="grouping-notice" role="alert">{notice}</p>}
      <div className="grouping-session-body">
        {(info.phase === "입장" || info.phase === "지망 제출" || info.phase === "모둠장 투표") && (
          <div className="grouping-session-qr">
            <img src={info.qrCodeDataUrl} alt="학생 입장 QR" />
            <code>{info.studentUrl}</code>
          </div>
        )}
        <div className="grouping-session-status">
          <dl>
            <div><dt>입장</dt><dd>{info.joined} / {info.total}명</dd></div>
            {mode !== "preference" && <div><dt>투표</dt><dd>{info.voted}명</dd></div>}
            {mode !== "draft" && <div><dt>지망 제출</dt><dd>{info.submitted}명</dd></div>}
            {(info.phase === "지망 제출" || info.phase === "모둠장 투표") && <div><dt>남은 시간</dt><dd>{clock(info.remainingSeconds)}</dd></div>}
            {info.phase === "블라인드 지명" && <div><dt>지명</dt><dd>포트 {info.draftRound + 1}/{info.pots.length} · {clock(info.turnRemaining)}</dd></div>}
            {info.rounds.length > 0 && <div><dt>결과 공개</dt><dd>{info.revealed} / {info.rounds.length}</dd></div>}
          </dl>
          <SessionControls info={info} busy={busy} run={safeRun} onImport={() => void importResult()} onTeacherOnly={openTeacherOnly} />
          <ClassroomNetworkNotice />
        </div>
      </div>
      <details className="grouping-session-people">
        <summary>학생별 입장 현황(교사만 보기) · 전자칠판에 비치는 화면이면 펼치지 마세요</summary>
        <ul>
          {info.participants.map((person) => (
            <li key={person.key}>
              <span>{person.number ? `${person.number}번 ` : ""}{person.name}</span>
              <small>{person.joined ? (person.submitted ? "제출함" : "입장함") : "미입장"}</small>
              {person.joined && (info.phase === "입장" || info.phase === "지망 제출" || info.phase === "모둠장 투표") && (
                <button type="button" className="text-button" disabled={busy} onClick={() => void safeRun(() => ResetGroupingStudent(person.key))}>접속 초기화</button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <LeaderDialog open={leaderOpen} onOpenChange={setLeaderOpen} info={info} run={run} />
      <PotsDialog open={potsOpen} onOpenChange={setPotsOpen} info={info} run={run} />
      <SessionBoard open={boardOpen} onOpenChange={setBoardOpen} info={info} busy={busy} run={safeRun} onImport={() => void importResult()} onTeacherOnly={openTeacherOnly} />
    </section>
  );
}

function SessionControls({ info, busy, run, onImport, onTeacherOnly }: { info: models.GroupSessionInfo; busy: boolean; run: Run; onImport: () => void; onTeacherOnly: (which: "leader" | "pots") => void }) {
  const lastRound = info.revealed >= info.rounds.length - 1;
  const mode = info.mode || "preference";
  return (
    <div className="grouping-session-controls">
      {info.phase === "입장" && mode === "preference" && (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => OpenGroupingPreferences(info.submitSeconds))}>
          지망 받기 시작 ({Math.round(info.submitSeconds / 60)}분)
        </button>
      )}
      {info.phase === "입장" && mode !== "preference" && (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => OpenGroupingVote(info.voteSeconds))}>
          모둠장 투표 시작 ({Math.round(info.voteSeconds / 60)}분)
        </button>
      )}
      {info.phase === "모둠장 투표" && (
        <>
          <button type="button" className="quiet-button" disabled={busy} onClick={() => void run(() => ExtendGroupingDeadline(60))}>1분 늘리기</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => CloseGroupingVote())}>투표 마감</button>
        </>
      )}
      {info.phase === "모둠장 확정" && (
        <button type="button" className="primary-button" onClick={() => onTeacherOnly("leader")}>모둠장 확정하기(교사만 보기)</button>
      )}
      {info.phase === "포트 나누기" && (
        <button type="button" className="primary-button" onClick={() => onTeacherOnly("pots")}>포트 나누기(교사만 보기)</button>
      )}
      {info.phase === "블라인드 지명" && (
        <button type="button" className="quiet-button" disabled={busy} onClick={() => void run(() => GroupingDraftPick(0))}>대신 한 장 뽑기</button>
      )}
      {info.phase === "지망 제출" && (
        <>
          <button type="button" className="quiet-button" disabled={busy} onClick={() => void run(() => ExtendGroupingDeadline(60))}>1분 늘리기</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => CloseGroupingPreferences())}>지금 마감하고 배정</button>
        </>
      )}
      {info.phase === "배정 공개" && (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => RevealGroupingNextRound())}>
          {info.revealed === 0 ? `${info.rounds[0]?.label || "1지망"} 결과 공개` : lastRound ? "남은 자리 배정 공개" : `${info.rounds[info.revealed]?.label} 결과 공개`}
        </button>
      )}
      {info.phase === "배정 완료" && (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => RevealGroupingNames())}>이름 공개{mode !== "preference" ? "(모둠장도 함께)" : ""}</button>
      )}
      {(info.phase === "배정 완료" || info.phase === "실명 공개") && (
        <button type="button" className="quiet-button" disabled={busy} onClick={onImport}>편성 화면으로 가져오기</button>
      )}
    </div>
  );
}

// 전자칠판 보기: 학생에게 보여 줄 화면. 실명·모둠장은 교사가 공개한 뒤에만(블라인드 지명 중 모둠장은 닉네임),
// 득표수·지망 내용·포트 기준·조건은 보여 주지 않는다.
function SessionBoard({ open, onOpenChange, info, busy, run, onImport, onTeacherOnly }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; busy: boolean; run: Run; onImport: () => void; onTeacherOnly: (which: "leader" | "pots") => void }) {
  const byKey = useMemo(() => new Map(info.participants.map((person) => [person.key, person])), [info.participants]);
  const mode = info.mode || "preference";
  const leaders = new Set(info.leaders);
  const { groups: revealed, fresh } = revealedMembers(info);
  const label = (key: string) => {
    const person = byKey.get(key);
    if (!person) return "";
    if (info.namesRevealed || (info.leaderPublic && leaders.has(key))) return `${person.number ? `${person.number}번 ` : ""}${person.name}`;
    return person.nickname || "미입장 친구";
  };
  const leaderName = (index: number) => (info.leaderPublic && info.leaders[index] ? label(info.leaders[index]) : "");
  const nicknames = info.participants.filter((person) => person.joined).map((person) => person.nickname);
  const currentRound = info.revealed > 0 ? info.rounds[info.revealed - 1] : null;
  const placed = revealed.reduce((sum, list) => sum + list.length, 0);
  const lastPick = info.picks.length ? info.picks[info.picks.length - 1] : null;

  // 모둠별로 보여 줄 학생: 지명은 지금까지 뽑힌 학생(모둠장 맨 앞), 지망 방식은 공개한 라운드까지.
  // 모둠장+지망 방식에서 모둠장은 이름 공개 때까지 숨긴다.
  const shown = info.groupNames.map((_, index) => {
    if (mode === "draft") return info.result[index]?.members.map((member) => member.key) || [];
    const list = [...revealed[index]];
    if (mode === "leaderPreference" && (info.namesRevealed || info.leaderPublic) && info.leaders[index]) list.unshift(info.leaders[index]);
    return list;
  });

  const title =
    info.phase === "입장" ? "QR로 들어오세요"
      : info.phase === "모둠장 투표" ? "모둠장을 추천해 주세요"
        : info.phase === "모둠장 확정" ? "선생님이 모둠장을 정하고 있어요"
          : info.phase === "포트 나누기" ? "곧 블라인드 지명을 시작해요"
            : info.phase === "블라인드 지명" ? `포트 ${info.draftRound + 1} / ${info.pots.length} · ${info.turnGroup >= 0 ? `${info.groupNames[info.turnGroup]} 차례` : ""}`
              : info.phase === "지망 제출" ? "가고 싶은 모둠을 고르세요"
                : info.phase === "배정 공개" ? (currentRound ? `${currentRound.label} 결과` : "지망 마감! 결과를 공개합니다")
                  : info.phase === "배정 완료" ? "모든 친구가 모둠에 들어갔어요"
                    : "우리 모둠을 확인하세요";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="grouping-present-overlay" />
        <Dialog.Content className="grouping-present grouping-live" aria-describedby={undefined}>
          <header>
            <Dialog.Title>{title}</Dialog.Title>
            {info.phase === "블라인드 지명" && <span className="grouping-live-turn-timer" aria-live="polite">{clock(info.turnRemaining)}</span>}
            <Dialog.Close asChild><button type="button" className="grouping-present-close">닫기 (Esc)</button></Dialog.Close>
          </header>

          {info.phase === "입장" && (
            <div className="grouping-live-entry">
              <div className="grouping-live-qr">
                <img src={info.qrCodeDataUrl} alt="학생 입장 QR" />
                <code>{info.studentUrl}</code>
              </div>
              <div>
                <p className="grouping-live-count">입장 <b>{info.joined}</b> / {info.total}명</p>
                <ul className="grouping-live-nicks">{nicknames.map((nick) => <li key={nick}>{nick}</li>)}</ul>
              </div>
            </div>
          )}

          {(info.phase === "지망 제출" || info.phase === "모둠장 투표") && (
            <div className="grouping-live-submit">
              <p className="grouping-live-timer" aria-live="polite">{clock(info.remainingSeconds)}</p>
              <p className="grouping-live-count">
                {info.phase === "모둠장 투표"
                  ? <>투표 <b>{info.voted}</b> / {info.joined}명 · 나를 추천해도 돼요 · 결과는 선생님만 봐요</>
                  : <>제출 <b>{info.submitted}</b> / {Math.max(0, info.joined - (mode === "leaderPreference" ? info.leaders.length : 0))}명 · 늦게 온 친구도 지금 QR로 들어올 수 있어요</>}
              </p>
              {info.phase === "지망 제출" && (
                <div className="grouping-live-groups">
                  {info.groupNames.map((name, index) => (
                    <article key={index}><h3>{name}</h3><p>정원 {info.capacities[index]}명{mode === "leaderPreference" ? " (모둠장 포함)" : ""}</p>{leaderName(index) && <p className="grouping-live-leader-name">모둠장 {leaderName(index)}</p>}</article>
                  ))}
                </div>
              )}
              <img className="grouping-live-qr-small" src={info.qrCodeDataUrl} alt="학생 입장 QR" />
            </div>
          )}

          {(info.phase === "모둠장 확정" || info.phase === "포트 나누기") && (
            <div className="grouping-live-wait">
              <p>{info.phase === "모둠장 확정" ? "투표 결과는 선생님만 봅니다. 모둠장이 된 친구는 휴대폰에서 확인할 수 있어요(결과 발표 때까지 비밀!)." : "모둠장들이 뱀 순서(1→끝, 끝→1)로 뒤집힌 카드를 한 장씩 고릅니다. 카드 뒤에 누가 있는지는 아무도 몰라요."}</p>
            </div>
          )}

          {info.phase === "블라인드 지명" && info.turnGroup >= 0 && (
            <div className="grouping-live-deck">
              <p className="grouping-live-count"><b>{info.groupNames[info.turnGroup]}</b> 모둠장, 카드를 한 장 골라 주세요(휴대폰이나 여기서) · 남은 카드 {info.cardsLeft}장</p>
              <div className="grouping-live-cards">
                {Array.from({ length: info.cardsLeft }, (_, index) => (
                  <button key={`${info.picks.length}-${index}`} type="button" className="grouping-live-card" disabled={busy} onClick={() => void run(() => GroupingDraftPick(index + 1))}>{index + 1}</button>
                ))}
              </div>
              {lastPick && (
                <p key={info.picks.length} className="grouping-live-flip">
                  방금 {info.groupNames[lastPick.group]} ← <b>{label(lastPick.key)}</b>{lastPick.auto ? " (시간이 지나 자동으로 뽑힘)" : ""}
                </p>
              )}
            </div>
          )}

          {(info.phase === "블라인드 지명" || info.phase === "배정 공개" || info.phase === "배정 완료" || info.phase === "실명 공개") && (
            <>
              {info.phase === "배정 공개" && (
                <p className="grouping-live-count">
                  {currentRound ? `모둠에 들어간 친구 ${placed} / ${info.total - (mode === "leaderPreference" ? info.leaders.length : 0)}명 · 떨어진 친구는 다음 지망으로 넘어가요` : "버튼을 누르면 1지망 결과부터 차례로 공개합니다"}
                </p>
              )}
              <div className={`grouping-present-grid count-${Math.min(info.groupNames.length, 10)}${info.phase === "블라인드 지명" ? " compact" : ""}`}>
                {info.groupNames.map((name, index) => {
                  const round = currentRound?.groups[index];
                  const hiddenLeader = mode === "leaderPreference" && !info.namesRevealed && !info.leaderPublic;
                  return (
                    <article key={index} className={info.phase === "블라인드 지명" && info.turnGroup === index ? "grouping-live-current" : ""}>
                      <h3>
                        {name}
                        {info.phase === "배정 공개" && round && currentRound?.label !== "남은 자리" && (
                          <small className={round.applicants > round.accepted.length ? "grouping-live-hot" : ""}>
                            지원 {round.applicants}명{round.applicants > round.accepted.length ? " · 추첨" : ""}
                          </small>
                        )}
                        <em>{shown[index].length + (hiddenLeader ? 1 : 0)}/{info.capacities[index]}</em>
                      </h3>
                      <ul>
                        {hiddenLeader && <li className="grouping-live-leader-hidden"><b>모둠장 · 발표 때 공개</b></li>}
                        {shown[index].map((key) => (
                          <li key={key} className={(info.phase === "배정 공개" && fresh.has(key)) || (lastPick?.key === key && info.phase === "블라인드 지명") ? "grouping-live-fresh" : ""}>
                            <b>{label(key)}</b>
                            {leaders.has(key) && (mode === "draft" || info.namesRevealed || info.leaderPublic) && <span>모둠장</span>}
                          </li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <footer className="grouping-live-controls">
            <SessionControls info={info} busy={busy} run={run} onImport={onImport} onTeacherOnly={onTeacherOnly} />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
