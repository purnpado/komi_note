import { useCallback, useEffect, useMemo, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteSurvey, GetSurveySessionInfo, ListCourseRosters, ListStudents, ListSurveys } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { changeEvents } from "../shared/changeEvents";
import { errorMessage } from "../shared/format";
import { useVaultChanges } from "../shared/useVaultChanges";
import { SurveyBuilder } from "./SurveyBuilder";
import { SurveyList } from "./SurveyList";
import { SurveySessionPanel } from "./SurveySessionPanel";
import type { SurveyScope } from "./surveyTemplates";
import type { SurveyItem, SurveySession } from "./surveyTypes";
import "./survey.css";
import "./survey-builder.css";

type SurveyHubPageProps = { formatRecordedAt: (value: string) => string };

export function SurveyHubPage({ formatRecordedAt }: SurveyHubPageProps) {
  const [scope, setScope] = useState<SurveyScope>("담임용");
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">업무용 · 설문 통합 관리</p>
          <h2>설문 조사</h2>
          <p>구글·네이버 설문처럼 문항 카드로 설문을 만들고, 교실 와이파이 QR로 응답을 받아 결과를 봅니다.</p>
        </div>
      </section>
      <div className="survey-scope-tabs" role="tablist" aria-label="설문 대상 구분">
        {(["담임용", "수업용", "업무용"] as const).map((item) => (
          <button key={item} role="tab" aria-selected={scope === item} className={scope === item ? "active" : ""} onClick={() => setScope(item)}>{item} 설문</button>
        ))}
      </div>
      <SurveyScopePanel key={scope} scope={scope} formatRecordedAt={formatRecordedAt} />
    </>
  );
}

type View = { mode: "목록" } | { mode: "작성"; editing: SurveyItem | null; copyFrom: SurveyItem | null } | { mode: "진행" ; surveyID: string };

function SurveyScopePanel({ scope, formatRecordedAt }: { scope: SurveyScope; formatRecordedAt: (value: string) => string }) {
  const audience = scope === "업무용" ? "교직원" : "학생";
  const [view, setView] = useState<View>({ mode: "목록" });
  const [items, setItems] = useState<SurveyItem[]>([]);
  const [students, setStudents] = useState<models.Student[]>([]);
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [session, setSession] = useState<SurveySession | null>(null);
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SurveyItem | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [surveyItems, studentItems, rosterItems] = await Promise.all([ListSurveys(), ListStudents(), ListCourseRosters()]);
      setItems(((surveyItems || []) as unknown as SurveyItem[]).filter((item) => (item.audience || "학생") === audience && (item.scope || "수업용") === scope));
      setStudents(studentItems || []);
      setRosters(rosterItems || []);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }, [audience, scope]);

  useEffect(() => { void reload(); }, [reload]);
  useVaultChanges([changeEvents.survey, changeEvents.courseRoster], () => void reload());

  const selected = view.mode === "진행" ? items.find((item) => item.id === view.surveyID) || null : null;
  useEffect(() => {
    if (!selected?.id || !session?.running) return;
    const timer = window.setInterval(() => {
      GetSurveySessionInfo(selected.id).then((value) => setSession(value as unknown as SurveySession)).catch(() => undefined);
    }, 1800);
    return () => window.clearInterval(timer);
  }, [selected?.id, session?.running]);

  const nameByStudentID = useMemo(() => new Map(students.map((student) => [student.id, `${student.number}번 ${student.name}`])), [students]);
  const rosterName = (id?: string) => {
    const roster = rosters.find((item) => item.id === id);
    return roster ? `${roster.schoolYear}학년도 ${roster.className}` : id ? "명렬을 찾을 수 없음" : "고르지 않음(담임 반)";
  };
  const defaultCount = (item: SurveyItem) => {
    if (item.audience === "교직원") return 0;
    const roster = rosters.find((r) => r.id === item.targetRosterId);
    return roster ? roster.students.filter((s) => !s.status || s.status === "재학").length : students.length;
  };

  async function open(item: SurveyItem) {
    setView({ mode: "진행", surveyID: item.id });
    setSession(null);
    setNotice("");
    try {
      setSession((await GetSurveySessionInfo(item.id)) as unknown as SurveySession);
    } catch {
      /* 아직 연 적 없는 설문 */
    }
  }

  async function removeSurvey() {
    if (!deleteTarget) return;
    try {
      setBusy(true);
      await DeleteSurvey(deleteTarget.id, deletePhrase);
      if (view.mode === "진행" && view.surveyID === deleteTarget.id) setView({ mode: "목록" });
      setDeleteTarget(null);
      await reload();
      setNotice("설문과 저장된 응답을 삭제했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="survey-scope-heading">
        <div>
          <p className="eyebrow">교실 와이파이 · 브라우저 참여</p>
          <h3>{scope} 설문</h3>
          <p>{audience === "교직원" ? "학교 메신저로 주소를 보내 교직원 의견을 받습니다." : scope === "담임용" ? "우리 반 학생이 번호와 이름으로 참여합니다." : "고른 수업 반 학생이 번호와 이름으로 참여합니다."}</p>
        </div>
      </section>
      <HelpGuide
        title="처음 사용 안내 · 설문 운영 순서"
        description="설문을 만들고, 참여방을 열어 전자칠판에 QR을 보여 준 뒤, 모두 들어오면 시작합니다."
        steps={[
          { title: "설문 만들기", detail: "‘＋ 새 설문 만들기’에서 틀을 고르거나 문항 추가 버튼으로 카드를 만듭니다. 카드마다 질문·유형·보기·꼭 답하기를 정하고, ⠿를 끌거나 ↑↓로 순서를 바꿉니다." },
          { title: "미리보기", detail: "‘휴대폰 화면 미리보기’로 학생에게 보일 모양을 확인합니다." },
          { title: "참여방 열기", detail: audience === "교직원" ? "주소를 학교 메신저로 보냅니다." : "전자칠판 화면에 QR과 참여 인원이 보입니다. 학생은 번호와 이름을 넣고 기다립니다. 다른 기기로 잘못 들어오면 참여 현황에서 ‘접속 초기화’를 누릅니다." },
          { title: "시작·마감·결과", detail: "‘설문 시작’을 누르면 문항이 열립니다. 마감 뒤 결과를 보고, 원하면 이름 없는 집계만 전자칠판에 공개합니다." },
        ]}
        note="응답은 이 컴퓨터의 암호화 보관함에만 저장됩니다. 학생 주소는 암호화되지 않은 교실 내부 주소이므로 업무망·교실 와이파이에서만 열고 끝나면 참여방을 닫으세요. 시작한 설문은 고칠 수 없으니 ‘복제’해서 새로 만드세요."
      />
      {view.mode === "목록" && (
        <SurveyList
          items={items}
          defaultCount={defaultCount}
          rosterName={rosterName}
          onNew={() => setView({ mode: "작성", editing: null, copyFrom: null })}
          onOpen={(item) => void open(item)}
          onEdit={(item) => setView({ mode: "작성", editing: item, copyFrom: null })}
          onCopy={(item) => setView({ mode: "작성", editing: null, copyFrom: item })}
          onDelete={(item) => { setDeleteTarget(item); setDeletePhrase(""); }}
        />
      )}
      {view.mode === "작성" && (
        <SurveyBuilder
          scope={scope}
          audience={audience}
          editing={view.editing}
          copyFrom={view.copyFrom}
          rosters={rosters}
          homeroomCount={students.length}
          onCancel={() => setView({ mode: "목록" })}
          onSaved={(saved, message) => { void reload().then(() => open(saved)); setNotice(message); }}
        />
      )}
      {view.mode === "진행" && (
        <section className="panel survey-control">
          <div className="panel-heading">
            <div>
              <button className="text-button" onClick={() => setView({ mode: "목록" })}>← 설문 목록</button>
              {selected && <><p className="eyebrow">{selected.audience || "학생"} · {selected.status || "준비"}{selected.scope === "수업용" ? ` · ${rosterName(selected.targetRosterId)}` : ""}</p><h3>{selected.title}</h3></>}
            </div>
            {selected && (
              <div className="survey-heading-actions">
                <button className="outline-button" disabled={(selected.status || "준비") !== "준비"} onClick={() => setView({ mode: "작성", editing: selected, copyFrom: null })}>수정</button>
                <button className="outline-button" onClick={() => setView({ mode: "작성", editing: null, copyFrom: selected })}>복제</button>
                <button className="danger-button" disabled={selected.status === "참여 대기" || selected.status === "진행 중"} onClick={() => { setDeleteTarget(selected); setDeletePhrase(""); }}>삭제</button>
              </div>
            )}
          </div>
          {selected ? (
            <SurveySessionPanel survey={selected} session={session} setSession={setSession} reload={reload} onNotice={setNotice} nameByStudentID={nameByStudentID} formatRecordedAt={formatRecordedAt} />
          ) : <p className="empty-state">설문을 찾지 못했습니다. 목록에서 다시 골라 주세요.</p>}
        </section>
      )}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <AlertDialog.Root open={deleteTarget !== null} onOpenChange={(isOpen) => { if (!isOpen && !busy) setDeleteTarget(null); }}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>설문과 응답을 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>삭제하면 설문 문항과 저장된 응답을 되돌릴 수 없습니다. 아래에 <b>설문 삭제</b>를 입력해 주세요.</AlertDialog.Description>
            <label className="dialog-label">확인 문구<input value={deletePhrase} onChange={(event) => setDeletePhrase(event.target.value)} autoFocus /></label>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild><button className="quiet-button" disabled={busy}>취소</button></AlertDialog.Cancel>
              <button className="danger-button" disabled={busy || deletePhrase !== "설문 삭제"} onClick={removeSurvey}>설문 삭제</button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
