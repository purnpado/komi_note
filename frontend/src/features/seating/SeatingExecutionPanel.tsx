import { SeatingAccessList } from "./SeatingAccessList";
import { main as models } from "../../../wailsjs/go/models";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import "./seating-execution.css";

type ExecutionAction = {
  label: string;
  action: () => void;
  disabled: boolean;
} | null;

export function SeatingExecutionPanel({
  drawMethod,
  seatingSession,
  sessionPhase,
  rosterCount,
  executionAction,
  canUseFixedSeats,
  onRecover,
  onRequestEnd,
  onOpenResult,
  onCopyAddress,
  onOpenBoard,
  onCloseSession,
  onRevealNames,
  onHideNames,
  students = [],
}: {
  drawMethod: string;
  seatingSession: models.SeatingSessionInfo | null;
  sessionPhase: string;
  rosterCount: number;
  executionAction: ExecutionAction;
  canUseFixedSeats: boolean;
  onRecover: (action: "재시도" | "건너뛰기") => void;
  onRequestEnd: () => void;
  onOpenResult: () => void;
  onCopyAddress: () => void;
  onOpenBoard: () => void;
  onCloseSession: () => void;
  onRevealNames: () => void;
  onHideNames: () => void;
  students?: models.Student[];
}) {
  const preferenceCompetition = seatingSession?.drawMethod === "희망 경쟁배정";
	const randomLadder = seatingSession?.drawMethod === "랜덤 사다리 배정" || drawMethod === "랜덤 사다리 배정";
  return (
    <section className="panel seating-participation">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">
			3단계 · {drawMethod === "희망 경쟁배정" ? "QR 희망 경쟁" : randomLadder ? "QR 랜덤 사다리" : "QR 랜덤 룰렛"}
          </p>
          <h3>자리배치 프로그램 실행</h3>
          <p>
            진행 상태는 회차 서버가 자동으로 관리합니다. 교사는 현재 단계의 다음 동작만 실행합니다.
          </p>
        </div>
        <span className="layout-badge">{sessionPhase}</span>
      </div>
      <SeatingProcess
		preferenceCompetition={preferenceCompetition}
		randomLadder={randomLadder}
        seatingSession={seatingSession}
        sessionPhase={sessionPhase}
      />
      <div className="execution-stage">
        <strong>{sessionPhase}</strong>
        <p>{seatingSession?.notice || "배치도를 저장한 뒤 QR 회차를 열어 주세요."}</p>
        {seatingSession?.phase === "오류" && (
          <div className="seating-recovery" role="alert">
            <strong>회차 오류 복구</strong>
            <p>
              {seatingSession.errorMessage ||
                "진행을 멈췄습니다. 보관함 상태를 확인한 뒤 복구 방식을 선택해 주세요."}
            </p>
            <div className="dialog-actions">
              <button className="primary-button" onClick={() => onRecover("재시도")}>
                저장 재시도
              </button>
              <button className="quiet-button" onClick={() => onRecover("건너뛰기")}>
                현재 학생 건너뛰기
              </button>
              <button className="danger-button" onClick={onRequestEnd}>
                회차 종료
              </button>
            </div>
            <small>
              건너뛴 학생은 배정되지 않은 상태로 남습니다. 회차 종료 뒤 QR 정보는 아래의 회차 닫기에서 폐기할 수 있습니다.
            </small>
          </div>
        )}
        {executionAction && (
          <button
            className="accent-button"
            onClick={executionAction.action}
            disabled={executionAction.disabled}
          >
            {executionAction.label}
          </button>
        )}
        {seatingSession?.phase === "순서 섞기" && (
		  <p className="execution-wait">학생 순서를 섞는 중입니다. 5초 뒤 {randomLadder ? "출발점 선택" : "룰렛 시작"} 단계가 열립니다.</p>
        )}
        {seatingSession?.phase === "사다리 출발점 선택" &&
          seatingSession.participantCnt > 0 &&
          seatingSession.ladderSelectedCnt >= seatingSession.participantCnt && (
            <p className="execution-ready" role="status">
              ✅ 모든 학생이 출발점을 골랐어요. 위의 <b>사다리 공개</b> 버튼을 눌러 주세요.
            </p>
          )}
        {seatingSession?.phase === "사다리 출발점 선택" &&
          seatingSession.ladderSelectedCnt < seatingSession.participantCnt && (
            <p className="execution-wait">
              출발점 선택 {seatingSession.ladderSelectedCnt} / {seatingSession.participantCnt}명 · 학생이 차례대로 고르고 있어요.
            </p>
          )}
        {["룰렛 시작 대기", "룰렛 대기", "룰렛 연출"].includes(sessionPhase) && (
          <p className="execution-wait">학생 기기에서 5초 안에 룰렛을 돌립니다. 미입력 시 자동으로 진행됩니다.</p>
        )}
        {["결과 확인", "최종 결과 확인"].includes(sessionPhase) && (
          <p className="execution-wait">당첨 자리와 닉네임을 전자칠판에 5초간 고정 표시합니다.</p>
        )}
        {["배정 완료", "자리 확인"].includes(seatingSession?.phase || "") && (
          <div className="seating-finish-actions">
            <p className="execution-ready" role="status">
              {seatingSession?.namesRevealed
                ? "✅ 전자칠판에 실명 배치도를 공개했어요."
                : "✅ 배정이 끝났어요. 전자칠판에는 아직 번호와 닉네임만 보입니다. 결과를 확인·조정한 뒤 실명을 공개하세요."}
            </p>
            <div className="dialog-actions">
              <button className="quiet-button" onClick={onOpenResult}>
                결과 확인·자리 바꾸기
              </button>
              {seatingSession?.namesRevealed ? (
                <button className="quiet-button" onClick={onHideNames}>실명 다시 가리기</button>
              ) : (
                <button className="primary-button" onClick={onRevealNames}>실명 배치도 공개</button>
              )}
            </div>
          </div>
        )}
        {preferenceCompetition && seatingSession?.phase === "경쟁률 공개" && (
          <p className="execution-wait">학생별 실명과 지망 순위는 공개하지 않습니다. 좌석별 게임 경쟁을 진행합니다.</p>
        )}
      </div>
      {seatingSession && (
        <div className="execution-session-info seating-session-summary">
          <div className="session-qr">
            <img src={seatingSession.qrCodeDataUrl} alt="학생 입장 QR 코드" width="160" height="160" />
          </div>
          <div className="session-address">
            <strong>학생 주소</strong>
            <code>{seatingSession.studentUrl}</code>
            <button className="quiet-button" onClick={onCopyAddress}>주소 복사</button>
            <p>
              참여 {seatingSession.participantCnt}명 / 재적 {rosterCount}명 · 1초마다 자동 갱신
              {seatingSession.phase === "입장 대기" && seatingSession.participantCnt < rosterCount && (
                <> · <b>아직 {rosterCount - seatingSession.participantCnt}명 미입장</b></>
              )}
              {seatingSession.partialClosed && <> · 결석·미참여 예외 마감</>}
            </p>
            <SeatingAccessList planId={seatingSession.planId} students={students} />
          </div>
          <div className="dialog-actions">
            {seatingSession.boardUrl && (
              <button className="quiet-button" onClick={onOpenBoard}>전자칠판 열기</button>
            )}
            <button className="quiet-button" onClick={onCloseSession}>회차 닫기</button>
          </div>
        </div>
      )}
      {seatingSession && <ClassroomNetworkNotice />}
      <div className="fixed-seat-rule">
        <strong>고정 자리 원칙</strong>
        <p>
          {canUseFixedSeats
            ? "이전 배치가 있어 필요한 학생만 교사가 최소 범위로 고정할 수 있습니다. 고정 사유는 공개 화면에 표시하지 않습니다."
            : "첫 배치에서는 고정 자리를 사용하지 않습니다. 첫 배치를 저장한 뒤 다음 배치부터 필요한 학생만 지정할 수 있습니다."}
        </p>
      </div>
    </section>
  );
}

function SeatingProcess({
  preferenceCompetition,
	randomLadder,
  seatingSession,
  sessionPhase,
}: {
  preferenceCompetition: boolean;
	randomLadder: boolean;
  seatingSession: models.SeatingSessionInfo | null;
  sessionPhase: string;
}) {
  if (preferenceCompetition) {
    const steps = ["QR 회차 열기", "학생 입장", "입장 마감", "희망 자리 제출", "지망 접수 마감", "경쟁률 공개", "자리별 경쟁"];
    const phases = ["", "입장 대기", "희망 자리 제출 준비", "희망 자리 제출", "경쟁률 공개", "경쟁률 공개", "자리별 경쟁"];
    const current = phases.indexOf(sessionPhase);
    return (
      <ol className="seating-process">
        {steps.map((step, index) => (
          <li key={step} className={index === current ? "active" : index < current ? "done" : ""}>
            {step}
          </li>
        ))}
      </ol>
    );
  }
	if (randomLadder) {
		const steps = ["QR 회차 열기", "학생 입장", "입장 마감", "순서 섞기", "출발점 선택", "사다리 공개", "학생별 사다리", "결과 확인"];
		const phases = ["", "입장 대기", "입장 마감", "순서 섞기", "사다리 출발점 선택", "사다리 공개", "사다리 연출", "배정 완료"];
		const current = phases.indexOf(sessionPhase);
		return <ol className="seating-process">{steps.map((step, index) => <li key={step} className={index === current ? "active" : index < current || (sessionPhase === "사다리 결과 확인" && index <= 6) ? "done" : ""}>{step}</li>)}</ol>;
	}
  const completedAfterEntry = ["순서 섞기", "룰렛 시작 준비", "룰렛 시작 대기", "룰렛 연출", "결과 확인", "최종 결과 확인", "배정 완료", "자리 확인"];
  const completedAfterShuffle = ["룰렛 시작 준비", "룰렛 시작 대기", "룰렛 연출", "결과 확인", "최종 결과 확인", "배정 완료", "자리 확인"];
  return (
    <ol className="seating-process">
      <li className={!seatingSession ? "active" : "done"}>QR 회차 열기</li>
      <li className={seatingSession?.phase === "입장 대기" ? "active" : seatingSession ? "done" : ""}>학생 입장</li>
      <li className={seatingSession?.phase === "입장 마감" ? "active" : completedAfterEntry.includes(sessionPhase) ? "done" : ""}>입장 마감</li>
      <li className={seatingSession?.phase === "순서 섞기" ? "active" : completedAfterShuffle.includes(sessionPhase) ? "done" : ""}>순서 섞기</li>
      <li className={["룰렛 시작 대기", "룰렛 대기", "룰렛 연출"].includes(sessionPhase) ? "active" : ["결과 확인", "최종 결과 확인", "배정 완료", "자리 확인"].includes(sessionPhase) ? "done" : ""}>학생 룰렛</li>
      <li className={["결과 확인", "최종 결과 확인"].includes(sessionPhase) ? "active" : ["배정 완료", "자리 확인"].includes(sessionPhase) ? "done" : ""}>결과 확인</li>
      <li className={sessionPhase === "자리 확인" ? "active" : ""}>자리 확인</li>
    </ol>
  );
}
