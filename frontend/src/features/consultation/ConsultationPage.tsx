import { FormEvent, useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DeleteConsultation, GetStudentPhoto, ListAllConsultations, SaveConsultation, SetConsultationFollowUpDone } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import "./consultation.css";

import { errorMessage, todayLocal } from "../shared/format";
type ConsultationConfirm = (request: { title: string; description: string }) => Promise<boolean>;

const firstTypes = ["학생 상담", "보호자 통화", "보호자 면담", "교사 확인", "기타", "후속 조치"];
const followTypes = ["학생 재상담", "보호자 통화", "보호자 면담", "교사 확인", "조치 결과", "기타"];

type Draft = { date: string; type: string; content: string; followUpDate: string };

function emptyDraft(type = "학생 상담"): Draft {
  return { date: todayLocal(), type, content: "", followUpDate: "" };
}

function shortDate(value: string) {
  return value ? `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일` : "";
}

// FollowUpStatus는 다음 확인 예정일의 상태(예정·지남·확인 완료)를 보여 준다.
function FollowUpStatus({ item }: { item: models.Consultation }) {
  if (!item.followUpDate) return null;
  if (item.followUpDone)
    return <span className="consult-status done">✓ 확인 완료{item.manualDone ? "" : " (후속 기록)"} · 예정 {shortDate(item.followUpDate)}</span>;
  if (item.followUpDate < todayLocal()) return <span className="consult-status overdue">확인 지남 · {shortDate(item.followUpDate)}</span>;
  return <span className="consult-status planned">다음 확인 {shortDate(item.followUpDate)}</span>;
}

export type ConsultationPageProps = {
  students: models.Student[];
  openStudent: (student: models.Student) => void;
  initialStudentID?: string;
  formatRecordedAt: (value: string) => string;
  confirm: ConsultationConfirm;
};

export function ConsultationPage({
  students,
  openStudent,
  initialStudentID = "",
  formatRecordedAt,
  confirm,
}: ConsultationPageProps) {
  const [items, setItems] = useState<models.Consultation[]>([]);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [selectedID, setSelectedID] = useState(initialStudentID);
  const [mode, setMode] = useState<"write" | "view">(
    initialStudentID ? "view" : "write",
  );
  const [dialogOpen, setDialogOpen] = useState(Boolean(initialStudentID));
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editing, setEditing] = useState<models.Consultation | null>(null);
  const [followTarget, setFollowTarget] = useState<models.Consultation | null>(
    null,
  );
  const [followDraft, setFollowDraft] = useState<Draft>(emptyDraft(followTypes[0]));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const selected =
    students.find((student) => student.id === selectedID) || null;
  const records = useMemo(
    () => items.filter((item) => item.studentId === selectedID),
    [items, selectedID],
  );
  const roots = useMemo(
    () =>
      records
        .filter((item) => !item.parentId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  async function reload() {
    try {
      setItems((await ListAllConsultations()) || []);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all(
      students
        .filter((student) => student.hasPhoto)
        .map(
          async (student) =>
            [student.id, await GetStudentPhoto(student.id)] as const,
        ),
    )
      .then(
        (values) =>
          active &&
          setPhotos(Object.fromEntries(values.filter(([, photo]) => photo))),
      )
      .catch(() => active && setPhotos({}));
    return () => {
      active = false;
    };
  }, [students]);
  function choose(id: string, nextMode: "write" | "view") {
    setSelectedID(id);
    setMode(nextMode);
    // 다른 학생 창에 쓰던 내용이 남지 않도록 매번 비운다
    setDraft(emptyDraft());
    setEditing(null);
    setFollowTarget(null);
    setFollowDraft(emptyDraft(followTypes[0]));
    setNotice("");
    setDialogOpen(true);
  }
  function changeDialogOpen(open: boolean) {
    if (!open && busy) return;
    setDialogOpen(open);
    if (!open) {
      setDraft(emptyDraft());
      setEditing(null);
      setFollowTarget(null);
      setFollowDraft(emptyDraft(followTypes[0]));
      setNotice("");
    }
  }
  function descendants(parent: models.Consultation) {
    const result: models.Consultation[] = [];
    const visit = (id: string) =>
      records
        .filter((item) => item.parentId === id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((item) => {
          result.push(item);
          visit(item.id);
        });
    visit(parent.id);
    return result;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      setBusy(true);
      const base = editing
        ? { ...editing, ...draft, studentId: selected.id }
        : { ...draft, studentId: selected.id };
      await SaveConsultation(new models.Consultation(base));
      setDraft(emptyDraft());
      setEditing(null);
      await reload();
      setNotice(
        editing ? "상담 기록을 수정했습니다." : "상담 기록을 저장했습니다.",
      );
      setMode("view");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function saveFollow(event: FormEvent) {
    event.preventDefault();
    if (!followTarget || !followDraft.content.trim()) return;
    try {
      setBusy(true);
      await SaveConsultation(
        new models.Consultation({
          studentId: followTarget.studentId,
          parentId: followTarget.id,
          ...followDraft,
        }),
      );
      const rootID = followTarget.rootId || followTarget.id;
      setFollowTarget(null);
      setFollowDraft(emptyDraft(followTypes[0]));
      await reload();
      setExpanded((value) => ({ ...value, [rootID]: true }));
      setNotice("후속 기록을 저장했습니다. 앞 기록은 확인 완료로 바뀌었습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: models.Consultation) {
    const count = descendants(item).length + 1;
    const accepted = await confirm({
      title: "상담 기록을 삭제할까요?",
      description: `선택한 기록${count > 1 ? `과 연결된 후속 기록 ${count - 1}건` : ""}을 삭제합니다. 삭제한 기록은 되돌릴 수 없습니다.`,
    });
    if (!accepted) return;
    try {
      setBusy(true);
      await DeleteConsultation(item.id);
      await reload();
      setNotice(`상담 기록 ${count}건을 삭제했습니다.`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function markDone(item: models.Consultation, done: boolean) {
    try {
      setBusy(true);
      await SetConsultationFollowUpDone(item.id, done);
      await reload();
      setNotice(done ? "후속 기록 없이 확인 완료로 표시했습니다." : "확인 완료 표시를 취소했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function startFollow(item: models.Consultation) {
    setFollowTarget(item);
    setFollowDraft(emptyDraft(followTypes[0]));
    setNotice("");
  }
  function startEdit(item: models.Consultation) {
    setEditing(item);
    setDraft({
      date: item.date,
      type: item.type,
      content: item.content,
      followUpDate: item.followUpDate || "",
    });
    setMode("write");
  }
  return (
    <>
      <section className="page-intro">
        <div>
          <p className="eyebrow">학생별 누적 기록</p>
          <h2>상담 기록</h2>
          <p>학생을 선택했을 때만 해당 학생의 상담 기록을 작성·조회합니다.</p>
        </div>
      </section>
      <HelpGuide
        title="상담 기록 처음 사용 안내"
        description="학생 카드를 먼저 선택해 해당 학생의 상담 흐름만 기록·조회합니다. 상담 내용은 교사 프로그램의 암호화 보관함에만 저장됩니다."
        steps={[
          {
            title: "학생 선택",
            detail: "학생 카드에서 상담 기록 또는 상담 조회를 선택하면 학생별 대화상자가 열립니다. 다른 학생의 기록은 함께 표시하지 않습니다.",
          },
          {
            title: "첫 상담 기록 저장",
            detail: "날짜·상담 종류·내용·필요한 후속 확인일을 입력해 저장합니다. 저장 뒤에는 해당 학생의 기록으로만 연결됩니다.",
          },
          {
            title: "후속 기록과 조회",
            detail:
              "원 상담에서 후속 기록을 이어 쓰고, 조회 화면에서 날짜·종류·내용과 연결 흐름을 확인합니다.",
          },
          {
            title: "수정·삭제 주의",
            detail:
              "수정은 해당 기록에만 적용됩니다. 원 상담을 삭제하면 연결된 후속 기록도 함께 삭제되며 되돌릴 수 없습니다.",
          },
        ]}
        note="상담 내용은 화면 공유·전자칠판·학생 기기에 표시하지 마세요. 작성 시각은 초 단위로 자동 기록됩니다."
      />
      {notice && !dialogOpen && <p className="app-toast">{notice}</p>}
      <section className="consultation-card-grid">
        {students
          .slice()
          .sort((a, b) => a.number - b.number)
          .map((student) => {
            const all = items.filter((item) => item.studentId === student.id);
            return (
              <article
                className={
                  selectedID === student.id
                    ? "consultation-student-card selected"
                    : "consultation-student-card"
                }
                key={student.id}
              >
                <button
                  className="consultation-student-main"
                  onClick={() => choose(student.id, "view")}
                >
                  <i className="student-card-photo">
                    {photos[student.id] ? (
                      <img src={photos[student.id]} alt="" />
                    ) : (
                      student.name[0]
                    )}
                  </i>
                  <span>
                    <b>
                      {String(student.number).padStart(2, "0")}번 {student.name}
                    </b>
                    <small>상담 기록 {all.length}건</small>
                  </span>
                </button>
                <div>
                  <button
                    className="quiet-button"
                    onClick={() => choose(student.id, "write")}
                  >
                    상담 기록
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => choose(student.id, "view")}
                  >
                    상담 조회
                  </button>
                </div>
              </article>
            );
          })}
      </section>
      <Dialog.Root open={dialogOpen} onOpenChange={changeDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content consultation-dialog-content">
            {selected && (
              <section className="panel consultation-card-detail consultation-dialog-detail">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {selected.number}번 {selected.name}
              </p>
              <Dialog.Title asChild>
                <h3>
                  {mode === "write"
                    ? editing
                      ? "상담 기록 수정"
                      : "새 상담 기록"
                    : "상담 조회"}
                </h3>
              </Dialog.Title>
              <Dialog.Description className="consultation-dialog-description">
                {selected.name} 학생의 상담 기록을 안전하게 작성하고 조회합니다.
              </Dialog.Description>
            </div>
            <div className="consultation-dialog-heading-actions">
              <button
                className="text-button"
                onClick={() => {
                  setDialogOpen(false);
                  openStudent(selected);
                }}
              >
                학생 상세정보 →
              </button>
              <Dialog.Close asChild>
                <button className="quiet-button" disabled={busy}>닫기</button>
              </Dialog.Close>
            </div>
          </div>
          {notice && (
            <p className="consultation-dialog-notice" role="status" aria-live="polite">{notice}</p>
          )}
          {mode === "write" ? (
            <form
              className="consultation-form consultation-inline-form"
              onSubmit={save}
              noValidate
            >
              <div className="form-grid">
                <label>
                  상담 날짜
                  <input
                    type="date"
                    value={draft.date}
                    onChange={(event) =>
                      setDraft({ ...draft, date: event.target.value })
                    }
                  />
                </label>
                <label>
                  상담 유형
                  <select
                    value={draft.type}
                    onChange={(event) =>
                      setDraft({ ...draft, type: event.target.value })
                    }
                  >
                    {[...new Set([...firstTypes, draft.type])].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                상담 내용
                <textarea
                  maxLength={5000}
                  value={draft.content}
                  onChange={(event) =>
                    setDraft({ ...draft, content: event.target.value })
                  }
                />
              </label>
              <label>
                다음 확인 예정일(선택)
                <input
                  type="date"
                  min={draft.date}
                  value={draft.followUpDate}
                  onChange={(event) =>
                    setDraft({ ...draft, followUpDate: event.target.value })
                  }
                />
              </label>
              <div className="consult-follow-actions">
                {editing && (
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => {
                      setEditing(null);
                      setMode("view");
                    }}
                  >
                    취소
                  </button>
                )}
                <button className="primary-button" disabled={busy}>
                  {busy
                    ? "저장 중입니다"
                    : editing
                      ? "수정 저장"
                      : "상담 기록 저장"}
                </button>
              </div>
            </form>
          ) : (
            <div className="consult-flow-list">
              {roots.length === 0 ? (
                <p className="empty-state">아직 작성한 상담 기록이 없습니다.</p>
              ) : (
                roots.map((root) => {
                  const replies = descendants(root);
                  const open = expanded[root.id];
                  return (
                    <article className="consult-flow" key={root.id}>
                      <header>
                        <time>
                          {root.date} · 기록 {formatRecordedAt(root.recordedAt)}
                        </time>
                        <span>{root.type}</span>
                        <FollowUpStatus item={root} />
                        <div>
                          {replies.length > 0 && (
                            <button
                              className="follow-count-badge"
                              onClick={() =>
                                setExpanded((value) => ({
                                  ...value,
                                  [root.id]: !open,
                                }))
                              }
                            >
                              후속 {replies.length}건 {open ? "▴" : "▾"}
                            </button>
                          )}
                        </div>
                      </header>
                      <p>{root.content}</p>
                      <div className="consult-record-actions">
                        <button
                          className="text-button"
                          onClick={() => startEdit(root)}
                        >
                          수정
                        </button>
                        <button
                          className="text-button danger-text-button"
                          onClick={() => void remove(root)}
                        >
                          삭제
                        </button>
                        <button
                          className="text-button consult-follow-button"
                          onClick={() => startFollow(root)}
                        >
                          ↳ 후속 기록
                        </button>
                        {root.followUpDate && !root.followUpDone && (
                          <button className="text-button consult-done-button" disabled={busy} onClick={() => void markDone(root, true)}>
                            ✓ 확인 완료
                          </button>
                        )}
                        {root.manualDone && (
                          <button className="text-button" disabled={busy} onClick={() => void markDone(root, false)}>
                            완료 취소
                          </button>
                        )}
                      </div>
                      {open &&
                        replies.map((reply) => (
                          <div className="consult-flow-reply" key={reply.id}>
                            <small>
                              {reply.date} · {reply.type} · 기록{" "}
                              {formatRecordedAt(reply.recordedAt)}
                            </small>{" "}
                            <FollowUpStatus item={reply} />
                            <p>{reply.content}</p>
                            <div className="consult-record-actions">
                              <button
                                className="text-button"
                                onClick={() => startEdit(reply)}
                              >
                                수정
                              </button>
                              <button
                                className="text-button danger-text-button"
                                onClick={() => void remove(reply)}
                              >
                                삭제
                              </button>
                        <button
                          className="text-button consult-follow-button"
                          onClick={() => startFollow(reply)}
                        >
                          ↳ 후속 기록
                        </button>
                        {reply.followUpDate && !reply.followUpDone && (
                          <button className="text-button consult-done-button" disabled={busy} onClick={() => void markDone(reply, true)}>
                            ✓ 확인 완료
                          </button>
                        )}
                        {reply.manualDone && (
                          <button className="text-button" disabled={busy} onClick={() => void markDone(reply, false)}>
                            완료 취소
                          </button>
                        )}
                            </div>
                          </div>
                        ))}
                      {followTarget &&
                        (followTarget.id === root.id ||
                          replies.some(
                            (reply) => reply.id === followTarget.id,
                          )) && (
                          <form
                            className="consult-follow-form"
                            onSubmit={saveFollow}
                            noValidate
                          >
                            <strong>후속 기록 · {followTarget.date} {followTarget.type}에 이어서</strong>
                            <div className="consult-follow-grid">
                              <label>
                                날짜
                                <input type="date" min={followTarget.date} value={followDraft.date} onChange={(event) => setFollowDraft({ ...followDraft, date: event.target.value })} />
                              </label>
                              <label>
                                유형
                                <select value={followDraft.type} onChange={(event) => setFollowDraft({ ...followDraft, type: event.target.value })}>
                                  {followTypes.map((type) => (
                                    <option key={type}>{type}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                다음 확인 예정일(선택)
                                <input type="date" min={followDraft.date} value={followDraft.followUpDate} onChange={(event) => setFollowDraft({ ...followDraft, followUpDate: event.target.value })} />
                              </label>
                            </div>
                            <label>
                              내용
                              <textarea
                                maxLength={5000}
                                value={followDraft.content}
                                onChange={(event) => setFollowDraft({ ...followDraft, content: event.target.value })}
                              />
                            </label>
                            <small className="consult-follow-hint">저장하면 앞 기록은 확인 완료가 됩니다. 다시 확인할 일이 있으면 다음 확인 예정일을 넣어 주세요.</small>
                            <div className="consult-follow-actions">
                              <button
                                type="button"
                                className="quiet-button"
                                onClick={() => setFollowTarget(null)}
                              >
                                취소
                              </button>
                              <button
                                className="primary-button"
                                disabled={busy || !followDraft.content.trim()}
                              >
                                저장
                              </button>
                            </div>
                          </form>
                        )}
                    </article>
                  );
                })
              )}
            </div>
          )}
        </section>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
