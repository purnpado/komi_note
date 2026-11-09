import "./records-page.css";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { type TabKey } from "./recordsState";
import { useRecordsPage } from "./useRecordsPage";
import { RecordsWorkspace } from "./RecordsWorkspace";
import { RecordsPageDialogs } from "./RecordsPageDialogs";

export type RecordsView = ReturnType<typeof useRecordsPage> & {
  students: models.Student[];
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
};

export function RecordsPage({
  students,
  config,
  isHomeroomTeacher,
}: {
  students: models.Student[];
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
  const page: RecordsView = {
    ...useRecordsPage({ students, config, isHomeroomTeacher }),
    students,
    config,
    isHomeroomTeacher,
  };
  const {
    book,
    loadError,
    notice,
    shownTabs,
    setTabKey,
    tab,
    year,
    setYear,
    setSelectedKey,
    setLimitsOpen,
    setCleanupOpen,
    view,
    setView,
    reload,
    years,
    selected,
  } = page;
  if (loadError) {
    return (
      <section className="records-page">
        <p className="records-error" role="alert">
          학교생활기록을 불러오지 못했습니다: {loadError}
        </p>
        <button className="quiet-button" onClick={() => void reload()}>
          다시 불러오기
        </button>
      </section>
    );
  }

  return (
    <section className="records-page">
      <section className="page-intro records-hero page-head">
        <div>
          <p className="eyebrow">학생부 기재 전 교사 검토가 필요합니다</p>
          <h2>학교생활기록</h2>
          <p>
            관찰 메모를 쌓아 두고, 학생별 기재 문장을 글자 수·나이스 바이트를 보며 완성합니다. 모든 내용은 이 컴퓨터의
            암호화 보관함에만 저장됩니다.
          </p>
        </div>
        <div className="records-hero-actions">
          <label className="records-field records-year">
            학년도
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              {years.map((item) => (
                <option key={item} value={item}>
                  {item}학년도
                </option>
              ))}
            </select>
          </label>
          <button className="quiet-button" onClick={() => setLimitsOpen(true)}>
            글자 수 한도
          </button>
          <button className="quiet-button" onClick={() => setCleanupOpen(true)}>
            학년도 기록 정리
          </button>
        </div>
      </section>

      <HelpGuide
        title="학교생활기록 쓰는 순서"
        description="학기 중에는 관찰 메모를, 학기 말에는 기재 문장을 씁니다. 나이스에는 복사해 붙여 넣습니다."
        defaultOpen={false}
        steps={[
          {
            title: "영역과 명단 고르기",
            detail:
              "위 탭에서 교과세특·창체·자유학기제(담임은 행동특성도)를 고르고, 우리 반·수업 반·활동 명단 중 쓸 명단을 고릅니다. 동아리처럼 여러 반 학생이 섞이면 '활동 명단 만들기'로 명단을 붙여 넣습니다.",
          },
          {
            title: "관찰 메모 쌓기",
            detail:
              "학생을 누르고 그때그때 본 것을 짧게 적어 '메모 추가'를 누릅니다. 날짜가 필요하면 메모 안에 함께 씁니다.",
          },
          {
            title: "기재 문장 쓰기",
            detail:
              "메모를 보며 기재 문장을 씁니다. 입력을 멈추면 잠시 뒤 자동 저장됩니다. 글자 수와 나이스 바이트가 한도를 넘으면 빨갛게 표시됩니다.",
          },
          {
            title: "점검하고 나이스에 붙여 넣기",
            detail:
              "학생 이름이나 기재요령상 확인할 표현이 있으면 아래에 알려 줍니다. '복사'로 문장만 복사해 나이스에 붙여 넣고 '검토 완료'를 표시합니다.",
          },
        ]}
        note="기록은 암호화 보관함에만 저장되고 외부로 보내지 않습니다. 복사한 문장은 컴퓨터 클립보드에 남으므로 붙여 넣은 뒤에는 다른 내용을 복사해 두세요. 문장 점검은 이 컴퓨터 안에서만 하는 간단한 검사이며, 학교 기재요령을 대신하지 않습니다."
      />

      <div className="records-tabs" role="tablist" aria-label="기록 영역">
        {shownTabs.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={view === "write" && item.key === tab.key}
            className={view === "write" && item.key === tab.key ? "active" : ""}
            onClick={() => {
              setView("write");
              setTabKey(item.key);
              setSelectedKey("");
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
        <button
          role="tab"
          aria-selected={view === "phrases"}
          className={view === "phrases" ? "active records-tab-phrases" : "records-tab-phrases"}
          onClick={() => setView("phrases")}
        >
          <strong>문장 보관함</strong>
          <span>학생 정보 없이 모은 문장 {book?.phrases.length || 0}개 · 태그로 찾기</span>
        </button>
      </div>

      {notice && (
        <p className="records-notice" role="status">
          {notice}
        </p>
      )}

      <RecordsWorkspace page={page} />

      <RecordsPageDialogs page={page} />
    </section>
  );
}

export function EmptyTargets({ kind, isHomeroomTeacher }: { kind: TabKey; isHomeroomTeacher: boolean }) {
  const message =
    kind === "subject"
      ? "교과세특은 수업 명렬의 반에서 씁니다. 이 학년도의 수업 명렬이 없습니다. 수업 명렬 메뉴나 평가 관리에서 수행평가를 가져오면 수업 명렬이 만들어집니다."
      : isHomeroomTeacher
        ? "이 학년도에 쓸 명단이 없습니다. 학생 명렬을 가져오거나 '활동 명단 만들기'로 명단을 만들어 주세요."
        : "이 학년도에 쓸 명단이 없습니다. '활동 명단 만들기'로 동아리 등 명단을 만들거나 수업 명렬을 준비해 주세요.";
  return (
    <section className="panel records-empty">
      <strong>쓸 명단이 아직 없습니다.</strong>
      <p>{message}</p>
    </section>
  );
}
