import "./timetable.css";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { useTimetablePage, emptyChange } from "./useTimetablePage";
import { TimetableGrid } from "./TimetableGrid";
import { TimetableCellDialog } from "./TimetableCellDialog";
import { TimetableBellDialog } from "./TimetableBellDialog";
import { TimetableChangesDialog } from "./TimetableChangesDialog";
import { timetableScreen } from "./timetableScreen";

export type TimetableView = ReturnType<typeof useTimetablePage> & {
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
};
export type TimetableUi = TimetableView & ReturnType<typeof timetableScreen>;

export function TimetablePage({
  config,
  isHomeroomTeacher,
}: {
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
  const page: TimetableView = { ...useTimetablePage({ config, isHomeroomTeacher }), config, isHomeroomTeacher };
  const { book, kind, notice, feedback, setChangesOpen, setChangeDraft, setEditingChangeID, setDialogError } = page;
  if (!book) {
    return (
      <div className="timetable-page">
        <p className="timetable-notice" role="alert">
          {notice || "시간표를 불러오는 중입니다."}
        </p>
      </div>
    );
  }

  const ui: TimetableUi = { ...page, ...timetableScreen(page, book) };
  const { current, openBell, today } = ui;

  return (
    <div className="timetable-page">
      <header className="timetable-hero">
        <div>
          <p className="eyebrow">수업용 · 암호화 보관</p>
          <h2>시간표</h2>
          <p>요일·교시별로 수업을 적어 두면 대시보드에 오늘 수업과 이번 주 시간표가 나옵니다.</p>
        </div>
        <div className="timetable-hero-actions">
          <button type="button" className="quiet-button" onClick={openBell}>
            교시 시간 설정
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!current.periods.length}
            onClick={() => {
              setEditingChangeID("");
              setChangeDraft(emptyChange(today, kind));
              setDialogError("");
              setChangesOpen(true);
            }}
          >
            날짜별 교체·보강
          </button>
        </div>
      </header>

      <HelpGuide
        title="시간표 사용 순서"
        description="학생 정보 없이 과목·반·교시 시각만 보관함에 암호화해 저장합니다."
        defaultOpen={!current.timetables.length}
        steps={[
          {
            title: "교시 시간 설정",
            detail:
              "1교시 시작 시각, 수업 길이, 쉬는 시간, 점심 위치·길이를 넣고 [자동 계산]을 누릅니다. 다른 교시만 따로 고칠 수도 있습니다.",
          },
          {
            title: "내 수업 입력",
            detail:
              "표의 칸을 눌러 과목과 반을 적습니다. 수업 명렬에서 반을 고르면 대시보드에서 그 반 명렬·평가로 바로 갈 수 있습니다.",
          },
          ...(isHomeroomTeacher
            ? [
                {
                  title: "우리 반 시간표",
                  detail:
                    "담임이면 [우리 반 시간표] 탭에 학급 시간표도 적어 둡니다. 대시보드에 우리 반 오늘 과목이 한 줄로 나옵니다.",
                },
              ]
            : []),
          {
            title: "학기 고르기",
            detail:
              "1학기·2학기 시간표를 따로 저장합니다. 새 학기가 되면 위에서 학기를 고르고 [지금 쓰는 시간표로 정하기]를 누릅니다.",
          },
          {
            title: "교체·보강",
            detail:
              "특정 날짜만 바뀌는 수업은 [날짜별 교체·보강]에 적습니다. 그날 대시보드에만 반영되고 기본 시간표는 그대로입니다.",
          },
        ]}
        note="시간표는 이 컴퓨터의 암호화 보관함에만 저장되고 밖으로 보내지 않습니다. 암호화 백업에 함께 들어갑니다."
      />

      {notice && (
        <p className="timetable-notice" role="alert">
          {notice}
        </p>
      )}
      {feedback && (
        <p className="timetable-feedback" role="status">
          {feedback}
        </p>
      )}

      <TimetableGrid page={ui} />

      <TimetableCellDialog page={ui} />

      <TimetableBellDialog page={ui} />

      <TimetableChangesDialog page={ui} />
    </div>
  );
}
