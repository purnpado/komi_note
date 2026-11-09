import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { SaveRecordPhrase, SaveRecordPhrases } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { changeRatio, cleanAiAnswer, diffText, findNames, neisBytes, replaceName, suggestTags, type AiMode } from "./recordsState";

export async function copyToClipboard(text: string) {
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

function DiffView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffText(before, after), [before, after]);
  return (
    <p className="records-diff" aria-label="바뀐 부분 비교">
      {parts.map((part, index) =>
        part.kind === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.kind === "add" ? (
          <ins key={index} title="더한 글자">{part.text === " " ? "␣" : part.text}</ins>
        ) : (
          <del key={index} title="지운 글자">{part.text === " " ? "␣" : part.text}</del>
        ),
      )}
    </p>
  );
}

// AiReviewDialog: AI 답을 붙여 넣으면 원래 문장과 비교해 보여 주고, 적용을 눌러야 바꾼다.
export function AiReviewDialog({ original, mode, limitBytes, onClose, onApply }: { original: string; mode: AiMode; limitBytes: number; onClose: () => void; onApply: (text: string) => void }) {
  const [answer, setAnswer] = useState("");
  const cleaned = cleanAiAnswer(answer);
  const ratio = cleaned ? changeRatio(diffText(original.trim(), cleaned)) : 0;
  const unchanged = cleaned !== "" && cleaned === original.trim();
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content records-dialog records-dialog-wide">
          <Dialog.Title>AI 답 붙여 넣기 · {mode === "polish" ? "문장 다듬기" : "오탈자 검토"}</Dialog.Title>
          <Dialog.Description className="records-dialog-description">
            AI가 고친 문장을 아래에 붙여 넣으면 원래 문장과 바뀐 글자를 보여 줍니다. <ins className="records-legend">초록</ins>은 더한 글자, <del className="records-legend">빨강</del>은 지운 글자입니다. 확인한 뒤 적용을 누를 때만 기재 문장이 바뀝니다.
          </Dialog.Description>
          <label className="records-field">
            AI 답
            <textarea rows={5} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="AI가 답한 문장을 붙여 넣으세요" autoFocus />
          </label>
          {cleaned && (
            <div className="records-diff-box">
              <strong>바뀐 부분</strong>
              {unchanged ? <p className="records-muted">원래 문장과 같습니다. 고칠 곳이 없었습니다.</p> : <DiffView before={original.trim()} after={cleaned} />}
              {mode === "typo" && ratio > 0.3 && <p className="records-error" role="alert">글자의 {Math.round(ratio * 100)}%가 바뀌었습니다. AI가 오탈자 말고 내용까지 바꿨을 수 있으니 꼼꼼히 확인해 주세요.</p>}
              {mode === "polish" && !unchanged && <p className="records-caution" role="note">초록색으로 새로 생긴 내용이 실제로 관찰한 사실인지 꼭 확인해 주세요. AI는 원문에 없는 활동이나 칭찬을 지어 넣을 때가 있습니다.</p>}
              <p className={neisBytes(cleaned) > limitBytes ? "records-count over" : "records-count"}>
                고친 문장 {neisBytes(cleaned).toLocaleString()} / {limitBytes.toLocaleString()}바이트{neisBytes(cleaned) > limitBytes ? " (한도 초과)" : ""}
              </p>
            </div>
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button">취소</button>
            </Dialog.Close>
            <button className="primary-button" disabled={!cleaned || unchanged} onClick={() => onApply(cleaned)}>적용</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NameCheck({ text, names, dismissed, onReplace, onDismiss }: { text: string; names: string[]; dismissed: string[]; onReplace: (name: string) => void; onDismiss: (name: string) => void }) {
  const hits = findNames(text, names).filter((hit) => !dismissed.includes(hit.name));
  if (hits.length === 0) return <p className="records-ok">✓ 학생 이름이 없습니다.</p>;
  return (
    <ul className="records-name-hits" aria-label="문장 속 학생 이름">
      {hits.map((hit) => (
        <li key={hit.name}>
          <span>학생 이름 <b>{hit.name}</b>이(가) {hit.count}번 들어 있습니다.</span>
          <button className="quiet-button" onClick={() => onReplace(hit.name)}>○○로 바꾸기</button>
          {hit.name.length <= 2 && <button className="text-button" onClick={() => onDismiss(hit.name)}>이름이 아닙니다</button>}
        </li>
      ))}
    </ul>
  );
}

function unresolvedNames(text: string, names: string[], dismissed: string[]) {
  return findNames(text, names).filter((hit) => !dismissed.includes(hit.name));
}

function TagPicker({ tags, setTags, suggestions }: { tags: string[]; setTags: (tags: string[]) => void; suggestions: string[] }) {
  const [custom, setCustom] = useState("");
  const all = [...new Set([...suggestions, ...tags])];
  function addCustom() {
    const value = custom.replace(/^#/, "").replace(/\s+/g, "").slice(0, 20);
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setCustom("");
  }
  return (
    <div className="records-tag-picker">
      <div className="records-tags" role="group" aria-label="태그 고르기">
        {all.map((tag) => (
          <button key={tag} type="button" className={tags.includes(tag) ? "picked" : ""} aria-pressed={tags.includes(tag)} onClick={() => setTags(tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag])}>
            #{tag}
          </button>
        ))}
      </div>
      <div className="records-tag-add">
        <input value={custom} maxLength={21} placeholder="태그 직접 추가" onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addCustom())} aria-label="태그 직접 추가" />
        <button type="button" className="quiet-button" onClick={addCustom} disabled={!custom.trim()}>추가</button>
      </div>
    </div>
  );
}

// PhraseSaveDialog: 문장을 학생 정보 없이 보관한다. 이름을 ○○로 바꾸거나 확인하기 전에는 저장하지 않는다.
export function PhraseSaveDialog({
  phrase,
  names,
  onClose,
  onSaved,
}: {
  phrase: models.RecordPhrase;
  names: string[];
  onClose: () => void;
  onSaved: (phrase: models.RecordPhrase) => void;
}) {
  const [text, setText] = useState(phrase.text);
  const suggestions = useMemo(() => suggestTags(phrase.text, phrase.area, phrase.subject), [phrase]);
  const [tags, setTags] = useState<string[]>(phrase.id ? phrase.tags : suggestions.filter((item) => item.picked).map((item) => item.tag));
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = unresolvedNames(text, names, dismissed).length > 0;

  async function save() {
    setBusy(true);
    try {
      const saved = await SaveRecordPhrase(new models.RecordPhrase({ ...phrase, text, tags }));
      onSaved(saved);
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
          <Dialog.Title>{phrase.id ? "보관 문장 고치기" : "문장 보관함에 저장"}</Dialog.Title>
          <Dialog.Description className="records-dialog-description">
            학생과 연결하지 않고 문장·영역·태그만 보관합니다. 학년도 기록을 정리해도 남습니다. 이름 말고도 가정 형편·건강·특정 대회처럼 학생을 알아볼 수 있는 내용이 있으면 고친 뒤 저장해 주세요.
          </Dialog.Description>
          <label className="records-field">
            보관할 문장
            <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} />
          </label>
          <NameCheck text={text} names={names} dismissed={dismissed} onReplace={(name) => setText(replaceName(text, name))} onDismiss={(name) => setDismissed([...dismissed, name])} />
          <div className="records-field">
            <span>태그 <HelpTip>문장 낱말로 태그를 미리 골라 두었습니다. 눌러서 빼거나 넣고, 필요하면 직접 추가하세요. 태그 추천은 이 컴퓨터 안에서만 합니다.</HelpTip></span>
            <TagPicker tags={tags} setTags={setTags} suggestions={suggestions.map((item) => item.tag)} />
          </div>
          {message && <p className="records-error" role="alert">{message}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button" disabled={busy}>취소</button>
            </Dialog.Close>
            <button className="primary-button" disabled={busy || blocked || !text.trim()} onClick={() => void save()} title={blocked ? "학생 이름을 먼저 정리해 주세요" : ""}>저장</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type BulkCandidate = { id: string; label: string; area: string; subject: string; text: string; studentName: string };

type BulkRow = BulkCandidate & { picked: boolean; draft: string; tags: string[]; replaced: boolean };

// BulkArchiveDialog: 학년말에 검토 완료 문장을 골라 한꺼번에 보관한다. 그 학생 이름은 미리 ○○로 바꿔 둔다.
export function BulkArchiveDialog({
  year,
  candidates,
  existingTexts,
  names,
  onClose,
  onDone,
}: {
  year: string;
  candidates: BulkCandidate[];
  existingTexts: Set<string>;
  names: string[];
  onClose: () => void;
  onDone: (added: number, skipped: number) => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>(() =>
    candidates.map((candidate) => {
      const draft = replaceName(candidate.text, candidate.studentName);
      return {
        ...candidate,
        draft,
        replaced: draft !== candidate.text,
        picked: !existingTexts.has(draft.trim()),
        tags: suggestTags(draft, candidate.area, candidate.subject).filter((item) => item.picked).map((item) => item.tag),
      };
    }),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = rows.filter((row) => row.picked);
  // 3글자 이상 이름은 보관을 막고, 2글자 이름은 일반 낱말과 겹칠 수 있어 알리기만 한다
  const blocked = picked.filter((row) => findNames(row.draft, names).some((hit) => hit.name.length >= 3));

  function update(id: string, patch: Partial<BulkRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function save() {
    setBusy(true);
    try {
      const result = await SaveRecordPhrases(picked.map((row) => new models.RecordPhrase({ text: row.draft, area: row.area, subject: row.subject, tags: row.tags })));
      onDone(result.added, result.skipped);
    } catch (error) {
      setMessage(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content records-dialog records-dialog-wide">
          <Dialog.Title>{year}학년도 검토 완료 문장 보관하기</Dialog.Title>
          <Dialog.Description className="records-dialog-description">
            검토 완료한 문장 {rows.length}개입니다. 그 학생의 이름은 미리 ○○로 바꿔 두었습니다. 보관할 문장만 고르고, 학생을 알아볼 수 있는 내용이 있으면 고쳐 주세요. 보관함에는 학생 정보가 남지 않습니다.
          </Dialog.Description>
          <div className="records-dialog-row records-bulk-toolbar">
            <span>{picked.length}개 고름</span>
            <button className="text-button" onClick={() => setRows(rows.map((row) => ({ ...row, picked: true })))}>모두 고르기</button>
            <button className="text-button" onClick={() => setRows(rows.map((row) => ({ ...row, picked: false })))}>모두 빼기</button>
          </div>
          {rows.length === 0 ? (
            <p className="records-muted">이 학년도에 검토 완료한 문장이 없습니다.</p>
          ) : (
            <ul className="records-bulk">
              {rows.map((row) => {
                const hits = findNames(row.draft, names);
                const exists = existingTexts.has(row.draft.trim());
                return (
                  <li key={row.id} className={row.picked ? "picked" : ""}>
                    <label className="records-check">
                      <input type="checkbox" checked={row.picked} onChange={(event) => update(row.id, { picked: event.target.checked })} /> {row.label}
                      {row.replaced && <small> · 이름을 ○○로 바꿈</small>}
                      {exists && <small> · 이미 보관함에 있음</small>}
                    </label>
                    <textarea rows={3} value={row.draft} onChange={(event) => update(row.id, { draft: event.target.value })} aria-label={`${row.label} 보관할 문장`} />
                    {hits.length > 0 && (
                      <p className="records-error">
                        다른 학생 이름({hits.map((hit) => hit.name).join(", ")})이 있습니다.{" "}
                        <button className="text-button" onClick={() => update(row.id, { draft: hits.reduce((text, hit) => replaceName(text, hit.name), row.draft) })}>○○로 바꾸기</button>
                      </p>
                    )}
                    <div className="records-phrase-meta">
                      {row.tags.map((tag) => (
                        <span key={tag} className="records-chip tag">#{tag}</span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {blocked.length > 0 && <p className="records-error" role="alert">학생 이름이 남은 문장 {blocked.length}개를 고치거나 빼야 보관할 수 있습니다.</p>}
          {message && <p className="records-error" role="alert">{message}</p>}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button" disabled={busy}>취소</button>
            </Dialog.Close>
            <button className="primary-button" disabled={busy || picked.length === 0 || blocked.length > 0} onClick={() => void save()}>{picked.length}개 보관하기</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
