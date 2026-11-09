import { useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CloseGroupingPreferences, CloseGroupingVote, ExtendGroupingDeadline, GroupingDraftPick, OpenGroupingPreferences, OpenGroupingVote, RevealGroupingNames, RevealGroupingNextRound } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { Run, clock, revealedMembers } from "./GroupSessionPanel";

export function SessionControls({ info, busy, run, onImport, onTeacherOnly }: { info: models.GroupSessionInfo; busy: boolean; run: Run; onImport: () => void; onTeacherOnly: (which: "leader" | "pots") => void }) {
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
export function SessionBoard({ open, onOpenChange, info, busy, run, onImport, onTeacherOnly }: { open: boolean; onOpenChange: (open: boolean) => void; info: models.GroupSessionInfo; busy: boolean; run: Run; onImport: () => void; onTeacherOnly: (which: "leader" | "pots") => void }) {
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
