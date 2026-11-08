import { useState } from "react";
import "./course-roster-edit.css";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { UpdateCourseRosterStudent } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";

type Props = { roster: models.CourseRoster; student?: models.CourseRosterStudent; onSaved: (message: string) => void };
const snapshot = (roster: models.CourseRoster) => JSON.parse(JSON.stringify(roster)) as models.CourseRoster;

export function CourseStudentEditor({ roster, student, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [expected, setExpected] = useState<models.CourseRoster | null>(null);
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("재학");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function changeOpen(value: boolean) {
    if (value) {
      setExpected(snapshot(roster));
      setNumber(student?.number || "");
      setName(student?.name || "");
      setStatus(student?.status || "재학");
      setNotice("");
    }
    setOpen(value);
  }
  async function save() {
    if (!expected) return;
    setBusy(true);
    try {
      await UpdateCourseRosterStudent(roster.id, expected, student ? "수정" : "추가", student?.number || "", new models.CourseRosterStudent({ number, name, status }), "");
      setOpen(false);
      onSaved(student ? "수업 명렬을 수정했습니다. 기존 평가 기록은 변경되지 않았습니다." : "학생을 수업 명렬에 추가했습니다.");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setBusy(false);
    }
  }

  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><button className={student ? "quiet-button" : "primary-button"}>{student ? "수정" : "학생 추가"}</button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content course-edit-dialog">
      <Dialog.Title>{student ? "수업 명렬 학생 수정" : "수업 명렬에 학생 추가"}</Dialog.Title>
      <Dialog.Description>수업 명렬만 변경합니다. 기존 수행평가의 학생과 점수는 변경되지 않습니다.</Dialog.Description>
      <div className="course-edit-fields">
        <label>번호<input value={number} onChange={(event) => setNumber(event.target.value)} /></label>
        <label>이름<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>상태<select value={status} onChange={(event) => setStatus(event.target.value)}><option>재학</option><option>전출</option></select></label>
      </div>
      {notice && <p className="form-notice" role="alert">{notice}</p>}
      <div className="dialog-actions"><Dialog.Close asChild><button className="quiet-button" disabled={busy}>취소</button></Dialog.Close><button className="primary-button" disabled={busy} onClick={() => void save()}>저장</button></div>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

export function CourseStudentDelete({ roster, student, onSaved }: Props & { student: models.CourseRosterStudent }) {
  const [open, setOpen] = useState(false);
  const [expected, setExpected] = useState<models.CourseRoster | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  function changeOpen(value: boolean) {
    if (value) { setExpected(snapshot(roster)); setConfirmation(""); setNotice(""); }
    setOpen(value);
  }
  async function remove() {
    if (!expected) return;
    setBusy(true);
    try {
      await UpdateCourseRosterStudent(roster.id, expected, "삭제", student.number, new models.CourseRosterStudent({}), confirmation);
      setOpen(false);
      onSaved("수업 명렬에서 학생을 삭제했습니다. 기존 평가 기록은 유지됩니다.");
    } catch (error) {
      setNotice(String(error));
    } finally { setBusy(false); }
  }

  return <AlertDialog.Root open={open} onOpenChange={changeOpen}>
    <AlertDialog.Trigger asChild><button className="danger-button">삭제</button></AlertDialog.Trigger>
    <AlertDialog.Portal><AlertDialog.Overlay className="dialog-overlay" /><AlertDialog.Content className="dialog-content course-edit-dialog">
      <AlertDialog.Title>수업 명렬에서 학생을 삭제할까요?</AlertDialog.Title>
      <AlertDialog.Description>{student.number}번 {student.name} 학생을 이 수업 명렬에서만 삭제합니다. 기존 수행평가의 학생 정보와 점수는 유지되고, 이름 없는 변경 이력이 남습니다.</AlertDialog.Description>
      <label className="course-delete-label">확인 문구: 수업 명렬 학생 삭제<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {notice && <p className="form-notice" role="alert">{notice}</p>}
      <div className="dialog-actions"><AlertDialog.Cancel asChild><button className="quiet-button" disabled={busy}>취소</button></AlertDialog.Cancel><button className="danger-button" disabled={busy || confirmation !== "수업 명렬 학생 삭제"} onClick={() => void remove()}>명렬에서 삭제</button></div>
    </AlertDialog.Content></AlertDialog.Portal>
  </AlertDialog.Root>;
}
