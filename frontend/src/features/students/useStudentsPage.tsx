import "./students.css";
import { useEffect, useMemo, useState } from "react";
import {
  DeleteStudent,
  GetStudentPhoto,
  ImportRoster,
  ListAcademicChanges,
  PreviewRoster,
  ProcessAcademicChange,
  ResetStudents,
  SelectRosterFile,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage, todayLocal } from "../shared/format";

export function StudentRosterIcon() {
  return (
    <svg className="students-title-icon" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="16" r="7" />
      <path d="M6 37c1.8-7 6.1-10 12-10s10.2 3 12 10" />
      <path d="M31 15h11M31 22h11M31 29h8" />
    </svg>
  );
}

/** StudentsPage 화면의 상태·계산·처리 함수. 화면(JSX)은 StudentsPage.tsx에 있다. */
export function useStudentsPage({
  students,
  reloadStudents,
  openStudent,
  displayGender,
}: {
  students: models.Student[];
  reloadStudents: () => Promise<void>;
  openStudent: (student: models.Student) => void;
  displayGender: (gender: string) => string;
}) {
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<models.RosterPreview | null>(null);
  const [path, setPath] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<models.Student | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [academicChanges, setAcademicChanges] = useState<models.AcademicChange[]>([]);
  const [academicTarget, setAcademicTarget] = useState<models.Student | null>(null);
  const [academicStatus, setAcademicStatus] = useState("전출");
  const [academicDate, setAcademicDate] = useState(todayLocal());
  const [academicConfirmation, setAcademicConfirmation] = useState("");
  const [academicNotice, setAcademicNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [rosterView, setRosterView] = useState<"목록" | "카드">("카드");
  const filtered = useMemo(
    () =>
      (students || []).filter((student) => student.name.includes(search) || String(student.number).includes(search)),
    [students, search],
  );
  useEffect(() => {
    let active = true;
    void Promise.all(
      (students || [])
        .filter((student) => student.hasPhoto)
        .map(async (student) => [student.id, await GetStudentPhoto(student.id)] as const),
    )
      .then((items) => {
        if (active) setPhotos(Object.fromEntries(items.filter(([, photo]) => photo)));
      })
      .catch(() => {
        if (active) setPhotos({});
      });
    return () => {
      active = false;
    };
  }, [students]);
  useEffect(() => {
    void reloadAcademicChanges();
  }, []);
  async function reloadAcademicChanges() {
    try {
      setAcademicChanges((await ListAcademicChanges()) || []);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  const age = (birthDate: string) => {
    if (!birthDate) return "생년월일 미입력";
    const today = new Date();
    const birth = new Date(`${birthDate}T00:00:00`);
    let value = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    )
      value--;
    return `만 ${value}세`;
  };
  const state = (student: models.Student) =>
    student.studentPhone && (student.fatherPhone || student.motherPhone || student.guardianPhone)
      ? "연락처 입력 완료"
      : "연락처 보완 필요";
  async function selectFile() {
    try {
      const selectedPath = await SelectRosterFile();
      if (!selectedPath) return;
      setBusy(true);
      const nextPreview = new models.RosterPreview(await PreviewRoster(selectedPath));
      nextPreview.headers = nextPreview.headers || [];
      nextPreview.students = nextPreview.students || [];
      nextPreview.warnings = nextPreview.warnings || [];
      setPath(selectedPath);
      setPreview(nextPreview);
      setNotice("");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function importRoster() {
    try {
      setBusy(true);
      const result = await ImportRoster(path);
      await reloadStudents();
      setPreview(null);
      setNotice(`${result.added}명 추가, ${result.updated}명 갱신 · 총 ${result.total}명 암호화 저장 완료`);
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function resetStudents() {
    try {
      setBusy(true);
      setResetNotice("");
      const count = await ResetStudents(confirmation);
      await reloadStudents();
      setNotice(`${count}명의 학생 명렬과 연결 기록을 초기화했습니다.`);
      setResetOpen(false);
      setConfirmation("");
    } catch (error) {
      setResetNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function closeReset(open: boolean) {
    if (busy) return;
    setResetOpen(open);
    if (!open) {
      setConfirmation("");
      setResetNotice("");
    }
  }
  async function deleteStudent() {
    if (!deleteTarget) return;
    try {
      setBusy(true);
      setDeleteNotice("");
      await DeleteStudent(deleteTarget.id, deleteConfirmation);
      await reloadStudents();
      setNotice(`${deleteTarget.number}번 ${deleteTarget.name} 학생 정보를 삭제했습니다.`);
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (error) {
      setDeleteNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function closeDelete(open: boolean) {
    if (busy) return;
    if (!open) {
      setDeleteTarget(null);
      setDeleteConfirmation("");
      setDeleteNotice("");
    }
  }
  async function processAcademicChange() {
    if (!academicTarget) return;
    try {
      setBusy(true);
      setAcademicNotice("");
      await ProcessAcademicChange(academicTarget.id, academicStatus, academicDate, academicConfirmation);
      await reloadStudents();
      await reloadAcademicChanges();
      setNotice(`${academicTarget.name} 학생의 학적변동을 처리했습니다.`);
      setAcademicTarget(null);
      setAcademicConfirmation("");
    } catch (error) {
      setAcademicNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function closeAcademicChange(open: boolean) {
    if (busy) return;
    if (!open) {
      setAcademicTarget(null);
      setAcademicConfirmation("");
      setAcademicNotice("");
      setAcademicStatus("전출");
      setAcademicDate(todayLocal());
    }
  }
  const newStudent = new models.Student({
    number: Math.max(0, ...(students || []).map((student) => student.number)) + 1,
    name: "",
    gender: "",
    birthDate: "",
    address: "",
    transferInDate: "",
  });
  return {
    search,
    setSearch,
    preview,
    setPreview,
    path,
    setPath,
    notice,
    setNotice,
    busy,
    setBusy,
    resetOpen,
    setResetOpen,
    confirmation,
    setConfirmation,
    resetNotice,
    setResetNotice,
    deleteTarget,
    setDeleteTarget,
    deleteConfirmation,
    setDeleteConfirmation,
    deleteNotice,
    setDeleteNotice,
    academicChanges,
    setAcademicChanges,
    academicTarget,
    setAcademicTarget,
    academicStatus,
    setAcademicStatus,
    academicDate,
    setAcademicDate,
    academicConfirmation,
    setAcademicConfirmation,
    academicNotice,
    setAcademicNotice,
    adding,
    setAdding,
    photos,
    setPhotos,
    rosterView,
    setRosterView,
    filtered,
    reloadAcademicChanges,
    age,
    state,
    selectFile,
    importRoster,
    resetStudents,
    closeReset,
    deleteStudent,
    closeDelete,
    processAcademicChange,
    closeAcademicChange,
    newStudent,
  };
}
