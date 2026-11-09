import { useEffect, useState } from "react";
import { GetGroupingSessionInfo, ResetGroupingStudent, StopGroupingSession } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import { errorMessage } from "../shared/format";
import { LeaderDialog, PotsDialog } from "./GroupSessionDialogs";
import { SessionControls, SessionBoard } from "./GroupSessionBoard";

export type SessionSource = { kind: "homeroom" | "course"; id: string; label: string };
export type Mode = "preference" | "draft" | "leaderPreference";
export type Run = (action: () => Promise<unknown>) => Promise<void>;

export const MODE_TEXT: Record<Mode, { label: string; detail: string }> = {
  preference: { label: "지망 배정", detail: "학생이 가고 싶은 모둠을 1~3지망까지 냅니다. 정원보다 많으면 추첨하고, 떨어지면 다음 지망으로 넘어갑니다." },
  draft: { label: "모둠장 투표 + 블라인드 지명", detail: "학생 투표(본인 추천 가능)로 모둠장 후보를 정해 선생님이 확정하고, 선생님이 나눈 포트에서 모둠장이 뱀 순서로 뒤집힌 카드를 뽑습니다. 카드 내용은 뒤집는 순간 정해집니다." },
  leaderPreference: { label: "모둠장 투표 + 지망 배정", detail: "모둠장을 정한 뒤, 나머지 학생은 모둠 이름·주제만 보고 지망합니다. 모둠장은 결과 발표 때 공개됩니다." },
};

export function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

// 공개된 라운드까지의 모둠별 학생 key와, 마지막으로 공개한 라운드에서 새로 들어온 학생.
export function revealedMembers(info: models.GroupSessionInfo) {
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
