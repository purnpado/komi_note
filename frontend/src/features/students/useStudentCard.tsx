import "./students.css";
import "./student-detail.css";
import { changeEvents } from "../shared/changeEvents";
import { useVaultChanges } from "../shared/useVaultChanges";
import { copyText } from "../shared/desktopActions";
import { useEffect, useMemo, useState } from "react";
import {
  DeleteStudent,
  GetStudentPhoto,
  ListConsultations,
  ListStudentAttendance,
  SaveStudentPhoto,
  SelectStudentPhoto,
} from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import type { StudentDetailNavigationRequest } from "../shared/featureNavigation";
import { errorMessage } from "../shared/format";

export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** StudentCard 화면의 상태·계산·처리 함수. 화면(JSX)은 StudentDetail.tsx에 있다. */
export function useStudentCard({
  student,
  close,
  students,
  navigate,
  config,
  requestNavigation,
  reloadStudents,
  deleted,
  displayGender,
}: {
  student: models.Student;
  close: () => void;
  students: models.Student[];
  navigate: (student: models.Student) => void;
  config: models.ClassConfig | null;
  requestNavigation: (request: StudentDetailNavigationRequest) => void;
  reloadStudents: () => Promise<void>;
  deleted: () => Promise<void>;
  displayGender: (gender: string) => string;
}) {
  const [photo, setPhoto] = useState("");
  const [consultations, setConsultations] = useState<models.Consultation[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<models.AttendanceDay[]>([]);
  const [attendanceYear, setAttendanceYear] = useState("");
  const [attendanceSemester, setAttendanceSemester] = useState("전체");
  const [attendanceMonth, setAttendanceMonth] = useState("전체");
  const [consultationYear, setConsultationYear] = useState("");
  const [consultationSemester, setConsultationSemester] = useState("전체");
  const [consultationMonth, setConsultationMonth] = useState("전체");
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");
  const [copyToast, setCopyToast] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function reload() {
    try {
      setPhoto(await GetStudentPhoto(student.id));
      setConsultations((await ListConsultations(student.id)) || []);
      setAttendanceRecords((await ListStudentAttendance(student.id)) || []);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  useEffect(() => {
    void reload();
  }, [student.id]);
  useVaultChanges([changeEvents.consultation, changeEvents.attendance], () => void reload());
  useEffect(() => {
    setAttendanceYear(config?.schoolYear ? String(config.schoolYear) : "");
    setAttendanceSemester("전체");
    setAttendanceMonth("전체");
  }, [student.id, config?.schoolYear]);
  useEffect(() => {
    setConsultationYear(config?.schoolYear ? String(config.schoolYear) : "");
    setConsultationSemester("전체");
    setConsultationMonth("전체");
  }, [student.id, config?.schoolYear]);
  useEffect(() => {
    if (!copyToast) return;
    const timer = window.setTimeout(() => setCopyToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [copyToast]);
  const orderedStudents = [...students].sort((left, right) => left.number - right.number);
  const currentIndex = orderedStudents.findIndex((item) => item.id === student.id);
  const previousStudent = currentIndex > 0 ? orderedStudents[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < orderedStudents.length - 1 ? orderedStudents[currentIndex + 1] : null;
  const age = () => {
    if (!student.birthDate) return "생년월일 미입력";
    const today = new Date();
    const birth = new Date(`${student.birthDate}T00:00:00`);
    let value = today.getFullYear() - birth.getFullYear();
    if (
      today.getMonth() < birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
    )
      value--;
    return `만 ${value}세`;
  };
  const attendanceYears = useMemo(
    () =>
      Array.from(new Set(attendanceRecords.map((item) => item.date.slice(0, 4))))
        .sort()
        .reverse(),
    [attendanceRecords],
  );
  const attendanceEntries = useMemo(
    () =>
      attendanceRecords
        .map((item) => ({ day: item, entry: item.entries?.[0] }))
        .filter(
          (
            item,
          ): item is {
            day: models.AttendanceDay;
            entry: models.AttendanceEntry;
          } => Boolean(item.entry),
        ),
    [attendanceRecords],
  );
  const filteredAttendance = useMemo(
    () =>
      attendanceEntries.filter(({ day }) => {
        if (attendanceYear && day.date.slice(0, 4) !== attendanceYear) return false;
        if (attendanceMonth !== "전체" && day.date.slice(5, 7) !== attendanceMonth) return false;
        if (attendanceSemester === "전체" || !config) return true;
        const start = attendanceSemester === "1학기" ? config.semester1StartDate : config.semester2StartDate;
        const end = attendanceSemester === "1학기" ? config.semester1EndDate : config.semester2EndDate;
        return !start || !end || (day.date >= start && day.date <= end);
      }),
    [attendanceEntries, attendanceYear, attendanceMonth, attendanceSemester, config],
  );
  const attendanceCounts = useMemo(
    () =>
      filteredAttendance.reduce(
        (counts, { entry }) => {
          counts[entry.status] = (counts[entry.status] || 0) + 1;
          return counts;
        },
        {} as Record<string, number>,
      ),
    [filteredAttendance],
  );
  const experienceUsage = useMemo(
    () =>
      attendanceEntries.filter(
        ({ day, entry }) =>
          entry.status === "교외체험학습" && (!config?.schoolYear || day.date.startsWith(`${config.schoolYear}-`)),
      ).length,
    [attendanceEntries, config?.schoolYear],
  );
  const semesterExperienceUsage = (semester: "1" | "2") =>
    attendanceEntries.filter(({ day, entry }) => {
      const start = semester === "1" ? config?.semester1StartDate : config?.semester2StartDate;
      const end = semester === "1" ? config?.semester1EndDate : config?.semester2EndDate;
      return entry.status === "교외체험학습" && Boolean(start && end && day.date >= start && day.date <= end);
    }).length;
  const consultationYears = useMemo(
    () =>
      Array.from(new Set(consultations.map((item) => item.date.slice(0, 4))))
        .sort()
        .reverse(),
    [consultations],
  );
  const filteredConsultations = useMemo(
    () =>
      consultations.filter((item) => {
        if (consultationYear && item.date.slice(0, 4) !== consultationYear) return false;
        if (consultationMonth !== "전체" && item.date.slice(5, 7) !== consultationMonth) return false;
        if (consultationSemester === "전체" || !config) return true;
        const start = consultationSemester === "1학기" ? config.semester1StartDate : config.semester2StartDate;
        const end = consultationSemester === "1학기" ? config.semester1EndDate : config.semester2EndDate;
        return !start || !end || (item.date >= start && item.date <= end);
      }),
    [consultations, consultationYear, consultationMonth, consultationSemester, config],
  );
  async function choosePhoto() {
    try {
      const path = await SelectStudentPhoto();
      if (!path) return;
      setBusy(true);
      await SaveStudentPhoto(student.id, path);
      await reloadStudents();
      await reload();
      setNotice("학생 사진을 암호화해 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function removeStudent() {
    try {
      setBusy(true);
      setDeleteNotice("");
      await DeleteStudent(student.id, deleteConfirmation);
      await deleted();
    } catch (error) {
      setDeleteNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function closeDelete(open: boolean) {
    if (busy) return;
    setDeleteOpen(open);
    if (!open) {
      setDeleteConfirmation("");
      setDeleteNotice("");
    }
  }
  async function copyValue(label: string, text: string) {
    if (!text) return;
    try {
      await copyText(text);
      setCopyToast({ text: `${label}을(를) 복사했습니다.`, failed: false });
    } catch {
      setCopyToast({ text: `${label} 복사에 실패했습니다.`, failed: true });
    }
  }
  const value = (label: string, text: string, copyable = false) => (
    <button
      type="button"
      className={copyable && text ? "card-value copyable" : "card-value"}
      onClick={() => copyable && text && void copyValue(label, text)}
      disabled={!copyable || !text}
      title={copyable && text ? `${label} 클릭하여 복사` : undefined}
    >
      <span className="card-value-label">
        <small>{label}</small>
        {copyable && text && <span className="copy-badge">⧉ 복사</span>}
      </span>
      <strong>{text || "미입력"}</strong>
    </button>
  );
  return {
    photo,
    setPhoto,
    consultations,
    setConsultations,
    attendanceRecords,
    setAttendanceRecords,
    attendanceYear,
    setAttendanceYear,
    attendanceSemester,
    setAttendanceSemester,
    attendanceMonth,
    setAttendanceMonth,
    consultationYear,
    setConsultationYear,
    consultationSemester,
    setConsultationSemester,
    consultationMonth,
    setConsultationMonth,
    editing,
    setEditing,
    notice,
    setNotice,
    copyToast,
    setCopyToast,
    deleteOpen,
    setDeleteOpen,
    deleteConfirmation,
    setDeleteConfirmation,
    deleteNotice,
    setDeleteNotice,
    busy,
    setBusy,
    reload,
    orderedStudents,
    currentIndex,
    previousStudent,
    nextStudent,
    age,
    attendanceYears,
    attendanceEntries,
    filteredAttendance,
    attendanceCounts,
    experienceUsage,
    semesterExperienceUsage,
    consultationYears,
    filteredConsultations,
    choosePhoto,
    removeStudent,
    closeDelete,
    copyValue,
    value,
  };
}

/** 화면 구역 컴포넌트에 넘기는 값 묶음 */
export type StudentCardView = ReturnType<typeof useStudentCard> & Parameters<typeof useStudentCard>[0];
