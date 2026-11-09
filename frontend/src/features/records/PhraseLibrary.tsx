import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { DeleteRecordPhrase } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { confirmWithRadix } from "../app-shell/AppConfirmDialog";
import { errorMessage } from "../shared/format";
import { areaLabels, filterPhrases, tagCounts, type Area } from "./recordsState";
import { copyToClipboard, PhraseSaveDialog } from "./PhraseParts";

export const areaOptions: Area[] = ["subject", "autonomy", "club", "career", "behavior", "freeSemester"];

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
