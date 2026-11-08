import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  DeleteRecordEntry,
  DeleteRecordList,
  DeleteRecordYear,
  GetRecordBook,
  ListAssessments,
  ListCourseRosters,
  SaveRecordEntry,
  SaveRecordLimits,
  SaveRecordList,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpGuide } from "../shared/HelpGuide";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { registerPendingSave } from "../shared/pendingSaves";
import { rosterLabel } from "../timetable/timetableState";
import { courseKey } from "../grouping/groupingState";
import {
  areaLabels,
  availableTargets,
  checkText,
  entryStatus,
  measure,
  memberKey,
  parseMembers,
  progress,
  recordYears,
  sortMembers,
  statusLabels,
  visibleTabs,
  type Area,
  type EntryStatus,
  type ParsedMember,
  type TabKey,
  type TargetKind,
} from "./recordsState";
import "./records-page.css";

type Pupil = { key: string; label: string; name: string; number: string; note?: string };
type Slot = { schoolYear: string; area: Area; targetKind: TargetKind; targetId: string; subject: string };
type Target = { value: string; kind: TargetKind; id: string; label: string; pupils: Pupil[]; roster?: models.CourseRoster };

const defaultSubject = "과목";

function slotOf(entry: models.RecordEntry): string {
  return [entry.schoolYear, entry.area, entry.targetKind, entry.targetId, entry.subject].join("\u0000");
}

function slotKey(slot: Slot): string {
  return [slot.schoolYear, slot.area, slot.targetKind, slot.targetId, slot.area === "subject" ? slot.subject : ""].join("\u0000");
}

// sameText는 보관함이 저장하는 방식(앞뒤 공백 제거·줄바꿈 통일)으로 두 문장을 비교합니다.
function sameText(draft: string, stored: string) {
  return draft.replace(/\r\n?/g, "\n").trim() === stored;
}

function trimNumber(value: string | number) {
  return String(value).trim().replace(/^0+(?=\d)/, "");
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function RecordsPage({
  students,
  config,
  isHomeroomTeacher,
}: {
  students: models.Student[];
  config: models.ClassConfig | null;
  isHomeroomTeacher: boolean;
}) {
  const [book, setBook] = useState<models.RecordBook | null>(null);
  const [rosters, setRosters] = useState<models.CourseRoster[]>([]);
  const [assessments, setAssessments] = useState<models.Assessment[]>([]);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const shownTabs = visibleTabs(isHomeroomTeacher);
  const [tabKey, setTabKey] = useState<TabKey>("subject");
  const tab = shownTabs.find((item) => item.key === tabKey) || shownTabs[0];
  const [creativeArea, setCreativeArea] = useState<Area>("autonomy");
  const area: Area = tab.key === "creative" ? creativeArea : tab.areas[0];
  const [year, setYear] = useState(config?.schoolYear || String(new Date().getFullYear()));
  const [targetValue, setTargetValue] = useState("");
  const [subject, setSubject] = useState((config?.teachingSubject || "").trim() || defaultSubject);
  const [selectedKey, setSelectedKey] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [listDialog, setListDialog] = useState<models.RecordActivityList | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);

  async function reload() {
    try {
      const [nextBook, nextRosters, nextAssessments] = await Promise.all([GetRecordBook(), ListCourseRosters(), ListAssessments()]);
      setBook(nextBook);
      setRosters(nextRosters || []);
      setAssessments(nextAssessments || []);
      setLoadError("");
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const years = useMemo(
    () =>
      recordYears(config?.schoolYear || "", [
        ...(book?.entries || []).map((entry) => entry.schoolYear),
        ...(book?.lists || []).map((list) => list.schoolYear),
        ...rosters.map((roster) => roster.schoolYear),
      ]),
    [book, rosters, config?.schoolYear],
  );

  const targets = useMemo<Target[]>(() => {
    const result: Target[] = [];
    for (const kind of availableTargets(tab, isHomeroomTeacher)) {
      if (kind === "homeroom") {
        const label = config?.grade && config?.classNumber ? `우리 반 (${config.grade}-${config.classNumber})` : "우리 반";
        const pupils = [...students]
          .sort((a, b) => a.number - b.number)
          .map((student) => ({ key: student.id, label: `${student.number}번 ${student.name}`, name: student.name, number: String(student.number) }));
        result.push({ value: "homeroom", kind, id: "", label, pupils });
      }
      if (kind === "course") {
        rosters
          .filter((roster) => roster.schoolYear === year)
          .sort((a, b) => rosterLabel(a).localeCompare(rosterLabel(b), "ko", { numeric: true }))
          .forEach((roster) => {
            const pupils = [...roster.students]
              .sort((a, b) => Number(a.number) - Number(b.number))
              .map((student) => ({
                key: courseKey(student.number, student.name),
                label: `${student.number}번 ${student.name}`,
                name: student.name,
                number: student.number,
                note: student.status === "전출" ? "전출" : undefined,
              }));
            result.push({ value: `course:${roster.id}`, kind, id: roster.id, label: `수업 반 ${rosterLabel(roster)}`, pupils, roster });
          });
      }
      if (kind === "list") {
        (book?.lists || [])
          .filter((list) => list.schoolYear === year)
          .sort((a, b) => a.name.localeCompare(b.name, "ko"))
          .forEach((list) => {
            const pupils = sortMembers(list.members).map((member) => ({
              key: memberKey(member),
              label: `${member.grade}-${member.className} ${member.number}번 ${member.name}`,
              name: member.name,
              number: member.number,
            }));
            result.push({ value: `list:${list.id}`, kind, id: list.id, label: `활동 명단 · ${list.name}`, pupils });
          });
      }
    }
    return result;
  }, [tab, isHomeroomTeacher, students, rosters, book, year, config?.grade, config?.classNumber]);

  const target = targets.find((item) => item.value === targetValue) || targets[0];

  useEffect(() => {
    if (target && target.value !== targetValue) setTargetValue(target.value);
  }, [target, targetValue]);

  const slot: Slot | null = target
    ? { schoolYear: year, area, targetKind: target.kind, targetId: target.id, subject: area === "subject" ? subject.trim() || defaultSubject : "" }
    : null;

  const slotEntries = useMemo(() => {
    const map = new Map<string, models.RecordEntry>();
    if (!slot || !book) return map;
    const key = slotKey(slot);
    book.entries.filter((entry) => slotOf(entry) === key).forEach((entry) => map.set(entry.studentKey, entry));
    return map;
  }, [book, slot && slotKey(slot)]);

  const pupils = target?.pupils || [];
  const orphanEntries = useMemo(() => {
    const keys = new Set(pupils.map((pupil) => pupil.key));
    return [...slotEntries.values()].filter((entry) => !keys.has(entry.studentKey));
  }, [slotEntries, pupils]);

  const statuses = pupils.map((pupil) => entryStatus(slotEntries.get(pupil.key)));
  const counts = progress(statuses);
  const shownPupils = pupils.filter((pupil, index) => !onlyMissing || statuses[index] === "empty" || statuses[index] === "memo");
  const orphanPupils: Pupil[] = orphanEntries.map((entry) => ({
    key: entry.studentKey,
    label: target?.kind === "homeroom" ? "삭제된 학생" : entry.studentKey.replace("|", " "),
    name: entry.studentKey.split("|")[1] || "",
    number: "",
    note: "명단에 없음",
  }));
  const selectable = [...shownPupils, ...orphanPupils];
  const selected = selectable.find((pupil) => pupil.key === selectedKey) || null;

  useEffect(() => {
    if (!selected && selectable.length > 0) setSelectedKey(selectable[0].key);
  }, [selected, selectable.length, target?.value, area]);

  const subjectSuggestions = useMemo(() => {
    const values = new Set<string>();
    if (config?.teachingSubject?.trim()) values.add(config.teachingSubject.trim());
    (book?.entries || []).filter((entry) => entry.area === "subject").forEach((entry) => values.add(entry.subject));
    if (target?.roster) {
      assessments
        .filter((item) => item.grade === target.roster?.grade && item.className === target.roster?.className)
        .forEach((item) => item.subject.trim() && values.add(item.subject.trim()));
    }
    return [...values];
  }, [book, assessments, target?.roster, config?.teachingSubject]);

  // 환경 설정에 담당 교과가 없으면 이 반 수행평가의 과목 이름을 기본값으로 쓴다
  useEffect(() => {
    if (subject === defaultSubject && subjectSuggestions.length > 0) setSubject(subjectSuggestions[0]);
  }, [subject, subjectSuggestions]);

  function onSaved(saved: models.RecordEntry) {
    setBook((current) => {
      if (!current) return current;
      const entries = current.entries.filter((entry) => entry.id !== saved.id);
      entries.push(saved);
      return new models.RecordBook({ ...current, entries });
    });
  }

  function onDeleted(id: string) {
    setBook((current) => (current ? new models.RecordBook({ ...current, entries: current.entries.filter((entry) => entry.id !== id) }) : current));
  }

  function moveSelection(step: number) {
    const index = selectable.findIndex((pupil) => pupil.key === selectedKey);
    const next = selectable[index + step];
    if (next) setSelectedKey(next.key);
  }

  const limit = book?.limits?.[area] || 500;
  const allNames = useMemo(() => {
    const names = new Set<string>();
    students.forEach((student) => names.add(student.name));
    pupils.forEach((pupil) => pupil.name && names.add(pupil.name));
    return [...names];
  }, [students, pupils]);

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
            aria-selected={item.key === tab.key}
            className={item.key === tab.key ? "active" : ""}
            onClick={() => {
              setTabKey(item.key);
              setSelectedKey("");
            }}
          >
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </div>

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

      {notice && <p className="records-notice" role="status">{notice}</p>}

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
          onDone={async (deletedYear, removed) => {
            setCleanupOpen(false);
            setNotice(`${deletedYear}학년도 기록 ${removed}건과 활동 명단을 지웠습니다.`);
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

type SaveState = "saved" | "dirty" | "saving" | "error";

function EntryEditor({
  slot,
  pupil,
  entry,
  isOrphan,
  moveTargets,
  limit,
  names,
  onSaved,
  onDeleted,
  onMove,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  reference,
}: {
  slot: Slot;
  pupil: { key: string; label: string; name: string };
  entry: models.RecordEntry | undefined;
  isOrphan: boolean;
  moveTargets: { key: string; label: string }[];
  limit: number;
  names: string[];
  onSaved: (entry: models.RecordEntry) => void;
  onDeleted: (id: string) => void;
  onMove: (key: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  reference: React.ReactNode;
}) {
  const [text, setText] = useState(entry?.text || "");
  const [memoDraft, setMemoDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied] = useState("");
  const [moveKey, setMoveKey] = useState("");
  const latest = useRef<models.RecordEntry | undefined>(entry);
  const textRef = useRef(text);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | undefined>(undefined);
  const current = latest.current || entry;
  const status: EntryStatus = entryStatus(current ? { ...current, text } : { text, reviewed: false, memos: [] });
  const info = measure(text, limit);
  const warnings = checkText(text, names);

  function build(base: models.RecordEntry | undefined, patch: Partial<models.RecordEntry>) {
    return new models.RecordEntry({
      schoolYear: slot.schoolYear,
      area: slot.area,
      targetKind: slot.targetKind,
      targetId: slot.targetId,
      subject: slot.subject,
      studentKey: pupil.key,
      memos: [],
      text: "",
      reviewed: false,
      ...(base || {}),
      ...patch,
      // 문장이 바뀌면 검토 완료 표시는 풀린다
      ...(base && patch.text !== undefined && patch.reviewed === undefined && !sameText(patch.text, base.text) ? { reviewed: false } : {}),
    });
  }

  function persist(change: (base: models.RecordEntry | undefined) => models.RecordEntry | null) {
    queue.current = queue.current.then(async () => {
      const next = change(latest.current);
      if (!next) {
        setSaveState(sameText(textRef.current, latest.current?.text || "") ? "saved" : "dirty");
        return;
      }
      setSaveState("saving");
      try {
        const saved = await SaveRecordEntry(next);
        latest.current = saved;
        onSaved(saved);
        setSaveError("");
        setSaveState(sameText(textRef.current, saved.text) ? "saved" : "dirty");
      } catch (error) {
        setSaveError(errorMessage(error));
        setSaveState("error");
      }
    });
    return queue.current;
  }

  function saveText() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    return persist((base) => {
      const value = textRef.current;
      if (!base && !value.trim()) return null;
      if (base && sameText(value, base.text)) return null;
      return build(base, { text: value, reviewed: false });
    });
  }

  useEffect(() => {
    // 화면 잠금 직전에 아직 저장하지 않은 문장을 저장한다
    const unregister = registerPendingSave(async () => {
      if (timer.current !== undefined) await saveText();
      await queue.current;
    });
    return () => {
      unregister();
      if (timer.current !== undefined) void saveText();
    };
  }, []);

  function changeText(value: string) {
    setText(value);
    textRef.current = value;
    setSaveState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void saveText(), 900);
  }

  function addMemo() {
    const value = memoDraft.trim();
    if (!value) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
    void persist((base) => build(base, { memos: [...(base?.memos || []), new models.RecordMemo({ text: value })], text: textRef.current })).then(() => setMemoDraft(""));
  }

  async function removeMemo(id: string) {
    const ok = await confirmWithRadix({ title: "관찰 메모를 지울까요?", description: "지운 메모는 되살릴 수 없습니다.", actionLabel: "메모 지우기" });
    if (!ok) return;
    void persist((base) => (base ? build(base, { memos: base.memos.filter((memo) => memo.id !== id), text: textRef.current }) : null));
  }

  function toggleReviewed() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    void persist((base) => build(base, { text: textRef.current, reviewed: !(base?.reviewed && sameText(textRef.current, base.text)) }));
  }

  async function removeEntry() {
    const target = latest.current;
    if (!target) return;
    const ok = await confirmWithRadix({
      title: `${pupil.label} 학생의 이 영역 기록을 지울까요?`,
      description: "관찰 메모와 기재 문장이 모두 지워지며 되살릴 수 없습니다.",
      actionLabel: "기록 지우기",
    });
    if (!ok) return;
    try {
      await queue.current;
      await DeleteRecordEntry(target.id);
      onDeleted(target.id);
    } catch (error) {
      setSaveError(errorMessage(error));
      setSaveState("error");
    }
  }

  function moveEntry() {
    if (!moveKey) return;
    void persist((base) => (base ? build(base, { studentKey: moveKey, text: textRef.current }) : null)).then(() => {
      if (latest.current?.studentKey === moveKey) onMove(moveKey);
    });
  }

  async function copy() {
    const value = textRef.current.trim();
    if (!value) return;
    const ok = await copyText(value);
    setCopied(ok ? "복사했습니다. 나이스에 붙여 넣은 뒤 다른 내용을 복사해 두세요." : "복사하지 못했습니다. 문장을 직접 선택해 복사해 주세요.");
    window.setTimeout(() => setCopied(""), 4000);
  }

  const memos = current?.memos || [];
  const reviewed = Boolean(current?.reviewed && sameText(text, current.text));

  return (
    <section
      className="panel records-editor"
      aria-label={`${pupil.label} ${areaLabels[slot.area]}`}
      onKeyDown={(event) => {
        if (event.altKey && event.key === "ArrowDown") {
          event.preventDefault();
          onNext();
        }
        if (event.altKey && event.key === "ArrowUp") {
          event.preventDefault();
          onPrev();
        }
      }}
    >
      <header className="records-editor-head">
        <div>
          <p className="eyebrow">{areaLabels[slot.area]}{slot.area === "subject" ? ` · ${slot.subject}` : ""}</p>
          <h3>{pupil.label}</h3>
        </div>
        <div className="records-editor-nav">
          <span className={`records-save ${saveState}`} role="status">
            {saveState === "saved" ? (current ? "저장됨" : "") : saveState === "saving" ? "저장 중…" : saveState === "dirty" ? "입력 중" : "저장 실패"}
          </span>
          <button className="quiet-button" onClick={onPrev} disabled={!hasPrev} title="이전 학생 (Alt+↑)">◀ 이전</button>
          <button className="quiet-button" onClick={onNext} disabled={!hasNext} title="다음 학생 (Alt+↓)">다음 ▶</button>
        </div>
      </header>
      {saveError && <p className="records-error" role="alert">{saveError}</p>}

      {isOrphan && (
        <div className="records-orphan">
          <p>이 기록의 학생({pupil.label})은 지금 명단에 없습니다. 번호·이름이 바뀐 학생이라면 옮기고, 필요 없으면 지워 주세요.</p>
          <div>
            <select value={moveKey} onChange={(event) => setMoveKey(event.target.value)} aria-label="옮길 학생">
              <option value="">옮길 학생 고르기</option>
              {moveTargets.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <button className="quiet-button" disabled={!moveKey} onClick={moveEntry}>이 학생에게 옮기기</button>
          </div>
        </div>
      )}

      <div className="records-memos">
        <h4>관찰 메모(누가기록) <small>{memos.length}개</small> <HelpTip>학기 중에 본 것을 짧게 남깁니다. 학생부에 바로 옮겨지지 않고, 기재 문장을 쓸 때 참고합니다. 날짜가 필요하면 메모 안에 쓰세요.</HelpTip></h4>
        {memos.length > 0 ? (
          <ol>
            {memos.map((memo) => (
              <li key={memo.id}>
                <p>{memo.text}</p>
                <button className="text-button" onClick={() => void removeMemo(memo.id)} aria-label="메모 지우기">지우기</button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="records-muted">아직 메모가 없습니다.</p>
        )}
        <div className="records-memo-form">
          <textarea
            value={memoDraft}
            maxLength={1000}
            rows={2}
            placeholder="예: 3/16 모둠 활동에서 친구들의 의견을 정리해 발표함"
            onChange={(event) => setMemoDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                event.preventDefault();
                addMemo();
              }
            }}
            aria-label="새 관찰 메모"
          />
          <button className="quiet-button" onClick={addMemo} disabled={!memoDraft.trim()} title="Ctrl+Enter">메모 추가</button>
        </div>
      </div>

      <div className="records-text">
        <div className="records-text-head">
          <h4>기재 문장 <HelpTip>입력을 멈추면 잠시 뒤 자동 저장됩니다. 나이스 바이트는 한글 3, 영문·숫자·공백 1, 줄바꿈 2로 셉니다.</HelpTip></h4>
          <span className={info.over ? "records-count over" : "records-count"} aria-live="polite">
            {info.chars.toLocaleString()}자 · {info.bytes.toLocaleString()} / {info.limitBytes.toLocaleString()}바이트
            {info.over ? ` (${(info.bytes - info.limitBytes).toLocaleString()}바이트 초과)` : ""}
          </span>
        </div>
        <textarea
          className={info.over ? "over" : ""}
          value={text}
          rows={8}
          maxLength={4000}
          onChange={(event) => changeText(event.target.value)}
          onBlur={() => {
            if (timer.current !== undefined) void saveText();
          }}
          placeholder="학생부에 옮겨 적을 문장을 씁니다. 학생 이름은 쓰지 않습니다."
          aria-label="기재 문장"
          aria-invalid={info.over}
        />
        {warnings.length > 0 && (
          <ul className="records-warnings" aria-label="문장 점검">
            {warnings.map((warning) => (
              <li key={warning.message} className={warning.kind}>{warning.message}</li>
            ))}
          </ul>
        )}
        <div className="records-text-actions">
          <button className="primary-button" onClick={() => void copy()} disabled={!text.trim()}>복사</button>
          <button className={reviewed ? "quiet-button reviewed" : "quiet-button"} onClick={toggleReviewed} disabled={!text.trim()} aria-pressed={reviewed}>
            {reviewed ? "✓ 검토 완료" : "검토 완료 표시"}
          </button>
          <span className="records-status-label">{statusLabels[status]}</span>
          {current && (
            <button className="text-button danger-text" onClick={() => void removeEntry()}>이 기록 지우기</button>
          )}
        </div>
        {copied && <p className="records-notice" role="status">{copied}</p>}
      </div>

      {reference}
    </section>
  );
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function AssessmentReference({
  assessments,
  roster,
  pupil,
  subject,
}: {
  assessments: models.Assessment[];
  roster: models.CourseRoster;
  pupil: { name: string; number: string };
  subject: string;
}) {
  const matches = assessments
    .filter((item) => (item.schoolYear || roster.schoolYear) === roster.schoolYear && item.grade === roster.grade && item.className === roster.className)
    .map((item) => {
      const student = item.students.find((candidate) => trimNumber(candidate.number) === trimNumber(pupil.number) && candidate.name.trim() === pupil.name.trim());
      const score = student ? item.scores.find((candidate) => candidate.studentId === student.id) : undefined;
      return { item, student, score };
    })
    .filter((match) => match.student)
    .sort((a, b) => Number(b.item.subject.trim() === subject) - Number(a.item.subject.trim() === subject));
  return (
    <details className="records-reference">
      <summary>수행평가 참고 <small>({matches.length}개 평가 · 읽기 전용)</small></summary>
      {matches.length === 0 ? (
        <p className="records-muted">이 반·이 학생의 수행평가 기록이 없습니다. 평가 관리에서 나이스 수행평가 파일을 가져오면 여기에 보입니다.</p>
      ) : (
        matches.map(({ item, score }) => (
          <div key={item.id} className="records-reference-item">
            <strong>{item.title || "수행평가"} <small>{item.subject}{item.semester ? ` · ${item.semester}학기` : ""}</small></strong>
            <ul>
              {item.domains.map((domain) => {
                const domainScore = score?.domains.find((candidate) => candidate.domainId === domain.id);
                const criteria = domain.criteria
                  .map((criterion) => ({ criterion, value: domainScore?.criteria.find((candidate) => candidate.criterionId === criterion.id) }))
                  .filter(({ value }) => value && (value.score !== null || value.reason));
                return (
                  <li key={domain.id}>
                    <span>{domain.name}</span> <b>{formatScore(domainScore?.importedScore)} / {formatScore(domain.maxScore)}</b>
                    {criteria.length > 0 && (
                      <ul>
                        {criteria.map(({ criterion, value }) => (
                          <li key={criterion.id}>
                            {criterion.name} {formatScore(value?.score)}점{value?.reason ? ` — ${value.reason}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            {(score?.note || score?.deduction) && <p className="records-muted">{[score?.note, score?.deduction].filter(Boolean).join(" · ")}</p>}
          </div>
        ))
      )}
    </details>
  );
}

function ListDialog({
  list,
  onClose,
  onSaved,
  onDeleted,
}: {
  list: models.RecordActivityList;
  onClose: () => void;
  onSaved: (list: models.RecordActivityList) => void;
  onDeleted: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(list.name);
  const [members, setMembers] = useState<ParsedMember[]>(sortMembers(list.members));
  const [paste, setPaste] = useState("");
  const [one, setOne] = useState<ParsedMember>({ grade: "", className: "", number: "", name: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  function addMembers(next: ParsedMember[]) {
    const keys = new Set(members.map(memberKey));
    const added = next.filter((member) => !keys.has(memberKey(member)));
    setMembers(sortMembers([...members, ...added]));
    return { added: added.length, skipped: next.length - added.length };
  }

  function applyPaste() {
    const result = parseMembers(paste);
    const { added, skipped } = addMembers(result.members);
    const parts = [`${added}명을 넣었습니다.`];
    if (skipped) parts.push(`이미 있는 ${skipped}명은 건너뛰었습니다.`);
    if (result.errors.length) parts.push(result.errors.slice(0, 3).join(" "));
    setMessage(parts.join(" "));
    if (result.errors.length === 0) setPaste("");
  }

  function addOne() {
    const member = {
      grade: one.grade.trim(),
      className: one.className.trim(),
      number: one.number.trim().replace(/^0+(?=\d)/, ""),
      name: one.name.trim(),
    };
    if (!member.grade || !member.className || !member.number || !member.name) {
      setMessage("학년·반·번호·이름을 모두 입력해 주세요.");
      return;
    }
    const { added } = addMembers([member]);
    setMessage(added ? "" : "이미 명단에 있는 학생입니다.");
    if (added) setOne({ grade: member.grade, className: member.className, number: "", name: "" });
  }

  async function save() {
    setBusy(true);
    try {
      const saved = await SaveRecordList(new models.RecordActivityList({ ...list, name, members }));
      onSaved(saved);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await DeleteRecordList(list.id, confirmation);
      await onDeleted(list.name);
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content records-dialog">
          <Dialog.Title>{list.id ? "활동 명단 고치기" : "활동 명단 만들기"} · {list.schoolYear}학년도</Dialog.Title>
          <Dialog.Description className="records-dialog-description">
            동아리처럼 여러 반 학생이 섞인 명단입니다. 학년·반·번호·이름만 저장합니다(생년월일·연락처는 넣지 않음). 명단에서 학생을 빼도 이미 쓴 기록은 "명단에 없는 학생"으로 남습니다.
          </Dialog.Description>
          <label className="records-field">
            명단 이름
            <input value={name} maxLength={40} placeholder="예: 과학탐구 동아리" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="records-field">
            <span>붙여 넣기 <HelpTip>엑셀에서 학년·반·번호·이름 네 칸을 복사해 붙여 넣거나, 한 줄에 한 명씩 "2-3-15 홍길동" 또는 "20315 홍길동"처럼 씁니다.</HelpTip></span>
            <textarea rows={4} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={"2\t3\t15\t홍길동\n1-2-7 김가상\n20301 이나상"} />
          </label>
          <div className="records-dialog-row">
            <button className="quiet-button" onClick={applyPaste} disabled={!paste.trim()}>붙여 넣은 학생 넣기</button>
          </div>
          <div className="records-one" aria-label="한 명씩 넣기">
            <input aria-label="학년" placeholder="학년" value={one.grade} inputMode="numeric" onChange={(event) => setOne({ ...one, grade: event.target.value })} />
            <input aria-label="반" placeholder="반" value={one.className} onChange={(event) => setOne({ ...one, className: event.target.value })} />
            <input aria-label="번호" placeholder="번호" value={one.number} inputMode="numeric" onChange={(event) => setOne({ ...one, number: event.target.value })} />
            <input aria-label="이름" placeholder="이름" value={one.name} onChange={(event) => setOne({ ...one, name: event.target.value })} onKeyDown={(event) => event.key === "Enter" && addOne()} />
            <button className="quiet-button" onClick={addOne}>한 명 넣기</button>
          </div>
          {message && <p className="records-notice" role="status">{message}</p>}
          <div className="records-member-list">
            <strong>명단 {members.length}명</strong>
            {members.length === 0 ? (
              <p className="records-muted">아직 학생이 없습니다.</p>
            ) : (
              <ul>
                {members.map((member) => (
                  <li key={memberKey(member)}>
                    {member.grade}-{member.className} {member.number}번 {member.name}
                    <button className="text-button" aria-label={`${member.name} 빼기`} onClick={() => setMembers(members.filter((item) => memberKey(item) !== memberKey(member)))}>빼기</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="dialog-actions">
            {list.id && (
              <button className="danger-button records-left" onClick={() => setDeleteOpen(true)} disabled={busy}>명단 삭제</button>
            )}
            <Dialog.Close asChild>
              <button className="quiet-button" disabled={busy}>취소</button>
            </Dialog.Close>
            <button className="primary-button" onClick={() => void save()} disabled={busy || !name.trim()}>저장</button>
          </div>
          <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="dialog-overlay" />
              <AlertDialog.Content className="dialog-content records-dialog">
                <AlertDialog.Title>활동 명단 '{list.name}'을 삭제할까요?</AlertDialog.Title>
                <AlertDialog.Description>이 명단과, 이 명단으로 쓴 모든 학생의 관찰 메모·기재 문장이 함께 지워지며 되살릴 수 없습니다.</AlertDialog.Description>
                <label className="records-field">
                  확인 문구: 활동 명단 삭제
                  <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                </label>
                <div className="dialog-actions">
                  <AlertDialog.Cancel asChild>
                    <button className="quiet-button">취소</button>
                  </AlertDialog.Cancel>
                  <button className="danger-button" disabled={busy || confirmation !== "활동 명단 삭제"} onClick={() => void remove()}>삭제</button>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const limitAreas: Area[] = ["subject", "autonomy", "club", "career", "behavior", "freeSemester"];

function LimitsDialog({ limits, onClose, onSaved }: { limits: Record<string, number>; onClose: () => void; onSaved: (limits: Record<string, number>) => void }) {
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(limitAreas.map((area) => [area, String(limits[area] || "")])));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const next: Record<string, number> = {};
      for (const area of limitAreas) next[area] = Number(values[area]);
      const saved = await SaveRecordLimits(next);
      onSaved(saved);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content records-dialog">
          <Dialog.Title>영역별 글자 수 한도</Dialog.Title>
          <Dialog.Description className="records-dialog-description">
            나이스 한도는 한글 기준 글자 수의 3배 바이트입니다. 기본값은 교과세특·자율·동아리 500자, 진로 700자, 행동특성 300자, 자유학기 500자입니다. 올해 학교 기재요령과 다르면 바꿔 주세요.
          </Dialog.Description>
          <div className="records-limits">
            {limitAreas.map((area) => (
              <label key={area} className="records-field">
                {areaLabels[area]}
                <span className="records-limit-input">
                  <input type="text" inputMode="numeric" value={values[area]} onChange={(event) => setValues({ ...values, [area]: event.target.value.replace(/\D/g, "") })} />자
                  <small>{(Number(values[area] || 0) * 3).toLocaleString()}바이트</small>
                </span>
              </label>
            ))}
          </div>
          {message && <p className="records-error" role="alert">{message}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button" disabled={busy}>취소</button>
            </Dialog.Close>
            <button className="primary-button" onClick={() => void save()} disabled={busy}>저장</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function YearCleanupDialog({ book, onClose, onDone }: { book: models.RecordBook; onClose: () => void; onDone: (year: string, removed: number) => Promise<void> }) {
  const summary = useMemo(() => {
    const map = new Map<string, { entries: number; lists: number }>();
    book.entries.forEach((entry) => {
      const item = map.get(entry.schoolYear) || { entries: 0, lists: 0 };
      item.entries += 1;
      map.set(entry.schoolYear, item);
    });
    book.lists.forEach((list) => {
      const item = map.get(list.schoolYear) || { entries: 0, lists: 0 };
      item.lists += 1;
      map.set(list.schoolYear, item);
    });
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [book]);
  const [year, setYear] = useState(summary[summary.length - 1]?.[0] || "");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const removed = await DeleteRecordYear(year, confirmation);
      await onDone(year, removed);
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content records-dialog">
          <AlertDialog.Title>학년도 기록 정리</AlertDialog.Title>
          <AlertDialog.Description>
            학생부 마감이 끝난 학년도의 관찰 메모·기재 문장·활동 명단을 한꺼번에 지웁니다. 지운 기록은 되살릴 수 없으니, 필요하면 먼저 환경 설정에서 암호화 백업을 저장해 두세요.
          </AlertDialog.Description>
          {summary.length === 0 ? (
            <p className="records-muted">지울 기록이 없습니다.</p>
          ) : (
            <>
              <ul className="records-year-summary">
                {summary.map(([item, count]) => (
                  <li key={item}>
                    <label>
                      <input type="radio" name="records-year" checked={year === item} onChange={() => setYear(item)} /> {item}학년도 — 기록 {count.entries}건 · 활동 명단 {count.lists}개
                    </label>
                  </li>
                ))}
              </ul>
              <label className="records-field">
                확인 문구: 학년도 기록 삭제
                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
              </label>
            </>
          )}
          {message && <p className="records-error" role="alert">{message}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button className="quiet-button" disabled={busy}>닫기</button>
            </AlertDialog.Cancel>
            {summary.length > 0 && (
              <button className="danger-button" disabled={busy || !year || confirmation !== "학년도 기록 삭제"} onClick={() => void remove()}>{year}학년도 기록 삭제</button>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
