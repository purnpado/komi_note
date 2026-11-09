import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { FormEvent, useEffect, useState } from "react";
import {
  DeleteSubmissionDocument,
  ListSubmissionDocuments,
  SaveSubmissionDocument,
  SaveSubmissionStatus,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import "./submission.css";
import { errorMessage } from "../shared/format";

/** SubmissionDocumentsPage 화면의 상태·계산·처리 함수. 화면(JSX)은 SubmissionDocumentsPage.tsx에 있다. */
export function useSubmissionDocumentsPage({ students }: { students: models.Student[] }) {
  const [documents, setDocuments] = useState<models.SubmissionDocument[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [documentTab, setDocumentTab] = useState<"목록" | "작성">("목록");
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("전체");
  const [notice, setNotice] = useState("");
  const selected = documents.find((item) => item.id === selectedID) || null;
  const statuses = new Map((selected?.statuses || []).map((item) => [item.studentId, item]));
  const refresh = async () => {
    const items = (await ListSubmissionDocuments()) || [];
    const next = items.map((item) => new models.SubmissionDocument(item));
    setDocuments(next);
    setSelectedID((current) => (current && next.some((item) => item.id === current) ? current : next[0]?.id || ""));
    const active = next.find((item) => item.id === selectedID) || next[0];
    if (active) {
      setTitle(active.title);
      setDueDate(active.dueDate || "");
      setNote(active.note || "");
    }
  };
  useEffect(() => {
    void refresh().catch((error) => setNotice(errorMessage(error)));
  }, []);
  useVaultChanges([changeEvents.submissions, changeEvents.students], () => void refresh().catch(() => undefined));
  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setDueDate(selected.dueDate || "");
      setNote(selected.note || "");
    }
  }, [selectedID]);
  const normalizedStatus = (value?: string) => (value === "기타" ? "확인 필요" : value || "미제출");
  const count = (status: string) =>
    students.filter((student) => normalizedStatus(statuses.get(student.id)?.status) === status).length;
  // 해당 없음 학생은 제출 대상에서 제외하므로 재적·미제출 집계에서도 제외합니다.
  const eligibleCount = students.length - count("해당 없음");
  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setNotice("제출서류 이름을 입력해 주세요.");
      return;
    }
    try {
      const saved = await SaveSubmissionDocument(
        new models.SubmissionDocument({
          id: selected?.id || "",
          title,
          dueDate,
          note,
          statuses: selected?.statuses || [],
        }),
      );
      setNotice("제출서류 항목을 저장했습니다.");
      await refresh();
      setSelectedID(saved.id);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function removeDocument() {
    if (selected) setDeleteOpen(true);
  }
  async function confirmRemoveDocument() {
    if (!selected) return;
    try {
      await DeleteSubmissionDocument(selected.id);
      setNotice("제출서류 항목을 삭제했습니다.");
      await refresh();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setDeleteOpen(false);
    }
  }
  async function updateStatus(studentID: string, status: string, studentNote = "") {
    if (!selected) return;
    try {
      const saved = await SaveSubmissionStatus(selected.id, studentID, status, studentNote);
      setDocuments((items) =>
        items.map((item) => (item.id === saved.id ? new models.SubmissionDocument(saved) : item)),
      );
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  function startNewDocument() {
    setSelectedID("");
    setDetailOpen(false);
    setTitle("");
    setDueDate("");
    setNote("");
    setDocumentTab("작성");
  }
  function currentStatus(studentID: string) {
    return normalizedStatus(statuses.get(studentID)?.status);
  }
  const statusOptions = ["제출", "미제출", "확인 필요", "부분 제출", "해당 없음"];
  const filterOptions = ["전체", ...statusOptions];
  const filteredStudents = students.filter(
    (student) => statusFilter === "전체" || currentStatus(student.id) === statusFilter,
  );
  const studentTable = selected && (
    <div className="submission-table-wrap">
      <table className="submission-status-table">
        <thead>
          <tr>
            <th>번호</th>
            <th>이름</th>
            <th>제출</th>
            <th>미제출</th>
            <th>확인 필요</th>
            <th>부분 제출</th>
            <th>해당 없음</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {filteredStudents.map((student) => {
            const current = statuses.get(student.id);
            const status = currentStatus(student.id);
            return (
              <tr key={student.id}>
                <td>{String(student.number).padStart(2, "0")}</td>
                <td className="submission-name-cell">{student.name}</td>
                {statusOptions.map((option) => (
                  <td key={option}>
                    <input
                      type="checkbox"
                      className="submission-check"
                      checked={status === option}
                      onChange={() => void updateStatus(student.id, option, current?.note || "")}
                      aria-label={`${student.name} ${option}`}
                    />
                  </td>
                ))}
                <td>
                  <input
                    className="submission-note-input"
                    defaultValue={current?.note || ""}
                    onBlur={(event) => void updateStatus(student.id, status, event.target.value)}
                    placeholder="비고"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filteredStudents.length === 0 && <p className="empty-state">선택한 상태의 학생이 없습니다.</p>}
    </div>
  );
  return {
    documents,
    setDocuments,
    selectedID,
    setSelectedID,
    title,
    setTitle,
    dueDate,
    setDueDate,
    note,
    setNote,
    documentTab,
    setDocumentTab,
    detailOpen,
    setDetailOpen,
    deleteOpen,
    setDeleteOpen,
    statusFilter,
    setStatusFilter,
    notice,
    setNotice,
    selected,
    statuses,
    refresh,
    normalizedStatus,
    count,
    eligibleCount,
    saveDocument,
    removeDocument,
    confirmRemoveDocument,
    updateStatus,
    startNewDocument,
    currentStatus,
    statusOptions,
    filterOptions,
    filteredStudents,
    studentTable,
  };
}
