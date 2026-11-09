import { useEffect, useRef, useState } from "react";
import { DeleteRecordEntry, SaveRecordEntry } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { registerPendingSave } from "../shared/pendingSaves";
import { areaLabels, checkText, entryStatus, measure, statusLabels, type EntryStatus } from "./recordsState";
import { AiReviewDialog, PhraseSaveDialog, copyToClipboard } from "./PhraseParts";
import { PhraseInsertDialog } from "./PhraseLibrary";
import { aiPrompt, type AiMode } from "./recordsState";
import { Slot, sameText } from "./useRecordsPage";

export type SaveState = "saved" | "dirty" | "saving" | "error";

export function EntryEditor({
  slot,
  pupil,
  entry,
  isOrphan,
  moveTargets,
  limit,
  names,
  everyName,
  phrases,
  onPhraseSaved,
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
  everyName: string[];
  phrases: models.RecordPhrase[];
  onPhraseSaved: (phrase: models.RecordPhrase) => void;
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
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const [lastAiMode, setLastAiMode] = useState<AiMode>("typo");
  const [phraseDraft, setPhraseDraft] = useState<models.RecordPhrase | null>(null);
  const [insertOpen, setInsertOpen] = useState(false);
  const [undoText, setUndoText] = useState<string | null>(null);
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
    const ok = await copyToClipboard(value);
    setCopied(ok ? "복사했습니다. 나이스에 붙여 넣은 뒤 다른 내용을 복사해 두세요." : "복사하지 못했습니다. 문장을 직접 선택해 복사해 주세요.");
    window.setTimeout(() => setCopied(""), 4000);
  }

  const hasName = warnings.some((warning) => warning.kind === "name");

  async function copyForAi(mode: AiMode) {
    const value = textRef.current.trim();
    if (!value || hasName) return;
    const ok = await copyToClipboard(aiPrompt(value, mode, info.limitBytes));
    setLastAiMode(mode);
    setCopied(ok ? `${mode === "polish" ? "문장 다듬기" : "오탈자 검토"} 요청 문구와 함께 복사했습니다. 쓰시는 AI에 붙여 넣고, 답을 복사해 'AI 답 붙여 넣기'를 누르세요. AI 서비스에 붙여 넣은 문장은 그 회사 서버로 전송됩니다.` : "복사하지 못했습니다.");
    window.setTimeout(() => setCopied(""), 8000);
  }

  // replaceText는 AI 적용·되돌리기·보관 문장 넣기처럼 문장을 통째로 바꾸고 바로 저장한다
  function replaceText(next: string) {
    changeText(next);
    void saveText();
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
        </div>
        <div className="records-text-actions records-text-tools">
          <button className="quiet-button" onClick={() => void copyForAi("typo")} disabled={!text.trim() || hasName} title={hasName ? "학생 이름을 먼저 지워 주세요" : "오탈자·띄어쓰기만 고쳐 달라는 요청 문구와 함께 복사"}>AI 오탈자 검토용 복사</button>
          <button className="quiet-button" onClick={() => void copyForAi("polish")} disabled={!text.trim() || hasName} title={hasName ? "학생 이름을 먼저 지워 주세요" : "사실을 더하지 않고 문장을 다듬어 달라는 요청 문구와 함께 복사"}>AI 문장 다듬기용 복사</button>
          <button className="quiet-button" onClick={() => setAiMode(lastAiMode)} disabled={!text.trim()}>AI 답 붙여 넣기</button>
          <HelpTip>프로그램은 외부로 아무것도 보내지 않습니다. 복사 버튼으로 쓰시는 AI(ChatGPT·Gemini·Claude 등)에 붙여 넣고, 답을 'AI 답 붙여 넣기'에 넣으면 바뀐 글자를 비교해 보여 줍니다. 문장 다듬기는 원문에 없는 사실을 더하지 말라고 요청하지만, 적용 전에 새로 생긴 내용을 꼭 확인하세요. 학생 이름이 있으면 복사하지 않고, 관찰 메모는 복사하지 않습니다.</HelpTip>
          <span className="records-tool-gap" />
          <button className="quiet-button" onClick={() => setInsertOpen(true)}>보관함에서 찾기</button>
          <button className="quiet-button" onClick={() => setPhraseDraft(new models.RecordPhrase({ text: textRef.current, area: slot.area, subject: slot.subject }))} disabled={!text.trim()}>보관함에 저장</button>
          {current && (
            <button className="text-button danger-text" onClick={() => void removeEntry()}>이 기록 지우기</button>
          )}
        </div>
        {copied && <p className="records-notice" role="status">{copied}</p>}
        {undoText !== null && (
          <p className="records-notice" role="status">
            AI가 고친 문장을 적용했습니다.{" "}
            <button className="text-button" onClick={() => { replaceText(undoText); setUndoText(null); }}>적용 전으로 되돌리기</button>
          </p>
        )}
      </div>

      {reference}
      {aiMode && (
        <AiReviewDialog
          original={textRef.current}
          mode={aiMode}
          limitBytes={info.limitBytes}
          onClose={() => setAiMode(null)}
          onApply={(next) => {
            setUndoText(textRef.current);
            replaceText(next);
            setAiMode(null);
          }}
        />
      )}
      {phraseDraft && (
        <PhraseSaveDialog
          phrase={phraseDraft}
          names={[...new Set([pupil.name, ...everyName])]}
          onClose={() => setPhraseDraft(null)}
          onSaved={(saved) => {
            setPhraseDraft(null);
            onPhraseSaved(saved);
          }}
        />
      )}
      {insertOpen && (
        <PhraseInsertDialog
          phrases={phrases}
          names={everyName}
          area={slot.area}
          onClose={() => setInsertOpen(false)}
          onInsert={(phrase) => {
            const currentText = textRef.current.trimEnd();
            replaceText(currentText ? `${currentText} ${phrase}` : phrase);
            setInsertOpen(false);
          }}
        />
      )}
    </section>
  );
}
