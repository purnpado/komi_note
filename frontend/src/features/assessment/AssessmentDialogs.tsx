import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import { GradeSelect } from "./AssessmentList";
import * as Dialog from "@radix-ui/react-dialog";
import { main as models } from "../../../wailsjs/go/models";
import type { AssessmentView } from "./useAssessmentPage";
import { AssessmentDialogHeader } from "./AssessmentParts";

/** 나이스 파일 가져오기·세부 기준 추가·학생 QR 창. */
export function AssessmentDialogs({ view }: { view: AssessmentView }) {
  const {
    notice,
    busy,
    importOpen,
    setImportOpen,
    preview,
    setPreview,
    title,
    setTitle,
    rosterPreview,
    criterionOpen,
    setCriterionOpen,
    criterionName,
    setCriterionName,
    criterionMax,
    setCriterionMax,
    qrOpen,
    setQrOpen,
    session,
    activeDomain,
    classWarning,
    saveImport,
    addCriterion,
    resetAccess,
    openBoard,
    stopReview,
    stopAnswerReview,
    answer,
  } = view;
  return (
    <>
      <Dialog.Root open={importOpen} onOpenChange={setImportOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <Dialog.Content className="dialog-content assessment-dialog assessment-import-dialog">
            <AssessmentDialogHeader
              title="나이스 수행평가 파일 확인"
              description="파일 내용과 등록될 수업 정보를 확인한 뒤 가져오세요."
            />
            {preview && (
              <>
                <div className="assessment-import-summary">
                  <span>파일</span>
                  <strong title={preview.fileName}>{preview.fileName}</strong>
                  <dl>
                    <div>
                      <dt>수업</dt>
                      <dd>
                        {preview.subject} · {preview.className}
                      </dd>
                    </div>
                    <div>
                      <dt>학생</dt>
                      <dd>{preview.assessment.students.length}명</dd>
                    </div>
                    <div>
                      <dt>평가 영역</dt>
                      <dd>{preview.assessment.domains.length}개</dd>
                    </div>
                  </dl>
                </div>
                {classWarning && <p className="assessment-dialog-notice">{classWarning}</p>}
                {(preview.warnings || []).map((warning) => (
                  <p key={warning} className="assessment-dialog-notice">
                    {warning}
                  </p>
                ))}
                <p className="assessment-privacy-note">
                  파일명:{" "}
                  {preview.assessment.schoolYear
                    ? `${preview.assessment.schoolYear}학년도 ${preview.assessment.semester}학기 · ${preview.assessment.classroom}`
                    : "학년 정보를 인식하지 못했습니다. 직접 선택해 주세요."}
                </p>
                {preview.filenameSubject && preview.filenameSubject !== preview.subject && (
                  <p className="assessment-dialog-notice">
                    파일명 과목({preview.filenameSubject})과 엑셀 과목({preview.subject})이 다릅니다. 엑셀 과목을
                    사용합니다.
                  </p>
                )}
                <label className="assessment-field">
                  학년도
                  <input
                    inputMode="numeric"
                    value={preview.assessment.schoolYear || ""}
                    onChange={(event) =>
                      setPreview(
                        new models.AssessmentImportPreview({
                          ...preview,
                          assessment: new models.Assessment({ ...preview.assessment, schoolYear: event.target.value }),
                        }),
                      )
                    }
                    placeholder="예: 2026"
                  />
                </label>
                <GradeSelect
                  value={preview.assessment.grade || ""}
                  onChange={(grade) =>
                    setPreview(
                      new models.AssessmentImportPreview({
                        ...preview,
                        assessment: new models.Assessment({ ...preview.assessment, grade }),
                      }),
                    )
                  }
                />
                {rosterPreview ? (
                  <div className="assessment-dialog-notice">
                    <strong>수업 명렬: {rosterPreview.status}</strong>
                    <p>{rosterPreview.message}</p>
                    {rosterPreview.added?.length > 0 && <p>파일에만 있는 학생: {rosterPreview.added.join(", ")}</p>}
                    {rosterPreview.missing?.length > 0 && (
                      <p>기존 명렬에만 있는 학생: {rosterPreview.missing.join(", ")}</p>
                    )}
                  </div>
                ) : (
                  <p>수업 명렬을 확인하고 있습니다.</p>
                )}
                <label className="assessment-field">
                  평가 이름
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <p className="assessment-privacy-note">
                  원본 엑셀은 저장하지 않으며, 필요한 최소 명렬과 점수만 암호화 보관합니다.
                </p>
              </>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="quiet-button">취소</button>
              </Dialog.Close>
              <button className="primary-button" disabled={busy || !rosterPreview} onClick={() => void saveImport()}>
                이 반 수행평가 등록
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={criterionOpen} onOpenChange={setCriterionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <Dialog.Content className="dialog-content assessment-dialog assessment-small-dialog">
            <AssessmentDialogHeader
              title={`${activeDomain?.name || "평가 영역"} 세부 기준 추가`}
              description="나이스 영역 점수는 자동으로 나누지 않습니다. 새 기준 점수는 교사가 직접 입력합니다."
            />
            <div className="assessment-field-grid">
              <label className="assessment-field">
                세부 기준 이름
                <input
                  value={criterionName}
                  onChange={(event) => setCriterionName(event.target.value)}
                  placeholder="예: 자료 조사"
                />
              </label>
              <label className="assessment-field">
                만점
                <input
                  inputMode="decimal"
                  value={criterionMax}
                  onChange={(event) => setCriterionMax(event.target.value)}
                  placeholder="예: 20"
                />
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="quiet-button">취소</button>
              </Dialog.Close>
              <button className="primary-button" onClick={addCriterion}>
                기준 추가
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={qrOpen} onOpenChange={setQrOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay assessment-dialog-overlay" />
          <Dialog.Content className="dialog-content assessment-dialog assessment-qr-dialog">
            <AssessmentDialogHeader
              title={`${session?.domainName || activeDomain?.name || "선택 영역"} ${session?.mode === "answer" ? "이의 답변 재확인" : "학생 점수 확인"} QR`}
              description={
                session?.mode === "answer"
                  ? "학생은 본인의 이의 내용과 교사 답변만 확인합니다."
                  : "전자칠판에는 QR과 접속 현황만 표시되며, 학생 점수와 이의 내용은 공개되지 않습니다."
              }
            />
            {session?.running ? (
              <>
                <img className="assessment-qr" src={session.qrCodeDataUrl} alt="학생 확인 QR 코드" />
                <p className="assessment-url">{session.studentUrl}</p>
                <ClassroomNetworkNotice sensitive />
                <div className="assessment-session-stats">
                  <span>
                    인증 <b>{session.verifiedCount}명</b>
                  </span>
                  <span>
                    확인 완료 <b>{session.completedCount}명</b>
                  </span>
                  <span>
                    {session.mode === "answer" ? "답변 QR" : "답변 대기"}
                    <b>{session.mode === "answer" ? "공개 중" : `${session.objectionCount}건`}</b>
                  </span>
                </div>
                {(session.participants || []).length > 0 && (
                  <div className="assessment-participants">
                    <strong>접속한 학생</strong>
                    <p>
                      다른 학생이 대신 들어왔거나 기기를 바꿔야 하면 [접속 초기화]를 눌러 본인이 다시 들어오게 하세요.
                    </p>
                    <ul>
                      {(session.participants || []).map((participant) => (
                        <li key={participant.studentId}>
                          <span>
                            {participant.number}번 {participant.name}
                          </span>
                          <em>{participant.status}</em>
                          <button className="quiet-button" onClick={() => void resetAccess(participant.studentId)}>
                            접속 초기화
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="assessment-qr-actions">
                  {session.mode !== "answer" && (
                    <button className="quiet-button" onClick={() => void openBoard()}>
                      전자칠판 열기
                    </button>
                  )}
                  <button
                    className="danger-button"
                    onClick={() => void (session.mode === "answer" ? stopAnswerReview() : stopReview())}
                  >
                    {session.mode === "answer" ? "답변 QR 닫기" : "이 영역 QR 닫기"}
                  </button>
                </div>
              </>
            ) : (
              <p className="empty-note">이 영역의 확인 QR이 열려 있지 않습니다.</p>
            )}
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <button className="quiet-button">닫기</button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
