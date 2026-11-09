import type { Dispatch, SetStateAction } from "react";
import {
  ResetAssessmentStudentAccess,
  StartAssessmentReview,
  StartAssessmentAnswerReview,
  OpenAssessmentBoard,
  StopAssessmentReview,
  GetAssessmentReviewInfo,
  StopAssessmentAnswerReview,
  GetAssessmentAnswerReviewInfo,
  AnswerAssessmentObjection,
  DeleteAssessmentObjection,
  DeleteAssessment,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";

type Setter<T> = Dispatch<SetStateAction<T>>;

/** 수행평가 QR 회차(학생 확인·답변 재확인·전자칠판)와 이의 답변·삭제, 평가 삭제 처리. 상태는 useAssessmentPage가 가진다. */
export function assessmentReviewActions({
  selected,
  activeDomain,
  session,
  unsaved,
  answering,
  deletingObjection,
  load,
  setSession,
  setNotice,
  setQrOpen,
  setAnswering,
  setDeletingObjection,
  setDeleteOpen,
}: {
  selected: models.Assessment | null;
  activeDomain: models.AssessmentDomain | null | undefined;
  session: models.AssessmentSessionInfo | null;
  unsaved: boolean;
  answering: { id: string; value: string } | null;
  deletingObjection: { id: string; studentName: string } | null;
  load: (keepID?: string) => Promise<unknown>;
  setSession: Setter<models.AssessmentSessionInfo | null>;
  setNotice: Setter<string>;
  setQrOpen: Setter<boolean>;
  setAnswering: Setter<{ id: string; value: string } | null>;
  setDeletingObjection: Setter<{ id: string; studentName: string } | null>;
  setDeleteOpen: Setter<boolean>;
}) {
  const resetAccess = async (studentID: string) => {
    if (!selected || !session) return;
    try {
      setSession(await ResetAssessmentStudentAccess(selected.id, session.domainId, session.mode, studentID));
      setNotice("학생 접속을 초기화했습니다. 본인이 다시 번호와 이름을 입력하면 됩니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const startQR = async () => {
    if (!selected || !activeDomain) return;
    if (unsaved) {
      setNotice("저장하지 않은 세부 기준·점수가 있습니다. 학생 화면에 보이도록 먼저 [점수 저장]을 눌러 주세요.");
      return;
    }
    try {
      setSession(await StartAssessmentReview(selected.id, activeDomain.id));
      setQrOpen(true);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const startAnswerQR = async () => {
    if (!selected || !activeDomain) return;
    if (unsaved) {
      setNotice("저장하지 않은 세부 기준·점수가 있습니다. 먼저 [점수 저장]을 눌러 주세요.");
      return;
    }
    const answered = selected.objections.filter(
      (item) => item.status === "답변 완료" && (!item.domainId || item.domainId === activeDomain.id),
    ).length;
    if (!answered) {
      setNotice("이 영역에 답변 완료된 이의가 있어야 답변 재확인 QR을 열 수 있습니다.");
      return;
    }
    try {
      setSession(await StartAssessmentAnswerReview(selected.id, activeDomain.id));
      setQrOpen(true);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const openBoard = async () => {
    if (!selected || !activeDomain) return;
    try {
      setSession(await OpenAssessmentBoard(selected.id, activeDomain.id));
      setQrOpen(true);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const stopReview = async () => {
    if (!selected || !activeDomain) return;
    try {
      await StopAssessmentReview(selected.id, activeDomain.id);
      setSession(await GetAssessmentReviewInfo(selected.id, activeDomain.id));
      setNotice("선택한 영역의 QR 회차를 닫았습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const stopAnswerReview = async () => {
    if (!selected || !activeDomain) return;
    try {
      await StopAssessmentAnswerReview(selected.id, activeDomain.id);
      setSession(await GetAssessmentAnswerReviewInfo(selected.id, activeDomain.id));
      setNotice("답변 재확인 QR 회차를 닫았습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const answer = async () => {
    if (!selected || !answering) return;
    try {
      const saved = await AnswerAssessmentObjection(selected.id, answering.id, answering.value);
      await load(saved.id);
      setAnswering(null);
      setNotice("이의 답변을 암호화 보관함에 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const removeObjection = async () => {
    if (!selected || !deletingObjection) return;
    try {
      const saved = await DeleteAssessmentObjection(selected.id, deletingObjection.id);
      await load(saved.id);
      setDeletingObjection(null);
      setNotice("답변 완료 이의의 내용과 답변을 삭제했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const remove = async () => {
    if (!selected) return;
    try {
      await DeleteAssessment(selected.id, "수행평가 삭제");
      await load();
      setDeleteOpen(false);
      setNotice("수행평가와 연결된 최소 명렬·점수·이의 기록을 삭제했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  return {
    resetAccess,
    startQR,
    startAnswerQR,
    openBoard,
    stopReview,
    stopAnswerReview,
    answer,
    removeObjection,
    remove,
  };
}
