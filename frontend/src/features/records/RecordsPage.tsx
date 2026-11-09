import "./records-page.css";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { areaLabels, availableTargets, entryStatus, progress, statusLabels, type TabKey } from "./recordsState";
import { BulkArchiveDialog } from "./PhraseParts";
import { PhraseLibrary } from "./PhraseLibrary";
import { useRecordsPage, slotKey } from "./useRecordsPage";
import { AssessmentReference } from "./AssessmentReference";
import { EntryEditor } from "./EntryEditor";
import { ListDialog, LimitsDialog, YearCleanupDialog } from "./RecordDialogs";

export function RecordsPage({
  students,
  config,
  isHomeroomTeacher,
}: {
  students: models.Student[];
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
  const { book, setBook, rosters, setRosters, assessments, setAssessments, loadError, setLoadError, notice, setNotice, shownTabs, tabKey, setTabKey, tab, creativeArea, setCreativeArea, area, year, setYear, targetValue, setTargetValue, subject, setSubject, selectedKey, setSelectedKey, onlyMissing, setOnlyMissing, listDialog, setListDialog, limitsOpen, setLimitsOpen, cleanupOpen, setCleanupOpen, view, setView, bulkYear, setBulkYear, reload, years, targets, target, slot, slotEntries, pupils, orphanEntries, statuses, counts, shownPupils, orphanPupils, selectable, selected, subjectSuggestions, onSaved, onDeleted, onPhraseSaved, onPhraseRemoved, bulkCandidates, everyName, moveSelection, limit, allNames } = useRecordsPage({ students, config, isHomeroomTeacher });
  if (loadError) {
    return (
      <section className="records-page">
        <p className="records-error" role="alert">학교생활기록을 불러오지 못했습니다: {loadError}</p>
        <button className="quiet-button" onClick={() => void reload()}>다시 불러오기</button>
      </section>
    );
  }

  return (
    <section className="records-page">
      <section className="page-intro records-hero">
        <div>
          <p className="eyebrow">학생부 기재 전 교사 검토가 필요합니다</p>
          <h2>학교생활기록</h2>
          <p>관찰 메모를 쌓아 두고, 학생별 기재 문장을 글자 수·나이스 바이트를 보며 완성합니다. 모든 내용은 이 컴퓨터의 암호화 보관함에만 저장됩니다.</p>
        </div>
        <div className="records-hero-actions">
          <label className="records-field records-year">
            학년도
            <select value={year} onChange={(event) => setYear(event.target.value)}>
              {years.map((item) => (
                <option key={item} value={item}>{item}학년도</option>
              ))}
            </select>
          </label>
          <button className="quiet-button" onClick={() => setLimitsOpen(true)}>글자 수 한도</button>
          <button className="quiet-button" onClick={() => setCleanupOpen(true)}>학년도 기록 정리</button>
        </div>
      </section>

      <HelpGuide
        title="학교생활기록 쓰는 순서"
        description="학기 중에는 관찰 메모를, 학기 말에는 기재 문장을 씁니다. 나이스에는 복사해 붙여 넣습니다."
        defaultOpen={false}
        steps={[
          { title: "영역과 명단 고르기", detail: "위 탭에서 교과세특·창체·자유학기제(담임은 행동특성도)를 고르고, 우리 반·수업 반·활동 명단 중 쓸 명단을 고릅니다. 동아리처럼 여러 반 학생이 섞이면 '활동 명단 만들기'로 명단을 붙여 넣습니다." },
          { title: "관찰 메모 쌓기", detail: "학생을 누르고 그때그때 본 것을 짧게 적어 '메모 추가'를 누릅니다. 날짜가 필요하면 메모 안에 함께 씁니다." },
          { title: "기재 문장 쓰기", detail: "메모를 보며 기재 문장을 씁니다. 입력을 멈추면 잠시 뒤 자동 저장됩니다. 글자 수와 나이스 바이트가 한도를 넘으면 빨갛게 표시됩니다." },
          { title: "점검하고 나이스에 붙여 넣기", detail: "학생 이름이나 기재요령상 확인할 표현이 있으면 아래에 알려 줍니다. '복사'로 문장만 복사해 나이스에 붙여 넣고 '검토 완료'를 표시합니다." },
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
        <button role="tab" aria-selected={view === "phrases"} className={view === "phrases" ? "active records-tab-phrases" : "records-tab-phrases"} onClick={() => setView("phrases")}>
          <strong>문장 보관함</strong>
          <span>학생 정보 없이 모은 문장 {book?.phrases.length || 0}개 · 태그로 찾기</span>
        </button>
      </div>

      {notice && <p className="records-notice" role="status">{notice}</p>}

      {view === "phrases" && book ? (
        <section className="panel records-phrase-panel" role="tabpanel" aria-label="문장 보관함">
          <div className="records-phrase-head">
            <div>
              <h3>문장 보관함</h3>
              <p className="records-muted">학생과 연결하지 않은 문장만 모읍니다. 학년도 기록을 정리하거나 학생이 전출해도 남습니다. 태그는 이 컴퓨터 안의 규칙으로 추천합니다.</p>
            </div>
            <button className="quiet-button" onClick={() => setBulkYear(year)}>{year}학년도 검토 완료 문장 한꺼번에 보관</button>
          </div>
          <PhraseLibrary phrases={book.phrases} names={everyName} mode="manage" onChanged={onPhraseSaved} onRemoved={onPhraseRemoved} />
        </section>
      ) : (
      <>

      <section className="panel records-toolbar" role="tabpanel" aria-label={tab.label}>
        {tab.key === "creative" && (
          <div className="records-segment" role="radiogroup" aria-label="창체 영역">
            {tab.areas.map((item) => (
              <button key={item} role="radio" aria-checked={item === area} className={item === area ? "active" : ""} onClick={() => setCreativeArea(item)}>
                {areaLabels[item]}
              </button>
            ))}
          </div>
        )}
        <div className="records-toolbar-row">
          <label className="records-field">
            명단
            <select
              value={target?.value || ""}
              onChange={(event) => {
                setTargetValue(event.target.value);
                setSelectedKey("");
              }}
              disabled={targets.length === 0}
            >
              {targets.length === 0 && <option value="">고를 수 있는 명단이 없습니다</option>}
              {targets.map((item) => (
                <option key={item.value} value={item.value}>{item.label} ({item.pupils.length}명)</option>
              ))}
            </select>
          </label>
          {area === "subject" && (
            <label className="records-field records-subject">
              <span>과목 <HelpTip>교과세특은 과목별로 따로 저장됩니다. 한 반에서 두 과목을 가르치면 과목 이름을 바꿔 따로 쓰세요.</HelpTip></span>
              <input value={subject} list="records-subjects" maxLength={40} onChange={(event) => setSubject(event.target.value)} />
              <datalist id="records-subjects">
                {subjectSuggestions.map((item) => (
                  <option key={item} value={item} />
                ))}
              </datalist>
            </label>
          )}
          {availableTargets(tab, isHomeroomTeacher).includes("list") && (
            <div className="records-list-actions">
              <button className="quiet-button" onClick={() => setListDialog(new models.RecordActivityList({ schoolYear: year }))}>＋ 활동 명단 만들기</button>
              {target?.kind === "list" && (
                <button className="text-button" onClick={() => setListDialog(book?.lists.find((list) => list.id === target.id) || null)}>명단 고치기</button>
              )}
            </div>
          )}
        </div>
        {target && pupils.length > 0 && (
          <div className="records-progress">
            <div>
              <strong>{counts.total}명 중 {counts.written}명 작성</strong>
              <span> · 검토 완료 {counts.reviewed}명</span>
              <span className="records-limit"> · 한도 {limit}자({(limit * 3).toLocaleString()}바이트)</span>
            </div>
            <div className="records-progress-bar" aria-hidden="true">
              <i style={{ width: `${counts.total ? (counts.written / counts.total) * 100 : 0}%` }} />
              <b style={{ width: `${counts.total ? (counts.reviewed / counts.total) * 100 : 0}%` }} />
            </div>
            <label className="records-check">
              <input type="checkbox" checked={onlyMissing} onChange={(event) => setOnlyMissing(event.target.checked)} /> 미작성 학생만 보기
            </label>
          </div>
        )}
      </section>

      {!book ? (
        <p className="records-muted">불러오는 중…</p>
      ) : !target ? (
        <EmptyTargets kind={tab.key} isHomeroomTeacher={isHomeroomTeacher} />
      ) : pupils.length === 0 && orphanPupils.length === 0 ? (
        <section className="panel records-empty">
          <strong>이 명단에 학생이 없습니다.</strong>
          <p>{target.kind === "list" ? "'명단 고치기'에서 학생을 넣어 주세요." : target.kind === "course" ? "수업 명렬 메뉴에서 학생을 확인해 주세요." : "학생 명렬 메뉴에서 학생을 먼저 가져와 주세요."}</p>
        </section>
      ) : (
        <div className="records-workspace">
          <aside className="panel records-students" aria-label="학생 목록">
            <ul>
              {shownPupils.map((pupil) => {
                const status = entryStatus(slotEntries.get(pupil.key));
                return (
                  <li key={pupil.key}>
                    <button className={pupil.key === selectedKey ? "active" : ""} onClick={() => setSelectedKey(pupil.key)} aria-current={pupil.key === selectedKey}>
                      <span className={`records-dot ${status}`} aria-hidden="true" />
                      <strong>{pupil.label}</strong>
                      <small>{pupil.note ? `${pupil.note} · ` : ""}{statusLabels[status]}</small>
                    </button>
                  </li>
                );
              })}
              {shownPupils.length === 0 && <li className="records-muted">모든 학생의 문장을 썼습니다.</li>}
            </ul>
            {orphanPupils.length > 0 && (
              <>
                <h4>명단에 없는 학생 기록 <HelpTip>명렬·명단에서 번호나 이름이 바뀌었거나 빠진 학생의 기록입니다. 눌러서 다른 학생에게 옮기거나 지울 수 있습니다.</HelpTip></h4>
                <ul>
                  {orphanPupils.map((pupil) => (
                    <li key={pupil.key}>
                      <button className={pupil.key === selectedKey ? "active orphan" : "orphan"} onClick={() => setSelectedKey(pupil.key)}>
                        <span className="records-dot orphan" aria-hidden="true" />
                        <strong>{pupil.label}</strong>
                        <small>명단에 없음</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
          {selected && slot ? (
            <EntryEditor
              key={`${slotKey(slot)}\u0000${selected.key}`}
              slot={slot}
              pupil={selected}
              entry={slotEntries.get(selected.key)}
              isOrphan={!pupils.some((pupil) => pupil.key === selected.key)}
              moveTargets={pupils.filter((pupil) => !slotEntries.has(pupil.key))}
              limit={limit}
              names={allNames}
              everyName={everyName}
              phrases={book.phrases}
              onPhraseSaved={(saved) => {
                onPhraseSaved(saved);
                setNotice("문장 보관함에 저장했습니다. '문장 보관함' 탭에서 찾을 수 있습니다.");
              }}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onMove={(next) => setSelectedKey(next)}
              onPrev={() => moveSelection(-1)}
              onNext={() => moveSelection(1)}
              hasPrev={selectable.findIndex((pupil) => pupil.key === selectedKey) > 0}
              hasNext={selectable.findIndex((pupil) => pupil.key === selectedKey) < selectable.length - 1}
              reference={area === "subject" && target.roster ? <AssessmentReference assessments={assessments} roster={target.roster} pupil={selected} subject={slot.subject} /> : null}
            />
          ) : (
            <section className="panel records-empty"><p>왼쪽에서 학생을 골라 주세요.</p></section>
          )}
        </div>
      )}
      </>
      )}

      {listDialog && (
        <ListDialog
          list={listDialog}
          onClose={() => setListDialog(null)}
          onSaved={(saved) => {
            setBook((current) => {
              if (!current) return current;
              const lists = current.lists.filter((list) => list.id !== saved.id);
              lists.push(saved);
              return new models.RecordBook({ ...current, lists });
            });
            setTargetValue(`list:${saved.id}`);
            setSelectedKey("");
            setListDialog(null);
            setNotice(`활동 명단 '${saved.name}'(${saved.members.length}명)을 저장했습니다.`);
          }}
          onDeleted={async (name) => {
            setListDialog(null);
            setTargetValue("");
            setNotice(`활동 명단 '${name}'과 그 명단의 기록을 지웠습니다.`);
            await reload();
          }}
        />
      )}
      {limitsOpen && book && (
        <LimitsDialog
          limits={book.limits}
          onClose={() => setLimitsOpen(false)}
          onSaved={(limits) => {
            setBook(new models.RecordBook({ ...book, limits }));
            setLimitsOpen(false);
            setNotice("글자 수 한도를 저장했습니다.");
          }}
        />
      )}
      {cleanupOpen && book && (
        <YearCleanupDialog
          book={book}
          onClose={() => setCleanupOpen(false)}
          onBulk={(forYear) => {
            setCleanupOpen(false);
            setBulkYear(forYear);
          }}
          onDone={async (deletedYear, removed) => {
            setCleanupOpen(false);
            setNotice(`${deletedYear}학년도 기록 ${removed}건과 활동 명단을 지웠습니다.`);
            await reload();
          }}
        />
      )}
      {bulkYear && book && (
        <BulkArchiveDialog
          year={bulkYear}
          candidates={bulkCandidates(bulkYear)}
          existingTexts={new Set(book.phrases.map((phrase) => phrase.text))}
          names={everyName}
          onClose={() => setBulkYear(null)}
          onDone={async (added, skipped) => {
            setBulkYear(null);
            setNotice(`문장 보관함에 ${added}개를 넣었습니다.${skipped ? ` 이미 있던 ${skipped}개는 건너뛰었습니다.` : ""}`);
            await reload();
          }}
        />
      )}
    </section>
  );
}

function EmptyTargets({ kind, isHomeroomTeacher }: { kind: TabKey; isHomeroomTeacher: boolean }) {
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
