import "./grouping.css";
import { StartSessionDialog } from "./GroupSessionDialogs";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { useGroupingPage } from "./useGroupingPage";
import { GroupingWorkspace } from "./GroupingWorkspace";
import { GroupingRulesDialog } from "./GroupingRulesDialog";
import { GroupingPresentDialog } from "./GroupingPresentDialog";

export type GroupingView = ReturnType<typeof useGroupingPage> & {
  students: models.Student[];
  isHomeroomTeacher: boolean;
  config: models.ClassConfig | null;
};

export function GroupingPage({
  students,
  isHomeroomTeacher,
  config,
}: {
  students: models.Student[];
  isHomeroomTeacher: boolean;
  config: models.ClassConfig | null;
}) {
  const view: GroupingView = {
    ...useGroupingPage({ students, isHomeroomTeacher, config }),
    students,
    isHomeroomTeacher,
    config,
  };
  const {
    book,
    excluded,
    notice,
    feedback,
    setFeedback,
    setSessionInfo,
    startOpen,
    setStartOpen,
    source,
    present,
    count,
  } = view;
  return (
    <div className="grouping-page">
      <header className="grouping-hero">
        <div>
          <p className="eyebrow">수업용 · 암호화 보관</p>
          <h2>모둠 편성</h2>
          <p>반을 고르고 인원을 정하면 고르게 나눕니다. 학생을 눌러 옮기거나 맞바꾼 뒤 전자칠판에 보여 주세요.</p>
        </div>
      </header>

      <HelpGuide
        title="모둠 편성 사용 순서"
        description="번호와 이름만 씁니다. 성적·연락처는 쓰지 않습니다."
        defaultOpen={!book.plans.length}
        steps={[
          {
            title: "반 고르기",
            detail: isHomeroomTeacher
              ? "우리 반(학생 명렬) 또는 수업 명렬의 반을 고릅니다."
              : "수업 명렬의 반을 고릅니다. 명렬은 평가 관리에서 나이스 파일을 가져오면 생깁니다.",
          },
          {
            title: "인원 정하기",
            detail:
              "모둠당 인원 또는 모둠 수를 정하고, 오늘 빠지는 학생을 체크합니다. 역할(모둠장·기록 등)은 적고 싶을 때만 적습니다.",
          },
          {
            title: "편성 조건(선택)",
            detail:
              "같은 모둠에 넣지 않을 학생·함께 넣을 학생을 정합니다. 교사 화면에만 보이고 전자칠판·인쇄물에는 나오지 않습니다.",
          },
          {
            title: "조정하기",
            detail: "학생을 누른 뒤 다른 학생을 누르면 맞바꾸고, 다른 모둠의 [여기로]를 누르면 옮깁니다.",
          },
          {
            title: "저장·발표",
            detail:
              "[저장]하면 이력이 남고, 다음 편성 때 지난 모둠과 겹치지 않게 나눌 수 있습니다. [전자칠판 보기]·[인쇄]로 학생에게 알립니다.",
          },
        ]}
        note="모둠 편성과 조건은 이 컴퓨터의 암호화 보관함에만 저장되고 암호화 백업에 함께 들어갑니다."
      />

      {notice && (
        <p className="grouping-notice" role="alert">
          {notice}
        </p>
      )}
      {feedback && (
        <p className="grouping-feedback" role="status">
          {feedback}
        </p>
      )}

      <GroupingWorkspace view={view} />

      <StartSessionDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        source={source ? { kind: source.kind, id: source.id, label: source.label.replace(" (우리 반)", "") } : null}
        presentCount={present.length}
        defaultCount={count || 4}
        excludedKeys={[...excluded]}
        onStarted={(info) => {
          setSessionInfo(info);
          setFeedback("학생 참여 회차를 열었습니다. [전자칠판 보기]로 QR을 보여 주세요.");
        }}
      />

      <GroupingRulesDialog view={view} />

      <GroupingPresentDialog view={view} />
    </div>
  );
}
