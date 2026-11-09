import { useEffect, useMemo, useState } from "react";
import { mergeAssessmentEvent } from "./assessmentState";
import { takePageFocus } from "../shared/pageFocus";
import { criteriaMaxSum, invalidScore, missingCount, scoreValue, setReason, visibleCriteria } from "./assessmentScores";
import {
  AnswerAssessmentObjection,
  DeleteAssessment,
  DeleteAssessmentObjection,
  GetAssessmentReviewInfo,
  ListAssessments,
  OpenAssessmentBoard,
  PreviewAssessmentImport,
  PreviewCourseRoster,
  SaveAssessment,
  SaveAssessmentCriterionReason,
  SelectAssessmentImportFile,
  StartAssessmentReview,
  StopAssessmentReview,
  StartAssessmentAnswerReview,
  StopAssessmentAnswerReview,
  GetAssessmentAnswerReviewInfo,
  ResetAssessmentStudentAccess,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { errorMessage } from "../shared/format";
import { assessmentReviewActions } from "./assessmentReviewActions";

export type Props = { config: models.ClassConfig | null };
export type Session = models.AssessmentSessionInfo;
export const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** 평가 관리 화면의 상태·불러오기·저장·QR 회차 처리. 화면 JSX는 AssessmentPage와 구역 파일에 있다. */
export function useAssessmentPage(config: Props["config"]) {
  const [items, setItems] = useState<models.Assessment[]>([]);
  const [selected, setSelected] = useState<models.Assessment | null>(null);
  const [domainID, setDomainID] = useState("");
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<models.AssessmentImportPreview | null>(null);
  const [title, setTitle] = useState("");
  const [rosterPreview, setRosterPreview] = useState<models.CourseRosterPreview | null>(null);
  const [criterionOpen, setCriterionOpen] = useState(false);
  const [criterionName, setCriterionName] = useState("");
  const [criterionMax, setCriterionMax] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [answering, setAnswering] = useState<{ id: string; value: string } | null>(null);
  const [reasoning, setReasoning] = useState<{
    studentID: string;
    studentName: string;
    criterionID: string;
    criterionName: string;
    value: string;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingObjection, setDeletingObjection] = useState<{ id: string; studentName: string } | null>(null);
  const configSummary = useMemo(
    () =>
      `${config?.teachingSubject?.trim() || "담당 교과 미설정"} · ${config?.teachingClasses?.filter(Boolean).join(", ") || "수업 학반 미설정"}`,
    [config],
  );
  const activeDomain = selected?.domains.find((domain) => domain.id === domainID) || selected?.domains[0] || null;
  const classWarning =
    preview && config?.teachingClasses?.length && !config.teachingClasses.includes(preview.className)
      ? `환경설정 수업 학반(${config.teachingClasses.join(", ")})에는 파일 반(${preview.className})이 없지만, 파일에 든 해당 반 학생 명렬로 등록합니다.`
      : "";
  const load = async (keepID?: string) => {
    const next = await ListAssessments();
    setItems(next);
    setSelected(next.find((item) => item.id === (keepID || selected?.id)) || next[0] || null);
  };
  useEffect(() => {
    // 시간표·대시보드에서 반을 골라 들어오면 그 반의 가장 최근 평가를 먼저 연다.
    const focus = takePageFocus("평가 관리");
    if (!focus) {
      void load();
      return;
    }
    void ListAssessments().then((next) => {
      setItems(next);
      const matches = next.filter(
        (item) =>
          item.className === focus.className &&
          (!focus.grade || item.grade === focus.grade) &&
          (!focus.schoolYear || item.schoolYear === focus.schoolYear),
      );
      const latest = [...matches].sort((a, b) =>
        (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
      )[0];
      setSelected(latest || next[0] || null);
      if (!latest)
        setNotice(
          `${focus.grade ? `${focus.grade}학년 ` : ""}${focus.className}반의 저장된 평가가 없습니다. 나이스 파일을 가져와 주세요.`,
        );
    });
  }, []);
  useEffect(() => {
    let active = true;
    let requestID = 0;
    const reload = () => {
      const currentRequest = ++requestID;
      void ListAssessments()
        .then((next) => {
          if (!active || currentRequest !== requestID) return;
          setItems(next);
          setSelected((current) => {
            if (!current) return next[0] || null;
            const fresh = next.find((item) => item.id === current.id);
            if (!fresh) return null;
            return new models.Assessment(mergeAssessmentEvent(current, fresh));
          });
        })
        .catch((error) => {
          if (active && currentRequest === requestID) setNotice(errorMessage(error));
        });
    };
    const off = [
      "평가가져옴",
      "점수변경",
      "공개시작",
      "학생인증",
      "확인완료",
      "이의제출",
      "답변등록",
      "이의삭제",
      "세션종료",
      "답변공개시작",
      "답변확인완료",
      "답변공개종료",
      "접속초기화",
      "학생추가",
    ].map((event) => EventsOn(`assessment:${event}`, reload));
    return () => {
      active = false;
      off.forEach((remove) => remove());
    };
  }, []);
  useEffect(() => {
    if (selected && !selected.domains.some((domain) => domain.id === domainID))
      setDomainID(selected.domains[0]?.id || "");
  }, [selected?.id, selected?.domains.length, domainID]);
  useEffect(() => {
    if (!qrOpen || !selected || !domainID) return;
    const getInfo = session?.mode === "answer" ? GetAssessmentAnswerReviewInfo : GetAssessmentReviewInfo;
    const timer = window.setInterval(
      () =>
        void getInfo(selected.id, domainID)
          .then(setSession)
          .catch(() => undefined),
      1200,
    );
    return () => window.clearInterval(timer);
  }, [qrOpen, selected?.id, domainID, session?.mode]);
  useEffect(() => {
    if (!importOpen || !preview) return;
    let active = true;
    setRosterPreview(null);
    void PreviewCourseRoster(preview.assessment)
      .then((result) => {
        if (active) setRosterPreview(result);
      })
      .catch((error) => {
        if (active) setNotice(errorMessage(error));
      });
    return () => {
      active = false;
    };
  }, [
    importOpen,
    preview?.fileName,
    preview?.assessment.schoolYear,
    preview?.assessment.grade,
    preview?.assessment.className,
  ]);

  const chooseImport = async () => {
    try {
      const path = await SelectAssessmentImportFile();
      if (!path) return;
      const next = await PreviewAssessmentImport(path);
      if (!next.assessment.schoolYear && config?.schoolYear) next.assessment.schoolYear = config.schoolYear;
      setPreview(next);
      setTitle(`${next.subject} · ${next.className} 수행평가`);
      setImportOpen(true);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };
  const saveImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const item = copy(preview.assessment);
      item.title = title.trim();
      if (config?.teachingSubject && item.subject !== config.teachingSubject)
        throw new Error(`환경설정 담당 교과(${config.teachingSubject})와 파일 과목(${item.subject})이 다릅니다.`);
      const roster = await PreviewCourseRoster(item);
      if (JSON.stringify(roster) !== JSON.stringify(rosterPreview)) {
        setRosterPreview(roster);
        setNotice("수업 명렬 비교 결과가 바뀌었습니다. 가져오기 화면에서 다시 확인해 주세요.");
        return;
      }
      const saved = await SaveAssessment(item);
      await load(saved.id);
      setImportOpen(false);
      setPreview(null);
      setNotice(
        roster.status === "차이" || roster.status === "보류"
          ? `평가는 등록했습니다. ${roster.message}`
          : "평가와 수업 명렬을 등록했습니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const savedVersion = selected ? items.find((item) => item.id === selected.id) : undefined;
  const unsaved = Boolean(selected && savedVersion && JSON.stringify(selected) !== JSON.stringify(savedVersion));
  const save = async () => {
    if (!selected) return;
    const problem = invalidScore(selected);
    if (problem) {
      setNotice(`저장하지 못했습니다. ${problem}`);
      return;
    }
    setBusy(true);
    try {
      const saved = await SaveAssessment(selected);
      await load(saved.id);
      setNotice(`${activeDomain?.name || "선택한 영역"} 점수를 저장했습니다.`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const saveReason = async () => {
    if (!selected || !activeDomain || !reasoning) return;
    const pendingReason = reasoning;
    setBusy(true);
    try {
      const saved = await SaveAssessmentCriterionReason(
        selected.id,
        pendingReason.studentID,
        activeDomain.id,
        pendingReason.criterionID,
        pendingReason.value,
      );
      setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setSelected((current) =>
        current
          ? setReason(current, pendingReason.studentID, activeDomain.id, pendingReason.criterionID, pendingReason.value)
          : saved,
      );
      setReasoning(null);
      setNotice("채점 사유를 암호화 보관함에 저장했습니다. 학생 QR 확인 화면에 반영됩니다.");
    } catch (error) {
      setNotice(`채점 사유를 저장하지 못했습니다: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const addCriterion = () => {
    if (!selected || !activeDomain || !criterionName.trim()) return;
    const max = Number(criterionMax);
    if (!Number.isFinite(max) || max <= 0) {
      setNotice("세부 기준 만점을 0점보다 큰 숫자로 입력해 주세요.");
      return;
    }
    if (criteriaMaxSum(activeDomain) + max > activeDomain.maxScore) {
      setNotice(
        `세부 기준 만점 합계(${criteriaMaxSum(activeDomain) + max}점)가 영역 만점(${activeDomain.maxScore}점)을 넘습니다. 만점을 줄여 주세요.`,
      );
      return;
    }
    const next = copy(selected);
    next.domains
      .find((domain) => domain.id === activeDomain.id)
      ?.criteria.push({
        id: `criterion-${crypto.randomUUID()}`,
        name: criterionName.trim(),
        maxScore: max,
        note: "",
      } as models.AssessmentCriterion);
    setSelected(next);
    setCriterionOpen(false);
    setCriterionName("");
    setCriterionMax("");
    setNotice(`${activeDomain.name} 영역에 세부 기준을 추가했습니다.`);
  };
  const {
    resetAccess,
    startQR,
    startAnswerQR,
    openBoard,
    stopReview,
    stopAnswerReview,
    answer,
    removeObjection,
    remove,
  } = assessmentReviewActions({
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
  });
  const criteria = activeDomain ? visibleCriteria(activeDomain) : [];
  const missing =
    activeDomain && selected
      ? missingCount(
          selected.students,
          activeDomain.id,
          criteria.map((criterion) => criterion.id),
          (studentID, criterionID) => scoreValue(selected, studentID, activeDomain.id, criterionID) !== undefined,
        )
      : 0;
  const pending = selected?.objections.filter((item) => item.status !== "답변 완료").length || 0;

  return {
    items,
    setItems,
    selected,
    setSelected,
    domainID,
    setDomainID,
    addStudentOpen,
    setAddStudentOpen,
    notice,
    setNotice,
    busy,
    setBusy,
    importOpen,
    setImportOpen,
    preview,
    setPreview,
    title,
    setTitle,
    rosterPreview,
    setRosterPreview,
    criterionOpen,
    setCriterionOpen,
    criterionName,
    setCriterionName,
    criterionMax,
    setCriterionMax,
    qrOpen,
    setQrOpen,
    session,
    setSession,
    answering,
    setAnswering,
    reasoning,
    setReasoning,
    deleteOpen,
    setDeleteOpen,
    deletingObjection,
    setDeletingObjection,
    configSummary,
    activeDomain,
    classWarning,
    load,
    chooseImport,
    saveImport,
    savedVersion,
    unsaved,
    save,
    saveReason,
    addCriterion,
    resetAccess,
    startQR,
    startAnswerQR,
    openBoard,
    stopReview,
    stopAnswerReview,
    answer,
    removeObjection,
    remove,
    criteria,
    missing,
    pending,
  };
}

export type AssessmentView = ReturnType<typeof useAssessmentPage>;
