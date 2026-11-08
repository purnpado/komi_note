import { FormEvent, useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  DeleteSurvey, GetSurveySessionInfo, ListStudents, ListSurveys, SaveSurvey,
  SetSurveyResultsPublic, StartSurveyQuestions, StartSurveySession, StopSurveySession,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { ClassroomNetworkNotice } from "../shared/ClassroomNetworkNotice";
import "./survey.css";

type SurveyHubPageProps = {
  formatRecordedAt: (value: string) => string;
};

type LocalSurvey = {
  id: string;
  title: string;
  anonymous: boolean;
  status: string;
  audience?: "학생" | "교직원";
  staffIdentityMode?: "익명" | "이름 입력";
  questions: { id: string; text: string; type?: string; options: string[] }[];
  responses: { studentId: string; respondentName?: string; answers: Record<string, string>; multiAnswers?: Record<string, string[]>; submittedAt: string }[];
};
type LocalSurveySession = {
  surveyId: string; title: string; running: boolean; studentUrl: string; shortCode?: string; boardUrl: string; qrCodeDataUrl: string; participantCnt: number; responseCnt: number; notice: string; publicResults?: boolean;
};
export function SurveyHubPage({ formatRecordedAt }: SurveyHubPageProps) {
  const [scope, setScope] = useState<"담임용" | "수업용" | "업무용">("담임용");
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">업무용 · 설문 통합 관리</p>
          <h2>설문 조사</h2>
          <p>
            담임용·수업용·업무용 설문을 한곳에서 만들고 참여 주소와 결과를
            관리합니다.
          </p>
        </div>
      </section>
      <div
        className="survey-scope-tabs"
        role="tablist"
        aria-label="설문 대상 구분"
      >
        {(["담임용", "수업용", "업무용"] as const).map((item) => (
          <button
            key={item}
            className={scope === item ? "active" : ""}
            onClick={() => setScope(item)}
          >
            {item} 설문
          </button>
        ))}
      </div>
      <SurveyPanelV2
        fixedAudience={scope === "업무용" ? "교직원" : "학생"}
        scope={scope}
        formatRecordedAt={formatRecordedAt}
      />
    </>
  );
}
function SurveyPanelV2({
  fixedAudience = "학생",
  scope = fixedAudience === "교직원" ? "업무용" : "수업용",
  formatRecordedAt,
}: {
  fixedAudience?: "학생" | "교직원";
  scope?: "담임용" | "수업용" | "업무용";
  formatRecordedAt: (value: string) => string;
}) {
  type SurveyItem = LocalSurvey & {
    expectedParticipants?: number;
    audience?: "학생" | "교직원";
    scope?: "담임용" | "수업용" | "업무용";
    staffIdentityMode?: "익명" | "이름 입력";
  };
  type Session = LocalSurveySession & {
    started?: boolean;
    closed?: boolean;
    expectedParticipants?: number;
  };
  const [view, setView] = useState<"목록" | "작성" | "진행·결과">("목록");
  const [items, setItems] = useState<SurveyItem[]>([]);
  const [students, setStudents] = useState<models.Student[]>([]);
  const [selected, setSelected] = useState<SurveyItem | null>(null);
  const [editing, setEditing] = useState<SurveyItem | null>(null);
  const [title, setTitle] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [expected, setExpected] = useState(0);
  const [audience, setAudience] = useState<"학생" | "교직원">(fixedAudience);
  const [staffIdentityMode, setStaffIdentityMode] = useState<
    "익명" | "이름 입력"
  >("익명");
  const [questions, setQuestions] = useState(
    "가장 기대하는 활동은? | 체험 활동 | 모둠 활동 | 진로 탐색",
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SurveyItem | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const reload = async () => {
    try {
      const [surveyItems, studentItems] = await Promise.all([
        ListSurveys(),
        ListStudents(),
      ]);
      const next = ((surveyItems || []) as unknown as SurveyItem[]).filter(
        (item) =>
          (item.audience || "학생") === fixedAudience &&
          (item.scope || "수업용") === scope,
      );
      setItems(next);
      setStudents(studentItems || []);
      setSelected((current) =>
        current ? next.find((item) => item.id === current.id) || null : null,
      );
    } catch (error) {
      setNotice(String(error));
    }
  };
  useEffect(() => {
    setSelected(null);
    setSession(null);
    setView("목록");
    void reload();
  }, [fixedAudience, scope]);
  useEffect(() => {
    if (!selected?.id || !session?.running || session.closed) return;
    const timer = window.setInterval(() => {
      GetSurveySessionInfo(selected.id)
        .then((value) => setSession(value as unknown as Session))
        .catch(() => undefined);
      void reload();
    }, 1800);
    return () => window.clearInterval(timer);
  }, [selected?.id, session?.running, session?.closed]);
  const parseQuestions = () =>
    questions
      .split("\n")
      .map((line) =>
        line
          .split("|")
          .map((part) => part.trim())
          .filter(Boolean),
      )
      .map((parts) => {
        const matched = parts[0]?.match(
          /^\[(단일 선택|복수 선택|단답|서술|5점 척도)\]\s*(.*)$/,
        );
        const type = matched?.[1] || "단일 선택";
        const text = matched ? matched[2] : parts[0];
        const options =
          type === "5점 척도" && parts.length === 1
            ? [
                "1점 매우 아쉬움",
                "2점 아쉬움",
                "3점 보통",
                "4점 만족",
                "5점 매우 만족",
              ]
            : parts.slice(1);
        return { text, type, options };
      })
      .filter(
        (question) =>
          question.text &&
          (question.type === "단답" ||
            question.type === "서술" ||
            question.options.length >= 2),
      );
  function resetEditor() {
    setEditing(null);
    setTitle("");
    setAnonymous(true);
    setExpected(0);
    setAudience(fixedAudience);
    setStaffIdentityMode("익명");
    setQuestions(
      "[단일 선택] 가장 기대하는 활동은? | 체험 활동 | 모둠 활동 | 진로 탐색",
    );
  }
  function openEditor(item?: SurveyItem) {
    if (item) {
      setEditing(item);
      setTitle(item.title);
      setAnonymous(item.anonymous);
      setExpected(item.expectedParticipants || 0);
      setAudience(fixedAudience);
      setStaffIdentityMode(item.staffIdentityMode || "익명");
      setQuestions(
        item.questions
          .map((question) =>
            [
              `[${question.type || "단일 선택"}] ${question.text}`,
              ...question.options,
            ].join(" | "),
          )
          .join("\n"),
      );
    } else resetEditor();
    setView("작성");
    setNotice("");
  }
  async function choose(item: SurveyItem) {
    setSelected(item);
    setSession(null);
    setView("진행·결과");
    try {
      setSession((await GetSurveySessionInfo(item.id)) as unknown as Session);
    } catch {
      /* 아직 열지 않은 설문 */
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuestions();
    if (!title.trim() || parsed.length === 0) {
      setNotice(
        "설문 제목과 ‘질문 | 선택지1 | 선택지2’ 형식의 문항을 입력해 주세요.",
      );
      return;
    }
    try {
      setBusy(true);
      const saved = await SaveSurvey(
        new models.Survey({
          ...(editing || {}),
          title,
          scope,
          audience,
          staffIdentityMode: audience === "교직원" ? staffIdentityMode : "",
          anonymous,
          expectedParticipants: expected,
          questions: parsed,
        }),
      );
      await reload();
      await choose(saved as unknown as SurveyItem);
      setNotice(editing ? "설문을 수정했습니다." : "설문을 저장했습니다.");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function openRoom() {
    if (!selected) return;
    try {
      setBusy(true);
      setSession((await StartSurveySession(selected.id)) as unknown as Session);
      await reload();
      setNotice(
        "참여방을 열었습니다. 전자칠판 공개 화면에서 QR과 입장 인원을 보여 주세요.",
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function startQuestions() {
    if (!selected) return;
    try {
      setBusy(true);
      setSession(
        (await StartSurveyQuestions(selected.id)) as unknown as Session,
      );
      await reload();
      setNotice(
        "설문을 시작했습니다. 인증을 마친 학생 화면에 문항이 열립니다.",
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function closeSurvey() {
    if (!selected) return;
    try {
      setBusy(true);
      await StopSurveySession(selected.id);
      setSession(
        (await GetSurveySessionInfo(selected.id)) as unknown as Session,
      );
      await reload();
      setNotice("설문을 마감했습니다. 아래에서 문항별 결과를 확인하세요.");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function setPublicResults(enabled: boolean) {
    if (!selected) return;
    try {
      setBusy(true);
      setSession(
        (await SetSurveyResultsPublic(
          selected.id,
          enabled,
        )) as unknown as Session,
      );
      setNotice(
        enabled
          ? "전자칠판에 이름 없는 집계 결과를 공개했습니다."
          : "전자칠판 결과 공개를 중지했습니다.",
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  async function removeSurvey() {
    if (!deleteTarget) return;
    try {
      setBusy(true);
      await DeleteSurvey(deleteTarget.id, deletePhrase);
      setDeleteTarget(null);
      setDeletePhrase("");
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
        setSession(null);
        setView("목록");
      }
      await reload();
      setNotice("설문과 저장된 응답을 삭제했습니다.");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }
  const nameByID = useMemo(
    () =>
      new Map(
        students.map((student) => [
          student.id,
          `${student.number}번 ${student.name}`,
        ]),
      ),
    [students],
  );
  const results = useMemo(
    () =>
      selected?.questions.map((question) => {
        const total = selected.responses?.length || 0;
        const counts = question.options.map((option) => ({
          option,
          count: (selected.responses || []).filter(
            (response) =>
              response.answers?.[question.id] === option ||
              response.multiAnswers?.[question.id]?.includes(option),
          ).length,
        }));
        const scores = (selected.responses || [])
          .map((response) =>
            Number.parseInt(response.answers?.[question.id] || "", 10),
          )
          .filter((score) => Number.isFinite(score));
        return {
          question,
          total,
          counts,
          average: scores.length
            ? scores.reduce((sum, score) => sum + score, 0) / scores.length
            : 0,
          textAnswers: (selected.responses || [])
            .map((response) => response.answers?.[question.id])
            .filter(Boolean),
        };
      }) || [],
    [selected],
  );
  const surveyTemplates: {
    name: string;
    description: string;
    title: string;
    questions: string;
    scopes: ("담임용" | "수업용" | "업무용")[];
  }[] = [
    {
      name: "제출 서류 확인",
      description: "가정통신문·동의서 회신 상태를 확인합니다.",
      title: "제출 서류 확인",
      questions:
        "[단일 선택] 안내받은 서류를 제출했나요? | 제출함 | 아직 제출하지 않음 | 분실 또는 재발급 필요",
      scopes: ["담임용"],
    },
    {
      name: "학급 운영 의견",
      description: "청소·모둠·학급 행사 의견을 받습니다.",
      title: "학급 운영 의견 조사",
      questions:
        "가장 우선적으로 개선할 항목은? | 교실 환경 | 청소 운영 | 모둠 활동 | 학급 행사\n[복수 선택] 참여하고 싶은 활동은? | 체험 활동 | 모둠 활동 | 진로 탐색",
      scopes: ["담임용"],
    },
    {
      name: "행사 참여 조사",
      description: "행사나 체험활동 참석 가능 여부를 확인합니다.",
      title: "행사 참여 가능 여부",
      questions:
        "해당 일정에 참여할 수 있나요? | 참여 가능 | 조정 필요 | 참여 어려움",
      scopes: ["담임용", "수업용"],
    },
    {
      name: "수업 만족도",
      description: "5점 척도로 수업·활동 만족도를 확인합니다.",
      title: "수업 만족도 조사",
      questions:
        "[5점 척도] 이번 수업의 만족도는 어느 정도인가요?\n[서술] 수업에서 좋았던 점이나 제안할 점을 적어 주세요",
      scopes: ["수업용"],
    },
    {
      name: "학습 선호 조사",
      description: "학생의 학습 방식과 희망 활동을 확인합니다.",
      title: "학습 활동 선호 조사",
      questions:
        "가장 선호하는 학습 방식은? | 개별 활동 | 짝 활동 | 모둠 활동 | 발표 활동\n[복수 선택] 더 연습하고 싶은 영역은? | 개념 이해 | 문제 풀이 | 발표 | 실습",
      scopes: ["수업용"],
    },
    {
      name: "교직원 안건 투표",
      description: "회의 안건에 대한 교직원 의견을 받습니다.",
      title: "교직원 회의 안건 의견",
      questions:
        "제안한 안건에 동의하나요? | 찬성 | 반대 | 보류\n[서술] 추가 의견을 적어 주세요",
      scopes: ["업무용"],
    },
    {
      name: "업무 만족도",
      description: "학교 업무와 지원에 대한 의견을 확인합니다.",
      title: "교직원 업무 만족도 조사",
      questions:
        "[5점 척도] 현재 업무 환경에 만족하시나요?\n[복수 선택] 개선이 필요한 지원은? | 업무 분장 | 시설·환경 | 연수 | 소통\n[서술] 제안할 점을 적어 주세요",
      scopes: ["업무용"],
    },
  ];
  function applyTemplate(template: (typeof surveyTemplates)[number]) {
    setTitle(template.title);
    setQuestions(template.questions);
    setNotice(
      `‘${template.name}’ 템플릿을 불러왔습니다. 문항과 선택지는 자유롭게 수정할 수 있습니다.`,
    );
  }
  function addQuestion(
    type: "단일 선택" | "복수 선택" | "5점 척도" | "단답" | "서술",
  ) {
    const examples = {
      "단일 선택": "[단일 선택] 새 질문을 입력해 주세요 | 선택지 1 | 선택지 2",
      "복수 선택":
        "[복수 선택] 해당하는 항목을 모두 선택해 주세요 | 선택지 1 | 선택지 2 | 선택지 3",
      "5점 척도": "[5점 척도] 만족도를 선택해 주세요",
      단답: "[단답] 짧게 답해 주세요",
      서술: "[서술] 자유롭게 의견을 작성해 주세요",
    };
    setQuestions((value) =>
      value.trim() ? value.trim() + "\n" + examples[type] : examples[type],
    );
  }
  return (
    <>
      <section className="survey-scope-heading">
        <div>
          <p className="eyebrow">교내 Wi-Fi · 브라우저 참여</p>
          <h3>{scope} 설문</h3>
          <p>
            {fixedAudience === "교직원"
              ? "학교 메신저로 주소를 전달해 교직원 의견을 수집합니다."
              : scope === "담임용"
                ? "담임 학급 학생을 대상으로 설문을 운영합니다."
                : "담당 수업 학급 또는 학년을 대상으로 설문을 운영합니다."}
          </p>
        </div>
      </section>
      <div className="survey-tabs" role="tablist">
        <button
          className={view === "목록" ? "active" : ""}
          onClick={() => setView("목록")}
        >
          설문 목록
        </button>
        <button
          className={view === "작성" ? "active" : ""}
          onClick={() => openEditor()}
        >
          설문 작성
        </button>
        <button
          className={view === "진행·결과" ? "active" : ""}
          onClick={() =>
            selected
              ? setView("진행·결과")
              : setNotice("설문 목록에서 설문을 먼저 선택해 주세요.")
          }
        >
          진행 · 결과
        </button>
      </div>
      <HelpGuide
        title="설문 운영 순서"
        description="참여방을 먼저 열어 전자칠판에 QR과 입장 인원을 보여 주고, 학생이 모두 들어오면 설문을 시작합니다."
        steps={[
          {
            title: "설문 작성",
            detail: "‘질문 | 선택지1 | 선택지2’ 형식으로 문항을 저장합니다.",
          },
          {
            title: "참여방 열기",
            detail:
              "전자칠판 공개 화면에 QR, 주소, 참여 인증 인원과 참여 대상 인원이 표시됩니다.",
          },
          {
            title: "설문 시작",
            detail:
              "교사가 시작을 누른 순간 인증 대기 중인 학생 화면에 문항이 열립니다.",
          },
          {
            title: "마감·결과",
            detail:
              "마감 뒤에는 교사 화면에서 문항별 응답 수와 비율을 확인합니다.",
          },
        ]}
        note="참여 대상 인원은 재학생 수를 기본으로 쓰며, 결석 등을 고려해 설문 작성 때 직접 바꿀 수 있습니다."
      />
      {view === "목록" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">저장한 설문</p>
              <h3>설문 목록</h3>
            </div>
            <button className="primary-button" onClick={() => openEditor()}>
              ＋ 새 설문 작성
            </button>
          </div>
          <div className="survey-card-grid">
            {items.length === 0 ? (
              <p className="empty-state">저장한 설문이 없습니다.</p>
            ) : (
              items.map((item) => (
                <article key={item.id} className="survey-card">
                  <span className={`survey-status ${item.status}`}>
                    {item.status || "준비"}
                  </span>
                  <h4>{item.title}</h4>
                  <p>
                    {item.audience || "학생"} ·{" "}
                    {item.audience === "교직원"
                      ? item.staffIdentityMode || "익명"
                      : item.anonymous
                        ? "익명"
                        : "실명"}{" "}
                    · 응답 {item.responses?.length || 0}명 · 대상{" "}
                    {item.expectedParticipants ||
                      (item.audience === "교직원"
                        ? "미지정"
                        : students.length) ||
                      "미지정"}
                    명
                  </p>
                  <div>
                    <button
                      className="primary-button"
                      onClick={() => choose(item)}
                    >
                      진행 · 결과
                    </button>
                    <button
                      className="outline-button"
                      disabled={(item.status || "준비") !== "준비"}
                      onClick={() => openEditor(item)}
                    >
                      수정
                    </button>
                    <button
                      className="danger-button"
                      disabled={
                        item.status === "참여 대기" || item.status === "진행 중"
                      }
                      onClick={() => {
                        setDeleteTarget(item);
                        setDeletePhrase("");
                      }}
                    >
                      삭제
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
      {view === "작성" && (
        <section className="panel survey-editor">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {editing ? "준비 설문 수정" : "새 설문"}
              </p>
              <h3>{editing ? editing.title : "설문 작성"}</h3>
            </div>
            {editing && (
              <button className="quiet-button" onClick={() => openEditor()}>
                새 설문으로 전환
              </button>
            )}
          </div>
          {!editing && (
            <section className="survey-template-picker">
              <div>
                <b>{scope} 설문 템플릿</b>
                <p>용도에 맞는 틀을 고른 뒤 문항과 선택지를 수정하세요.</p>
              </div>
              <div className="survey-template-grid">
                {surveyTemplates
                  .filter((template) => template.scopes.includes(scope))
                  .map((template) => (
                    <button
                      type="button"
                      key={template.name}
                      onClick={() => applyTemplate(template)}
                    >
                      <strong>{template.name}</strong>
                      <small>{template.description}</small>
                    </button>
                  ))}
              </div>
            </section>
          )}
          <form className="survey-form" onSubmit={save}>
            <label>
              설문 제목
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="예: 2학년 1반 학급비 지출 계획"
              />
            </label>
            <div className="survey-form-split">
              <label>
                설문 대상
                <input readOnly value={fixedAudience} />
                <small>
                  {fixedAudience === "학생"
                    ? "학생은 이름·생년월일로 본인 확인합니다."
                    : "교내망 주소를 학교 메신저로 전달해 참여합니다."}
                </small>
              </label>
              <label>
                참여 대상 인원
                <input
                  type="number"
                  min="0"
                  value={expected}
                  onChange={(event) =>
                    setExpected(Number(event.target.value) || 0)
                  }
                />
                <small>
                  {audience === "학생"
                    ? "0이면 현재 재학생 수를 사용합니다."
                    : "선택 사항입니다. 0이면 인원을 표시하지 않습니다."}
                </small>
              </label>
              <label className="survey-anonymous">
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(event) => setAnonymous(event.target.checked)}
                />{" "}
                익명 설문{" "}
                <HelpTip>
                  전자칠판과 학생 화면에는 이름 없이 집계만 공개합니다. 교사용
                  암호화 보관함에서는 학생별 응답을 확인할 수 있습니다.
                </HelpTip>
              </label>
            </div>
            {audience === "교직원" && (
              <fieldset className="survey-identity-mode">
                <legend>교직원 응답자 확인</legend>
                <label className="survey-identity-toggle">
                  <input
                    type="checkbox"
                    checked={staffIdentityMode === "이름 입력"}
                    onChange={(event) =>
                      setStaffIdentityMode(
                        event.target.checked ? "이름 입력" : "익명",
                      )
                    }
                  />{" "}
                  <span>
                    <b>응답자 이름 입력</b>
                    <small>
                      {staffIdentityMode === "이름 입력"
                        ? "교사 화면에서 응답자 이름과 답변을 확인합니다."
                        : "이름 입력 없이 익명으로 참여합니다."}
                    </small>
                  </span>
                </label>
                <small>
                  이름 입력 방식은 일반 업무 설문에 적합합니다. 강한 본인 확인이
                  필요한 설문은 추후 개별 초대 코드 방식으로 확장합니다.
                </small>
              </fieldset>
            )}
            <label>
              문항{" "}
              <small>
                유형 버튼을 누르면 새 문항의 기본 형식이 입력란에 추가됩니다.
                문항은 한 줄에 하나씩 작성합니다.
              </small>
              <div className="survey-question-tools">
                <b>문항 유형 추가</b>
                <div>
                  <button
                    type="button"
                    onClick={() => addQuestion("단일 선택")}
                  >
                    ＋ 단일 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => addQuestion("복수 선택")}
                  >
                    ＋ 복수 선택
                  </button>
                  <button type="button" onClick={() => addQuestion("5점 척도")}>
                    ＋ 5점 척도
                  </button>
                  <button type="button" onClick={() => addQuestion("단답")}>
                    ＋ 단답
                  </button>
                  <button type="button" onClick={() => addQuestion("서술")}>
                    ＋ 서술형
                  </button>
                </div>
                <textarea
                  value={questions}
                  onChange={(event) => setQuestions(event.target.value)}
                  rows={10}
                />
              </div>
            </label>
            <div className="survey-editor-actions">
              <button
                className="outline-button"
                type="button"
                onClick={() => setPreviewOpen(true)}
              >
                학생 화면 미리보기
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => {
                  resetEditor();
                  setView("목록");
                }}
              >
                취소
              </button>
              <button className="primary-button" disabled={busy}>
                {busy ? "저장 중…" : editing ? "설문 수정 저장" : "설문 저장"}
              </button>
            </div>
          </form>
        </section>
      )}
      {view === "진행·결과" &&
        (selected ? (
          <section className="panel survey-control">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  {selected.audience || "학생"} ·{" "}
                  {selected.audience === "교직원"
                    ? selected.staffIdentityMode || "익명"
                    : selected.anonymous
                      ? "익명"
                      : "실명"}{" "}
                  설문 · {selected.status || "준비"}
                </p>
                <h3>{selected.title}</h3>
                <p>응답 {selected.responses?.length || 0}명</p>
              </div>
              <div className="survey-heading-actions">
                <button
                  className="outline-button"
                  disabled={(selected.status || "준비") !== "준비"}
                  onClick={() => openEditor(selected)}
                >
                  수정
                </button>
                <button
                  className="danger-button"
                  disabled={
                    selected.status === "참여 대기" ||
                    selected.status === "진행 중"
                  }
                  onClick={() => {
                    setDeleteTarget(selected);
                    setDeletePhrase("");
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
            {!session?.running ? (
              <div className="survey-stage-card">
                <h4>참여방을 열 준비가 되었습니다</h4>
                <p>
                  참여방을 열면 학생은 QR로 본인 인증만 하고 설문 시작을
                  기다립니다.
                </p>
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={openRoom}
                >
                  {busy ? "참여방 준비 중…" : "참여방 열기"}
                </button>
              </div>
            ) : (
              <>
                <div className="survey-live-panel">
                  <div>
                    <p className="eyebrow">전자칠판 공개 화면</p>
                    <h4>
                      {session.closed
                        ? "설문 마감"
                        : session.started
                          ? "설문 진행 중"
                          : "참여 인증 대기"}
                    </h4>
                    <p>{session.notice}</p>
                    <label>
                      학생 접속 주소
                      <input
                        readOnly
                        value={session.studentUrl}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </label>
                    <div className="survey-action-bar">
                      <button
                        className="outline-button copy-button"
                        onClick={() =>
                          navigator.clipboard
                            ?.writeText(session.studentUrl)
                            .then(() =>
                              setNotice("학생 접속 주소를 복사했습니다."),
                            )
                        }
                      >
                        ▣ 주소 복사
                      </button>
                      <button
                        className="primary-button board-button"
                        onClick={() =>
                          window.open(
                            session.boardUrl,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        ▣ 전자칠판 공개 화면
                      </button>
                      {!session.started && !session.closed && (
                        <button
                          className="start-button"
                          disabled={busy}
                          onClick={startQuestions}
                        >
                          ▶ 설문 시작
                        </button>
                      )}
                      {!session.closed && (
                        <button
                          className="danger-button close-button"
                          disabled={busy}
                          onClick={closeSurvey}
                        >
                          ■ 설문 마감
                        </button>
                      )}
                      {session.closed && (
                        <button
                          className={
                            session.publicResults
                              ? "outline-button"
                              : "start-button"
                          }
                          disabled={busy}
                          onClick={() =>
                            void setPublicResults(!session.publicResults)
                          }
                        >
                          {session.publicResults
                            ? "결과 공개 중지"
                            : "전자칠판 결과 공개"}
                        </button>
                      )}
                    </div>
                    <p className="survey-live-count">
                      참여 인증 <b>{session.participantCnt}</b>명
                      {(session.expectedParticipants ||
                        selected.expectedParticipants ||
                        (selected.audience === "교직원"
                          ? 0
                          : students.length)) > 0 && (
                        <>
                          {" "}
                          / 참여 대상{" "}
                          <b>
                            {session.expectedParticipants ||
                              selected.expectedParticipants ||
                              students.length}
                          </b>
                          명
                        </>
                      )}{" "}
                      · 응답 <b>{session.responseCnt}</b>명
                    </p>
                  </div>
                  {session.qrCodeDataUrl && (
                    <img
                      className="survey-qr"
                      src={session.qrCodeDataUrl}
                      alt="학생 참여 QR 코드"
                    />
                  )}
                </div>
                {session.running && <ClassroomNetworkNotice />}
                {session.closed && (
                  <section className="survey-results">
                    <h4>문항별 결과</h4>
                    {results.map(
                      (
                        { question, total, counts, average, textAnswers },
                        index,
                      ) => (
                        <article key={question.id}>
                          <b>
                            {index + 1}. {question.text}{" "}
                            <small>{question.type || "단일 선택"}</small>
                          </b>
                          {question.type === "5점 척도" && (
                            <p className="survey-scale-average">
                              평균 <strong>{average.toFixed(2)}</strong>점 / 5점
                            </p>
                          )}
                          {counts.map(({ option, count }) => (
                            <div key={option}>
                              <span>{option}</span>
                              <strong>{count}명</strong>
                              <em>
                                {total ? Math.round((count / total) * 100) : 0}%
                              </em>
                            </div>
                          ))}
                          {(question.type === "단답" ||
                            question.type === "서술") && (
                            <p className="survey-text-answer-count">
                              서술 응답 {textAnswers.length}건 · 학생별 내용은
                              아래 교사용 응답 확인에서 봅니다.
                            </p>
                          )}
                        </article>
                      ),
                    )}
                  </section>
                )}
                {selected.responses?.length > 0 && (
                  <section className="survey-response-list">
                    <h4>
                      교사용{" "}
                      {selected.audience === "교직원" ? "응답" : "학생별 응답"}{" "}
                      확인
                    </h4>
                    <p className="survey-teacher-only">
                      이 내용은 암호화 보관함의 교사 화면에서만 보이며
                      전자칠판에는 공개되지 않습니다.
                    </p>
                    {selected.responses.map((response, index) => (
                      <div key={`${response.studentId}-${index}`}>
                        <b>
                          {selected.audience === "교직원"
                            ? response.respondentName || "익명 응답"
                            : nameByID.get(response.studentId) ||
                              "학생 정보 없음"}
                        </b>
                        <span>
                          {selected.questions
                            .map(
                              (question, questionIndex) =>
                                `${questionIndex + 1}. ${response.answers?.[question.id] || response.multiAnswers?.[question.id]?.join(", ") || "미응답"}`,
                            )
                            .join(" · ")}
                          <small>
                            {formatRecordedAt(response.submittedAt)}
                          </small>
                        </span>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </section>
        ) : (
          <section className="panel">
            <p className="empty-state">설문 목록에서 설문을 선택해 주세요.</p>
          </section>
        ))}
      {notice && <p className="form-notice">{notice}</p>}
      <AlertDialog.Root open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content survey-preview-dialog">
            <AlertDialog.Title>학생 화면 미리보기</AlertDialog.Title>
            <AlertDialog.Description>
              응답은 저장되지 않습니다. 실제 학생 기기에서 보이는 선택지 구성을
              확인하세요.
            </AlertDialog.Description>
            <div className="student-survey-preview">
              <p className="eyebrow">꼬미노트 학급 참여</p>
              <h3>{title || "설문 제목"}</h3>
              {parseQuestions().length === 0 ? (
                <p className="empty-state">
                  질문과 선택지를 입력하면 미리보기가 표시됩니다.
                </p>
              ) : (
                parseQuestions().map((question, index) => (
                  <fieldset key={index}>
                    <legend>
                      {index + 1}. {question.text}
                    </legend>
                    {question.options.map((option, optionIndex) => (
                      <label key={option}>
                        <input type="radio" name={`preview-${index}`} />{" "}
                        <b>{optionIndex + 1}</b>
                        <span>{option}</span>
                      </label>
                    ))}
                  </fieldset>
                ))
              )}
              <button type="button">응답 제출</button>
            </div>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="primary-button">미리보기 닫기</button>
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleteTarget(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>설문과 응답을 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>
              삭제하면 설문 문항과 저장된 응답을 되돌릴 수 없습니다. 아래에{" "}
              <b>설문 삭제</b>를 입력해 주세요.
            </AlertDialog.Description>
            <label className="dialog-label">
              확인 문구
              <input
                value={deletePhrase}
                onChange={(event) => setDeletePhrase(event.target.value)}
                autoFocus
              />
            </label>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button" disabled={busy}>
                  취소
                </button>
              </AlertDialog.Cancel>
              <button
                className="danger-button"
                disabled={busy || deletePhrase !== "설문 삭제"}
                onClick={removeSurvey}
              >
                설문 삭제
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
