import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CloseGroupingPreferences,
  ExtendGroupingDeadline,
  GetGroupingSessionInfo,
  OpenGroupingPreferences,
  ResetGroupingStudent,
  RevealGroupingNames,
  RevealGroupingNextRound,
  StartGroupingSession,
  StopGroupingSession,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpTip } from "../shared/HelpTip";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import { errorMessage } from "../shared/format";
import { defaultGroupNames } from "./groupingState";

export type SessionSource = { kind: "homeroom" | "course"; id: string; label: string };

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
  const [count, setCount] = useState(defaultCount || 4);
  const [names, setNames] = useState<string[]>(defaultGroupNames(defaultCount || 4));
  const [limit, setLimit] = useState(3);
  const [minutes, setMinutes] = useState(3);
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
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content grouping-dialog">
          <Dialog.Title>학생 참여로 편성 · 지망 배정</Dialog.Title>
          <Dialog.Description className="grouping-dialog-description">
            학생이 QR로 들어와 가고 싶은 모둠을 1~{limit}지망까지 냅니다. 정원보다 많으면 추첨하고, 떨어지면 다음 지망으로 넘어갑니다. 모든 배정이 끝날 때까지 친구들은 닉네임만 보입니다. 선생님의 편성 조건은 학생 모르게 지켜집니다.
          </Dialog.Description>
          <div className="grouping-session-form">
            <label className="grouping-field">
              <span>대상</span>
              <input value={`${source?.label || ""} · ${presentCount}명`} disabled />
            </label>
            <label className="grouping-field">
              <span>모둠 수</span>
              <input inputMode="numeric" value={count} onChange={(event) => changeCount(Number(event.target.value.replace(/\D/g, "")))} />
            </label>
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
          </div>
          <p className="grouping-muted">모둠마다 정원 {base}{presentCount % count ? `~${base + 1}` : ""}명. 모둠 이름에 탐구 주제를 적으면 학생이 주제를 보고 고릅니다.</p>
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

// 진행 중인 회차: 교사 조작 패널 + 전자칠판 보기
export function GroupSessionPanel({
  info, setInfo, onImport,
}: {
  info: models.GroupSessionInfo;
  setInfo: (info: models.GroupSessionInfo | null) => void;
  onImport: (info: models.GroupSessionInfo) => void;
}) {
  const [boardOpen, setBoardOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // 회차가 열려 있는 동안 1초마다 상태를 읽는다(입장·제출 인원, 남은 시간, 자동 마감).
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

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      const next = await action();
      if (next) setInfo(new models.GroupSessionInfo(next));
      setNotice("");
    } catch (reason) {
      setNotice(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    const ok = await confirmWithRadix({ title: "모둠 참여 회차를 끝낼까요?", description: "학생 QR 주소가 닫히고, 지망·닉네임 기록은 지워집니다. 배정 결과를 쓰려면 먼저 [편성 화면으로 가져오기]를 누르세요.", actionLabel: "회차 끝내기" });
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

  return (
    <section className="panel grouping-session" aria-label="학생 참여 모둠 회차">
      <div className="grouping-session-head">
        <div>
          <p className="eyebrow">학생 참여 · 지망 배정</p>
          <h3>{info.sourceLabel} · {info.phase}{info.paused ? " (일시정지)" : ""}</h3>
        </div>
        <div className="grouping-result-actions">
          <button type="button" className="primary-button" onClick={() => setBoardOpen(true)}>전자칠판 보기</button>
          <button type="button" className="danger-button" onClick={() => void stop()}>회차 끝내기</button>
        </div>
      </div>
      {notice && <p className="grouping-notice" role="alert">{notice}</p>}
      <div className="grouping-session-body">
        {(info.phase === "입장" || info.phase === "지망 제출") && (
          <div className="grouping-session-qr">
            <img src={info.qrCodeDataUrl} alt="학생 입장 QR" />
            <code>{info.studentUrl}</code>
          </div>
        )}
        <div className="grouping-session-status">
          <dl>
            <div><dt>입장</dt><dd>{info.joined} / {info.total}명</dd></div>
            <div><dt>지망 제출</dt><dd>{info.submitted}명</dd></div>
            {info.phase === "지망 제출" && <div><dt>남은 시간</dt><dd>{clock(info.remainingSeconds)}</dd></div>}
            {info.rounds.length > 0 && <div><dt>결과 공개</dt><dd>{info.revealed} / {info.rounds.length}</dd></div>}
          </dl>
          <SessionControls info={info} busy={busy} run={run} onImport={() => void importResult()} />
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
              {person.joined && (info.phase === "입장" || info.phase === "지망 제출") && (
                <button type="button" className="text-button" disabled={busy} onClick={() => void run(() => ResetGroupingStudent(person.key))}>접속 초기화</button>
              )}
            </li>
          ))}
        </ul>
      </details>
      <SessionBoard open={boardOpen} onOpenChange={setBoardOpen} info={info} busy={busy} run={run} onImport={() => void importResult()} />
    </section>
  );
}

function SessionControls({ info, busy, run, onImport }: { info: models.GroupSessionInfo; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void>; onImport: () => void }) {
  const lastRound = info.revealed >= info.rounds.length - 1;
  return (
    <div className="grouping-session-controls">
      {info.phase === "입장" && (
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => OpenGroupingPreferences(info.submitSeconds))}>
          지망 받기 시작 ({Math.round(info.submitSeconds / 60)}분)
        </button>
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
        <button type="button" className="primary-button" disabled={busy} onClick={() => void run(() => RevealGroupingNames())}>이름 공개</button>
      )}
      {(info.phase === "배정 완료" || info.phase === "실명 공개") && (
        <button type="button" className="quiet-button" disabled={busy} onClick={onImport}>편성 화면으로 가져오기</button>
      )}
    </div>
  );
}

// 전자칠판 보기: 학생에게 보여 줄 화면. 실명은 교사가 공개한 뒤에만, 지망 내용·조건은 보여 주지 않는다.
function SessionBoard({ open, onOpenChange, info, busy, run, onImport }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; busy: boolean; run: (action: () => Promise<unknown>) => Promise<void>; onImport: () => void }) {
  const byKey = useMemo(() => new Map(info.participants.map((person) => [person.key, person])), [info.participants]);
  const { groups, fresh } = revealedMembers(info);
  const label = (key: string) => {
    const person = byKey.get(key);
    if (!person) return "";
    if (info.namesRevealed) return `${person.number ? `${person.number}번 ` : ""}${person.name}`;
    return person.nickname || "미입장 친구";
  };
  const nicknames = info.participants.filter((person) => person.joined).map((person) => person.nickname);
  const currentRound = info.revealed > 0 ? info.rounds[info.revealed - 1] : null;
  const placed = groups.reduce((sum, list) => sum + list.length, 0);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="grouping-present-overlay" />
        <Dialog.Content className="grouping-present grouping-live" aria-describedby={undefined}>
          <header>
            <Dialog.Title>
              {info.phase === "입장" && "QR로 들어오세요"}
              {info.phase === "지망 제출" && "가고 싶은 모둠을 고르세요"}
              {info.phase === "배정 공개" && (currentRound ? `${currentRound.label} 결과` : "지망 마감! 결과를 공개합니다")}
              {info.phase === "배정 완료" && "모든 친구가 모둠에 들어갔어요"}
              {info.phase === "실명 공개" && "우리 모둠을 확인하세요"}
            </Dialog.Title>
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

          {info.phase === "지망 제출" && (
            <div className="grouping-live-submit">
              <p className="grouping-live-timer" aria-live="polite">{clock(info.remainingSeconds)}</p>
              <p className="grouping-live-count">제출 <b>{info.submitted}</b> / {info.joined}명 · 늦게 온 친구도 지금 QR로 들어올 수 있어요</p>
              <div className="grouping-live-groups">
                {info.groupNames.map((name, index) => (
                  <article key={index}><h3>{name}</h3><p>정원 {info.capacities[index]}명</p></article>
                ))}
              </div>
              <img className="grouping-live-qr-small" src={info.qrCodeDataUrl} alt="학생 입장 QR" />
            </div>
          )}

          {(info.phase === "배정 공개" || info.phase === "배정 완료" || info.phase === "실명 공개") && (
            <>
              {info.phase === "배정 공개" && (
                <p className="grouping-live-count">
                  {currentRound ? `모둠에 들어간 친구 ${placed} / ${info.total}명 · 떨어진 친구는 다음 지망으로 넘어가요` : "버튼을 누르면 1지망 결과부터 차례로 공개합니다"}
                </p>
              )}
              <div className={`grouping-present-grid count-${Math.min(info.groupNames.length, 10)}`}>
                {info.groupNames.map((name, index) => {
                  const round = currentRound?.groups[index];
                  return (
                    <article key={index}>
                      <h3>
                        {name}
                        {info.phase === "배정 공개" && round && currentRound?.label !== "남은 자리" && (
                          <small className={round.applicants > round.accepted.length ? "grouping-live-hot" : ""}>
                            지원 {round.applicants}명{round.applicants > round.accepted.length ? " · 추첨" : ""}
                          </small>
                        )}
                        <em>{groups[index].length}/{info.capacities[index]}</em>
                      </h3>
                      <ul>
                        {groups[index].map((key) => (
                          <li key={key} className={fresh.has(key) && info.phase === "배정 공개" ? "grouping-live-fresh" : ""}><b>{label(key)}</b></li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <footer className="grouping-live-controls">
            <SessionControls info={info} busy={busy} run={run} onImport={onImport} />
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
