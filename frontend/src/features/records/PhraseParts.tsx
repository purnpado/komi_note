import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DeleteRecordPhrase, SaveRecordPhrase, SaveRecordPhrases } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import {
  areaLabels,
  changeRatio,
  cleanAiAnswer,
  diffText,
  filterPhrases,
  findNames,
  neisBytes,
  replaceName,
  suggestTags,
  tagCounts,
  type AiMode,
  type Area,
} from "./recordsState";

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

const areaOptions: Area[] = ["subject", "autonomy", "club", "career", "behavior", "freeSemester"];

// PhraseLibrary: 문장 보관함 찾기. manage는 보관함 탭(고치기·지우기), insert는 작성 중인 문장에 넣기.
export function PhraseLibrary({
  phrases,
  names,
  mode,
  defaultArea = "",
  onInsert,
  onChanged,
  onRemoved,
}: {
  phrases: models.RecordPhrase[];
  names: string[];
  mode: "manage" | "insert";
  defaultArea?: string;
  onInsert?: (text: string) => void;
  onChanged?: (phrase: models.RecordPhrase) => void;
  onRemoved?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState(defaultArea);
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<models.RecordPhrase | null>(null);
  const [copied, setCopied] = useState("");
  const found = filterPhrases(phrases, query, area, pickedTags).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = tagCounts(area ? phrases.filter((phrase) => phrase.area === area) : phrases).slice(0, 30);

  async function remove(phrase: models.RecordPhrase) {
    const ok = await confirmWithRadix({ title: "보관 문장을 지울까요?", description: "지운 문장은 되살릴 수 없습니다.", actionLabel: "문장 지우기" });
    if (!ok) return;
    try {
      await DeleteRecordPhrase(phrase.id);
      onRemoved?.(phrase.id);
    } catch (error) {
      setCopied(errorMessage(error));
    }
  }

  return (
    <div className="records-library">
      <div className="records-library-search">
        <label className="records-field">
          찾기
          <input type="search" value={query} placeholder="낱말이나 #태그" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="records-field">
          영역
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="">모든 영역</option>
            {areaOptions.map((item) => (
              <option key={item} value={item}>{areaLabels[item]}</option>
            ))}
          </select>
        </label>
      </div>
      {counts.length > 0 && (
        <div className="records-tags" role="group" aria-label="태그로 거르기">
          {counts.map(([tag, count]) => (
            <button key={tag} className={pickedTags.includes(tag) ? "picked" : ""} aria-pressed={pickedTags.includes(tag)} onClick={() => setPickedTags(pickedTags.includes(tag) ? pickedTags.filter((item) => item !== tag) : [...pickedTags, tag])}>
              #{tag} <small>{count}</small>
            </button>
          ))}
        </div>
      )}
      {copied && <p className="records-notice" role="status">{copied}</p>}
      <p className="records-muted">{phrases.length === 0 ? "아직 보관한 문장이 없습니다. 기재 문장 아래 '보관함에 저장'으로 넣을 수 있습니다." : `${phrases.length}개 중 ${found.length}개`}</p>
      <ul className="records-phrases">
        {found.slice(0, 200).map((phrase) => (
          <li key={phrase.id}>
            <p>{phrase.text}</p>
            <div className="records-phrase-meta">
              {phrase.area && <span className="records-chip">{areaLabels[phrase.area as Area] || phrase.area}</span>}
              {phrase.tags.map((tag) => (
                <span key={tag} className="records-chip tag">#{tag}</span>
              ))}
            </div>
            <div className="records-phrase-actions">
              {mode === "insert" ? (
                <button className="primary-button" onClick={() => onInsert?.(phrase.text)}>이 문장 넣기</button>
              ) : (
                <>
                  <button
                    className="quiet-button"
                    onClick={async () => {
                      const ok = await copyToClipboard(phrase.text);
                      setCopied(ok ? "복사했습니다." : "복사하지 못했습니다.");
                      window.setTimeout(() => setCopied(""), 3000);
                    }}
                  >
                    복사
                  </button>
                  <button className="quiet-button" onClick={() => setEditing(phrase)}>고치기</button>
                  <button className="text-button danger-text" onClick={() => void remove(phrase)}>지우기</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {editing && (
        <PhraseSaveDialog
          phrase={editing}
          names={names}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            onChanged?.(saved);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

export function PhraseInsertDialog({ phrases, names, area, onClose, onInsert }: { phrases: models.RecordPhrase[]; names: string[]; area: string; onClose: () => void; onInsert: (text: string) => void }) {
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content records-dialog records-dialog-wide">
          <Dialog.Title>문장 보관함에서 찾기</Dialog.Title>
          <Dialog.Description className="records-dialog-description">고른 문장은 지금 쓰는 기재 문장 끝에 붙습니다. 학생에 맞게 고쳐 쓰세요.</Dialog.Description>
          <PhraseLibrary phrases={phrases} names={names} mode="insert" defaultArea={area} onInsert={onInsert} />
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button">닫기</button>
            </Dialog.Close>
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
