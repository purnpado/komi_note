import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { DeleteRecordList, DeleteRecordYear, SaveRecordLimits, SaveRecordList } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import { areaLabels, memberKey, parseMembers, sortMembers, type Area, type ParsedMember } from "./recordsState";

export function ListDialog({
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

export const limitAreas: Area[] = ["subject", "autonomy", "club", "career", "behavior", "freeSemester"];

export function LimitsDialog({ limits, onClose, onSaved }: { limits: Record<string, number>; onClose: () => void; onSaved: (limits: Record<string, number>) => void }) {
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

export function YearCleanupDialog({ book, onClose, onBulk, onDone }: { book: models.RecordBook; onClose: () => void; onBulk: (year: string) => void; onDone: (year: string, removed: number) => Promise<void> }) {
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
              <div className="records-bulk-hint">
                <p>지우기 전에 잘 쓴 문장을 학생 정보 없이 문장 보관함으로 옮겨 둘 수 있습니다.</p>
                <button className="quiet-button" disabled={!year} onClick={() => onBulk(year)}>{year}학년도 검토 완료 문장 보관함으로 옮기기</button>
              </div>
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
