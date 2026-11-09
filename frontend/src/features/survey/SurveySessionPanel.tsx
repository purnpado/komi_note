import { useState } from "react";
import { GetSurveySessionInfo, ResetSurveyStudentAccess, SetSurveyResultsPublic, StartSurveyQuestions, StartSurveySession, StopSurveySession } from "../../../wailsjs/go/main/App";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import { HelpTip } from "../shared/HelpTip";
import { copyText, openExternalURL } from "../shared/desktopActions";
import { errorMessage } from "../shared/format";
import { SurveyResults } from "./SurveyResults";
import type { SurveyItem, SurveySession } from "./surveyTypes";

type Props = {
  survey: SurveyItem;
  session: SurveySession | null;
  setSession: (session: SurveySession | null) => void;
  reload: () => Promise<void>;
  onNotice: (message: string) => void;
  nameByStudentID: Map<string, string>;
  formatRecordedAt: (value: string) => string;
};

export function SurveySessionPanel({ survey, session, setSession, reload, onNotice, nameByStudentID, formatRecordedAt }: Props) {
  const [busy, setBusy] = useState(false);
  const staff = survey.audience === "교직원";

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      setBusy(true);
      await action();
      setSession((await GetSurveySessionInfo(survey.id)) as unknown as SurveySession);
      await reload();
      onNotice(message);
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const live = session?.running;
  const showResults = session?.closed || (!live && survey.status === "마감");
  const expected = session?.expectedParticipants || survey.expectedParticipants || 0;
  const participants = session?.participants || [];
  const waiting = participants.filter((p) => !p.responded);

  return (
    <>
      {!live ? (
        <div className="survey-stage-card">
          <h4>{survey.status === "마감" ? "마감된 설문입니다" : "참여방을 열 준비가 되었습니다"}</h4>
          <p>{survey.status === "마감" ? "아래에서 결과를 확인하세요. 참여방을 다시 열면 아직 답하지 않은 사람이 이어서 답할 수 있습니다." : staff ? "참여방을 열면 주소를 학교 메신저로 보내 의견을 받습니다." : "참여방을 열면 학생은 QR로 번호와 이름을 넣고 설문 시작을 기다립니다."}</p>
          <button className="primary-button" disabled={busy} onClick={() => run(() => StartSurveySession(survey.id), "참여방을 열었습니다. 전자칠판 화면에서 QR과 참여 인원을 보여 주세요.")}>
            {busy ? "참여방 준비 중…" : survey.status === "마감" ? "참여방 다시 열기" : "참여방 열기"}
          </button>
        </div>
      ) : (
        <>
          <div className="survey-live-panel">
            <div>
              <p className="eyebrow">교실 참여방</p>
              <h4>{session.closed ? "설문 마감" : session.started ? "설문 진행 중" : "참여 확인 대기"}</h4>
              <p>{session.notice}</p>
              <label>참여 주소
                <input readOnly value={session.studentUrl} onFocus={(event) => event.currentTarget.select()} />
              </label>
              <div className="survey-action-bar">
                <button className="outline-button copy-button" onClick={() => copyText(session.studentUrl).then(() => onNotice("참여 주소를 복사했습니다.")).catch(() => onNotice("주소 복사에 실패했습니다. 주소를 직접 선택해 복사해 주세요."))}>▣ 주소 복사</button>
                <button className="primary-button board-button" onClick={() => void openExternalURL(session.boardUrl).catch(() => onNotice(`전자칠판 화면을 열지 못했습니다. 브라우저에 직접 입력해 주세요: ${session.boardUrl}`))}>▣ 전자칠판 화면</button>
                {!session.started && !session.closed && <button className="start-button" disabled={busy} onClick={() => run(() => StartSurveyQuestions(survey.id), "설문을 시작했습니다. 참여 확인을 마친 화면에 문항이 열립니다.")}>▶ 설문 시작</button>}
                {!session.closed && <button className="danger-button close-button" disabled={busy} onClick={() => run(() => StopSurveySession(survey.id), "설문을 마감했습니다. 아래에서 결과를 확인하세요.")}>■ 설문 마감</button>}
                {session.closed && (
                  <>
                    <button className={session.publicResults ? "outline-button" : "start-button"} disabled={busy} onClick={() => run(() => SetSurveyResultsPublic(survey.id, !session.publicResults), session.publicResults ? "전자칠판 결과 공개를 멈췄습니다." : "전자칠판에 이름 없는 집계를 공개했습니다. 글로 쓴 답은 공개하지 않습니다.")}>
                      {session.publicResults ? "결과 공개 멈추기" : "전자칠판에 결과 공개"}
                    </button>
                    <button className="quiet-button" disabled={busy} onClick={() => run(() => StopSurveySession(survey.id), "참여방을 닫았습니다.")}>참여방 닫기</button>
                  </>
                )}
              </div>
              <p className="survey-live-count">
                참여 확인 <b>{session.participantCnt}</b>명{expected > 0 && <> / 대상 <b>{expected}</b>명</>} · 응답 <b>{session.responseCnt}</b>명
              </p>
            </div>
            {session.qrCodeDataUrl && <img className="survey-qr" src={session.qrCodeDataUrl} alt="설문 참여 QR 코드" />}
          </div>
          <ClassroomNetworkNotice />
          {!staff && participants.length > 0 && !session.closed && (
            <details className="survey-participants">
              <summary>학생별 참여 현황 · 아직 응답 안 함 {waiting.length}명 <HelpTip>다른 기기에서 잘못 들어왔거나 휴대폰을 바꿔야 할 때 ‘접속 초기화’를 누르면 그 학생이 다시 들어올 수 있습니다. 이미 낸 응답은 지워지지 않습니다.</HelpTip></summary>
              <ul>
                {participants.map((p) => (
                  <li key={p.id} className={p.responded ? "done" : p.joined ? "joined" : ""}>
                    <span>{p.number}번 {p.name}</span>
                    <em>{p.responded ? "응답함" : p.joined ? "참여 중" : "아직"}</em>
                    {p.joined && !p.responded && (
                      <button className="text-button" disabled={busy} onClick={() => run(() => ResetSurveyStudentAccess(survey.id, p.id), `${p.number}번 ${p.name} 학생의 접속을 초기화했습니다.`)}>접속 초기화</button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {showResults && <SurveyResults survey={survey} nameByStudentID={nameByStudentID} formatRecordedAt={formatRecordedAt} />}
    </>
  );
}
