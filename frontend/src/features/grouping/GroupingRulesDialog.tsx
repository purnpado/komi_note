import * as Dialog from "@radix-ui/react-dialog";
import { memberLabel } from "./useGroupingPage";
import type { GroupingView } from "./GroupingPage";

/** 교사만 보는 편성 조건 창(넣지 않기·함께 넣기·역할). */
export function GroupingRulesDialog({ view }: { view: GroupingView }) {
  const {
    rulesOpen,
    setRulesOpen,
    pairDraft,
    setPairDraft,
    notice,
    busy,
    source,
    rules,
    addPair,
    removePair,
    pairName,
  } = view;
  return (
    <Dialog.Root open={rulesOpen} onOpenChange={(open) => !busy && setRulesOpen(open)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content grouping-dialog">
          <Dialog.Title>편성 조건 · {source?.label}</Dialog.Title>
          <Dialog.Description className="grouping-dialog-description">
            이 조건은 교사 화면에만 보이고 전자칠판·인쇄물에는 절대 나오지 않습니다. 반마다 따로 저장되어 다음 편성에도
            쓰입니다.
          </Dialog.Description>
          {notice && (
            <p className="grouping-notice" role="alert">
              {notice}
            </p>
          )}
          <div className="grouping-pair-form">
            <select
              aria-label="조건 종류"
              value={pairDraft.kind}
              onChange={(event) => setPairDraft({ ...pairDraft, kind: event.target.value as "separate" | "together" })}
            >
              <option value="separate">같은 모둠에 넣지 않기</option>
              <option value="together">같은 모둠에 함께 넣기</option>
            </select>
            <select
              aria-label="첫째 학생"
              value={pairDraft.a}
              onChange={(event) => setPairDraft({ ...pairDraft, a: event.target.value })}
            >
              <option value="">학생 고르기</option>
              {(source?.pupils || []).map((pupil) => (
                <option key={pupil.key} value={pupil.key}>
                  {memberLabel(pupil)}
                </option>
              ))}
            </select>
            <select
              aria-label="둘째 학생"
              value={pairDraft.b}
              onChange={(event) => setPairDraft({ ...pairDraft, b: event.target.value })}
            >
              <option value="">학생 고르기</option>
              {(source?.pupils || [])
                .filter((pupil) => pupil.key !== pairDraft.a)
                .map((pupil) => (
                  <option key={pupil.key} value={pupil.key}>
                    {memberLabel(pupil)}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !pairDraft.a || !pairDraft.b}
              onClick={addPair}
            >
              추가
            </button>
          </div>
          {(["separate", "together"] as const).map((kind) => (
            <div key={kind} className="grouping-pair-list">
              <h3>
                {kind === "separate" ? "같은 모둠에 넣지 않기" : "같은 모둠에 함께 넣기"}{" "}
                <small>{(kind === "separate" ? rules.separate : rules.together).length}개</small>
              </h3>
              {(kind === "separate" ? rules.separate : rules.together).length ? (
                <ul>
                  {(kind === "separate" ? rules.separate : rules.together).map((pair) => (
                    <li key={`${pair.a}-${pair.b}`}>
                      <span>
                        {pairName(pair.a)} · {pairName(pair.b)}
                      </span>
                      <button
                        type="button"
                        className="text-button danger-text"
                        disabled={busy}
                        onClick={() => removePair(kind, pair)}
                      >
                        지우기
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="grouping-muted">없음</p>
              )}
            </div>
          ))}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="quiet-button">
                닫기
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
