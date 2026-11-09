import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { areaLabels, availableTargets, entryStatus, progress, statusLabels } from "./recordsState";
import { PhraseLibrary } from "./PhraseLibrary";
import { slotKey } from "./recordsSlots";
import { AssessmentReference } from "./AssessmentReference";
import { EntryEditor } from "./EntryEditor";
import { type RecordsView, EmptyTargets } from "./RecordsPage";

/** 학교생활기록 작업 구역: 문장 보관함 보기 또는 대상·학생 목록과 기록 작성. */
export function RecordsWorkspace({ page }: { page: RecordsView }) {
  const {
    book,
    assessments,
    setNotice,
    tab,
    setCreativeArea,
    area,
    year,
    setTargetValue,
    subject,
    setSubject,
    selectedKey,
    setSelectedKey,
    onlyMissing,
    setOnlyMissing,
    setListDialog,
    view,
    setBulkYear,
    targets,
    target,
    slot,
    slotEntries,
    pupils,
    counts,
    shownPupils,
    orphanPupils,
    selectable,
    selected,
    subjectSuggestions,
    onSaved,
    onDeleted,
    onPhraseSaved,
    onPhraseRemoved,
    everyName,
    moveSelection,
    limit,
    allNames,
    students,
    isHomeroomTeacher,
  } = page;
  return (
    <>
      {view === "phrases" && book ? (
        <section className="panel records-phrase-panel" role="tabpanel" aria-label="문장 보관함">
          <div className="records-phrase-head">
            <div>
              <h3>문장 보관함</h3>
              <p className="records-muted">
                학생과 연결하지 않은 문장만 모읍니다. 학년도 기록을 정리하거나 학생이 전출해도 남습니다. 태그는 이
                컴퓨터 안의 규칙으로 추천합니다.
              </p>
            </div>
            <button className="quiet-button" onClick={() => setBulkYear(year)}>
              {year}학년도 검토 완료 문장 한꺼번에 보관
            </button>
          </div>
          <PhraseLibrary
            phrases={book.phrases}
            names={everyName}
            mode="manage"
            onChanged={onPhraseSaved}
            onRemoved={onPhraseRemoved}
          />
        </section>
      ) : (
        <>
          <section className="panel records-toolbar" role="tabpanel" aria-label={tab.label}>
            {tab.key === "creative" && (
              <div className="records-segment" role="radiogroup" aria-label="창체 영역">
                {tab.areas.map((item) => (
                  <button
                    key={item}
                    role="radio"
                    aria-checked={item === area}
                    className={item === area ? "active" : ""}
                    onClick={() => setCreativeArea(item)}
                  >
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
                    <option key={item.value} value={item.value}>
                      {item.label} ({item.pupils.length}명)
                    </option>
                  ))}
                </select>
              </label>
              {area === "subject" && (
                <label className="records-field records-subject">
                  <span>
                    과목{" "}
                    <HelpTip>
                      교과세특은 과목별로 따로 저장됩니다. 한 반에서 두 과목을 가르치면 과목 이름을 바꿔 따로 쓰세요.
                    </HelpTip>
                  </span>
                  <input
                    value={subject}
                    list="records-subjects"
                    maxLength={40}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                  <datalist id="records-subjects">
                    {subjectSuggestions.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </label>
              )}
              {availableTargets(tab, isHomeroomTeacher).includes("list") && (
                <div className="records-list-actions">
                  <button
                    className="quiet-button"
                    onClick={() => setListDialog(new models.RecordActivityList({ schoolYear: year }))}
                  >
                    ＋ 활동 명단 만들기
                  </button>
                  {target?.kind === "list" && (
                    <button
                      className="text-button"
                      onClick={() => setListDialog(book?.lists.find((list) => list.id === target.id) || null)}
                    >
                      명단 고치기
                    </button>
                  )}
                </div>
              )}
            </div>
            {target && pupils.length > 0 && (
              <div className="records-progress">
                <div>
                  <strong>
                    {counts.total}명 중 {counts.written}명 작성
                  </strong>
                  <span> · 검토 완료 {counts.reviewed}명</span>
                  <span className="records-limit">
                    {" "}
                    · 한도 {limit}자({(limit * 3).toLocaleString()}바이트)
                  </span>
                </div>
                <div className="records-progress-bar" aria-hidden="true">
                  <i style={{ width: `${counts.total ? (counts.written / counts.total) * 100 : 0}%` }} />
                  <b style={{ width: `${counts.total ? (counts.reviewed / counts.total) * 100 : 0}%` }} />
                </div>
                <label className="records-check">
                  <input
                    type="checkbox"
                    checked={onlyMissing}
                    onChange={(event) => setOnlyMissing(event.target.checked)}
                  />{" "}
                  미작성 학생만 보기
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
              <p>
                {target.kind === "list"
                  ? "'명단 고치기'에서 학생을 넣어 주세요."
                  : target.kind === "course"
                    ? "수업 명렬 메뉴에서 학생을 확인해 주세요."
                    : "학생 명렬 메뉴에서 학생을 먼저 가져와 주세요."}
              </p>
            </section>
          ) : (
            <div className="records-workspace">
              <aside className="panel records-students" aria-label="학생 목록">
                <ul>
                  {shownPupils.map((pupil) => {
                    const status = entryStatus(slotEntries.get(pupil.key));
                    return (
                      <li key={pupil.key}>
                        <button
                          className={pupil.key === selectedKey ? "active" : ""}
                          onClick={() => setSelectedKey(pupil.key)}
                          aria-current={pupil.key === selectedKey}
                        >
                          <span className={`records-dot ${status}`} aria-hidden="true" />
                          <strong>{pupil.label}</strong>
                          <small>
                            {pupil.note ? `${pupil.note} · ` : ""}
                            {statusLabels[status]}
                          </small>
                        </button>
                      </li>
                    );
                  })}
                  {shownPupils.length === 0 && <li className="records-muted">모든 학생의 문장을 썼습니다.</li>}
                </ul>
                {orphanPupils.length > 0 && (
                  <>
                    <h4>
                      명단에 없는 학생 기록{" "}
                      <HelpTip>
                        명렬·명단에서 번호나 이름이 바뀌었거나 빠진 학생의 기록입니다. 눌러서 다른 학생에게 옮기거나
                        지울 수 있습니다.
                      </HelpTip>
                    </h4>
                    <ul>
                      {orphanPupils.map((pupil) => (
                        <li key={pupil.key}>
                          <button
                            className={pupil.key === selectedKey ? "active orphan" : "orphan"}
                            onClick={() => setSelectedKey(pupil.key)}
                          >
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
                  reference={
                    area === "subject" && target.roster ? (
                      <AssessmentReference
                        assessments={assessments}
                        roster={target.roster}
                        pupil={selected}
                        subject={slot.subject}
                      />
                    ) : null
                  }
                />
              ) : (
                <section className="panel records-empty">
                  <p>왼쪽에서 학생을 골라 주세요.</p>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
