import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DeleteConsultation, GetStudentPhoto, ListAllConsultations, SaveConsultation, SetConsultationFollowUpDone } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { escapePrintText, printSheet } from "../shared/desktopActions";
import { flowOrder, type SearchFilter } from "./consultationState";
import "./consultation.css";
import { errorMessage, todayLocal } from "../shared/format";

export type ConsultationConfirm = (request: { title: string; description: string }) => Promise<boolean>;

export const firstTypes = ["학생 상담", "보호자 통화", "보호자 면담", "교사 확인", "기타", "후속 조치"];
export const followTypes = ["학생 재상담", "보호자 통화", "보호자 면담", "교사 확인", "조치 결과", "기타"];

export type Draft = { date: string; type: string; content: string; followUpDate: string };

export function emptyDraft(type = "학생 상담"): Draft {
  return { date: todayLocal(), type, content: "", followUpDate: "" };
}

export function shortDate(value: string) {
  return value ? `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일` : "";
}

export const printCss = `.print-sheet{font-family:"Pretendard","Malgun Gothic",sans-serif;color:#111}
.print-sheet h1{margin:0 0 4px;font-size:20px}
.print-sheet .meta{margin:0 0 4px;font-size:12px;color:#333}
.print-sheet .warn{margin:0 0 10px;font-size:11px;font-weight:700;color:#a1261b}
.print-sheet table{width:100%;border-collapse:collapse;font-size:11.5px}
.print-sheet th,.print-sheet td{border:1px solid #888;padding:5px 6px;vertical-align:top;text-align:left}
.print-sheet th{background:#eee}
.print-sheet td.content{white-space:pre-wrap}
.print-sheet td.date{white-space:nowrap}
.print-sheet tr{break-inside:avoid}
@page{size:A4 portrait;margin:14mm}`;

export function followText(item: models.Consultation) {
  if (!item.followUpDate) return "";
  return `${item.followUpDate}${item.followUpDone ? " (확인 완료)" : ""}`;
}

export function Revisions({ item }: { item: models.Consultation }) {
  const [open, setOpen] = useState(false);
  const revisions = item.revisions || [];
  if (!item.updatedAt && revisions.length === 0) return null;
  return (
    <div className="consult-revisions">
      <button type="button" className="text-button" onClick={() => setOpen(!open)} aria-expanded={open}>
        수정됨 {revisions.length}회{item.updatedAt ? ` · 마지막 ${item.updatedAt.slice(0, 16).replace("T", " ")}` : ""} {open ? "▴" : "▾"}
      </button>
      {open && (
        <ol>
          {revisions.map((revision, index) => (
            <li key={`${revision.editedAt}-${index}`}>
              <small>{revision.editedAt.slice(0, 16).replace("T", " ")}에 고치기 전 · {revision.date} · {revision.type}{revision.followUpDate ? ` · 예정 ${revision.followUpDate}` : ""}</small>
              <p>{revision.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// FollowUpStatus는 다음 확인 예정일의 상태(예정·지남·확인 완료)를 보여 준다.
export function FollowUpStatus({ item }: { item: models.Consultation }) {
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

/** ConsultationPage 화면의 상태·계산·처리 함수. 화면(JSX)은 ConsultationPage.tsx에 있다. */
export function useConsultationPage({
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
  const [view, setView] = useState<"students" | "todo" | "search">("students");
  const [filter, setFilter] = useState<SearchFilter>({ studentId: "", type: "", from: "", to: "", query: "" });
  const [printFrom, setPrintFrom] = useState("");
  const [printTo, setPrintTo] = useState("");
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
  useVaultChanges([changeEvents.consultation, changeEvents.students], () => void reload());
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
  const nameOf = (id: string) => {
    const student = students.find((item) => item.id === id);
    return student ? `${student.number}번 ${student.name}` : "삭제된 학생";
  };
  function printStudentLog() {
    if (!selected) return;
    const rows = flowOrder(records, printFrom, printTo)
      .map(({ item, depth }) => `<tr><td class="date">${escapePrintText(item.date)}</td><td>${depth ? "↳ ".repeat(depth) : ""}${escapePrintText(item.type)}</td><td class="content">${escapePrintText(item.content)}</td><td class="date">${escapePrintText(followText(item))}</td></tr>`)
      .join("");
    if (!rows) {
      setNotice("고른 기간에 인쇄할 상담 기록이 없습니다.");
      return;
    }
    const period = printFrom || printTo ? `${printFrom || "처음"} ~ ${printTo || "오늘"}` : "전체 기간";
    const html = `<h1>상담일지</h1><p class="meta">${escapePrintText(`${selected.number}번 ${selected.name}`)} · ${escapePrintText(period)} · 인쇄 ${escapePrintText(todayLocal())}</p><p class="warn">상담 기록 · 외부 반출 주의 · 보관과 폐기에 유의해 주세요</p><table><thead><tr><th style="width:15%">날짜</th><th style="width:15%">유형</th><th>내용</th><th style="width:16%">다음 확인</th></tr></thead><tbody>${rows}</tbody></table>`;
    void printSheet(html, printCss).catch(() => setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."));
  }
  function printSearchList(found: models.Consultation[]) {
    if (found.length === 0) return;
    const rows = found
      .map((item) => `<tr><td class="date">${escapePrintText(item.date)}</td><td>${escapePrintText(nameOf(item.studentId))}</td><td>${item.parentId ? "↳ " : ""}${escapePrintText(item.type)}</td><td class="content">${escapePrintText(item.content)}</td><td class="date">${escapePrintText(followText(item))}</td></tr>`)
      .join("");
    const parts = [
      filter.from || filter.to ? `${filter.from || "처음"} ~ ${filter.to || "오늘"}` : "전체 기간",
      filter.studentId ? nameOf(filter.studentId) : "전체 학생",
      filter.type || "전체 유형",
      filter.query ? `낱말 "${filter.query}"` : "",
    ].filter(Boolean);
    const html = `<h1>상담 기록 목록</h1><p class="meta">${escapePrintText(parts.join(" · "))} · ${found.length}건 · 인쇄 ${escapePrintText(todayLocal())}</p><p class="warn">상담 기록 · 외부 반출 주의 · 보관과 폐기에 유의해 주세요</p><table><thead><tr><th style="width:13%">날짜</th><th style="width:13%">학생</th><th style="width:13%">유형</th><th>내용</th><th style="width:15%">다음 확인</th></tr></thead><tbody>${rows}</tbody></table>`;
    void printSheet(html, printCss).catch(() => setNotice("인쇄 창을 열지 못했습니다. 다시 시도해 주세요."));
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
  return { items, setItems, photos, setPhotos, selectedID, setSelectedID, mode, setMode, dialogOpen, setDialogOpen, draft, setDraft, editing, setEditing, followTarget, setFollowTarget, followDraft, setFollowDraft, expanded, setExpanded, notice, setNotice, busy, setBusy, view, setView, filter, setFilter, printFrom, setPrintFrom, printTo, setPrintTo, selected, records, roots, reload, choose, changeDialogOpen, descendants, save, saveFollow, remove, markDone, nameOf, printStudentLog, printSearchList, startFollow, startEdit };
}

/** 화면 구역 컴포넌트에 넘기는 값 묶음 */
export type ConsultationPageView = ReturnType<typeof useConsultationPage> & Parameters<typeof useConsultationPage>[0];
