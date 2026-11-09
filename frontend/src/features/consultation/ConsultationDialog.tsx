import * as Dialog from "@radix-ui/react-dialog";
import { followTypes, Revisions, FollowUpStatus, firstTypes } from "./useConsultationPage";
import type { ConsultationPageView } from "./useConsultationPage";

/** ConsultationPage.tsx에서 떼어 낸 화면 구역 */
export function ConsultationDialog({ view: hookView }: { view: ConsultationPageView }) {
  const {
    mode,
    setMode,
    dialogOpen,
    setDialogOpen,
    draft,
    setDraft,
    editing,
    setEditing,
    followTarget,
    setFollowTarget,
    followDraft,
    setFollowDraft,
    expanded,
    setExpanded,
    notice,
    busy,
    view,
    printFrom,
    setPrintFrom,
    printTo,
    setPrintTo,
    selected,
    roots,
    changeDialogOpen,
    descendants,
    save,
    saveFollow,
    remove,
    markDone,
    printStudentLog,
    startFollow,
    startEdit,
    openStudent,
    formatRecordedAt,
  } = hookView;
  return (
    <>
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
                      <h3>{mode === "write" ? (editing ? "상담 기록 수정" : "새 상담 기록") : "상담 조회"}</h3>
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
                      <button className="quiet-button" disabled={busy}>
                        닫기
                      </button>
                    </Dialog.Close>
                  </div>
                </div>
                {notice && (
                  <p className="consultation-dialog-notice" role="status" aria-live="polite">
                    {notice}
                  </p>
                )}
                {mode === "write" ? (
                  <form className="consultation-form consultation-inline-form" onSubmit={save} noValidate>
                    <div className="form-grid">
                      <label>
                        상담 날짜
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                        />
                      </label>
                      <label>
                        상담 유형
                        <select
                          value={draft.type}
                          onChange={(event) => setDraft({ ...draft, type: event.target.value })}
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
                        onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                      />
                    </label>
                    <label>
                      다음 확인 예정일(선택)
                      <input
                        type="date"
                        min={draft.date}
                        value={draft.followUpDate}
                        onChange={(event) => setDraft({ ...draft, followUpDate: event.target.value })}
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
                        {busy ? "저장 중입니다" : editing ? "수정 저장" : "상담 기록 저장"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="consult-flow-list">
                    {roots.length > 0 && (
                      <div className="consult-print-bar">
                        <span>상담일지 인쇄</span>
                        <label>
                          시작일
                          <input type="date" value={printFrom} onChange={(event) => setPrintFrom(event.target.value)} />
                        </label>
                        <label>
                          끝일
                          <input type="date" value={printTo} onChange={(event) => setPrintTo(event.target.value)} />
                        </label>
                        <button className="quiet-button" onClick={printStudentLog}>
                          인쇄
                        </button>
                      </div>
                    )}
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
                            <Revisions item={root} />
                            <div className="consult-record-actions">
                              <button className="text-button" onClick={() => startEdit(root)}>
                                수정
                              </button>
                              <button className="text-button danger-text-button" onClick={() => void remove(root)}>
                                삭제
                              </button>
                              <button className="text-button consult-follow-button" onClick={() => startFollow(root)}>
                                ↳ 후속 기록
                              </button>
                              {root.followUpDate && !root.followUpDone && (
                                <button
                                  className="text-button consult-done-button"
                                  disabled={busy}
                                  onClick={() => void markDone(root, true)}
                                >
                                  ✓ 확인 완료
                                </button>
                              )}
                              {root.manualDone && (
                                <button
                                  className="text-button"
                                  disabled={busy}
                                  onClick={() => void markDone(root, false)}
                                >
                                  완료 취소
                                </button>
                              )}
                            </div>
                            {open &&
                              replies.map((reply) => (
                                <div className="consult-flow-reply" key={reply.id}>
                                  <small>
                                    {reply.date} · {reply.type} · 기록 {formatRecordedAt(reply.recordedAt)}
                                  </small>{" "}
                                  <FollowUpStatus item={reply} />
                                  <p>{reply.content}</p>
                                  <Revisions item={reply} />
                                  <div className="consult-record-actions">
                                    <button className="text-button" onClick={() => startEdit(reply)}>
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
                                      <button
                                        className="text-button consult-done-button"
                                        disabled={busy}
                                        onClick={() => void markDone(reply, true)}
                                      >
                                        ✓ 확인 완료
                                      </button>
                                    )}
                                    {reply.manualDone && (
                                      <button
                                        className="text-button"
                                        disabled={busy}
                                        onClick={() => void markDone(reply, false)}
                                      >
                                        완료 취소
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            {followTarget &&
                              (followTarget.id === root.id ||
                                replies.some((reply) => reply.id === followTarget.id)) && (
                                <form className="consult-follow-form" onSubmit={saveFollow} noValidate>
                                  <strong>
                                    후속 기록 · {followTarget.date} {followTarget.type}에 이어서
                                  </strong>
                                  <div className="consult-follow-grid">
                                    <label>
                                      날짜
                                      <input
                                        type="date"
                                        min={followTarget.date}
                                        value={followDraft.date}
                                        onChange={(event) =>
                                          setFollowDraft({ ...followDraft, date: event.target.value })
                                        }
                                      />
                                    </label>
                                    <label>
                                      유형
                                      <select
                                        value={followDraft.type}
                                        onChange={(event) =>
                                          setFollowDraft({ ...followDraft, type: event.target.value })
                                        }
                                      >
                                        {followTypes.map((type) => (
                                          <option key={type}>{type}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      다음 확인 예정일(선택)
                                      <input
                                        type="date"
                                        min={followDraft.date}
                                        value={followDraft.followUpDate}
                                        onChange={(event) =>
                                          setFollowDraft({ ...followDraft, followUpDate: event.target.value })
                                        }
                                      />
                                    </label>
                                  </div>
                                  <label>
                                    내용
                                    <textarea
                                      maxLength={5000}
                                      value={followDraft.content}
                                      onChange={(event) =>
                                        setFollowDraft({ ...followDraft, content: event.target.value })
                                      }
                                    />
                                  </label>
                                  <small className="consult-follow-hint">
                                    저장하면 앞 기록은 확인 완료가 됩니다. 다시 확인할 일이 있으면 다음 확인 예정일을
                                    넣어 주세요.
                                  </small>
                                  <div className="consult-follow-actions">
                                    <button
                                      type="button"
                                      className="quiet-button"
                                      onClick={() => setFollowTarget(null)}
                                    >
                                      취소
                                    </button>
                                    <button className="primary-button" disabled={busy || !followDraft.content.trim()}>
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
