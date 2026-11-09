import { FormEvent, useState } from "react";
import { AddStudent, SaveStudent } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";
import { formatPhone } from "./StudentDetail";

export function StudentEditor({
  student,
  students,
  navigate,
  mode = "edit",
  close,
  saved,
}: {
  student: models.Student;
  students: models.Student[];
  navigate: (student: models.Student) => void;
  mode?: "add" | "edit";
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(new models.Student(student));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const orderedStudents = [...students].sort(
    (left, right) => left.number - right.number,
  );
  const currentIndex = orderedStudents.findIndex(
    (item) => item.id === student.id,
  );
  const previousStudent =
    currentIndex > 0 ? orderedStudents[currentIndex - 1] : null;
  const nextStudent =
    currentIndex >= 0 && currentIndex < orderedStudents.length - 1
      ? orderedStudents[currentIndex + 1]
      : null;
  function moveTo(nextStudent: models.Student | null) {
    if (!nextStudent) return;
    if (mode === "edit" && JSON.stringify(draft) !== JSON.stringify(student)) {
      setNotice("수정 중인 내용을 먼저 저장하거나 취소해 주세요.");
      return;
    }
    navigate(nextStudent);
  }
  const phoneFields: (keyof models.Student)[] = [
    "studentPhone",
    "fatherPhone",
    "motherPhone",
    "guardianPhone",
  ];
  const input = (label: string, key: keyof models.Student, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        value={String(draft[key] || "")}
        onChange={(event) =>
          setDraft(
            new models.Student({
              ...draft,
              [key]: phoneFields.includes(key)
                ? formatPhone(event.target.value)
                : event.target.value,
            }),
          )
        }
      />
    </label>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      setBusy(true);
      if (mode === "add") await AddStudent(draft);
      else await SaveStudent(draft);
      await saved();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-layer">
      <button
        type="button"
        className="editor-nav editor-nav-previous"
        onClick={() => moveTo(previousStudent)}
        disabled={!previousStudent || busy}
        aria-label="이전 학생"
        title="이전 학생"
      >
        ‹
      </button>
      <form className="student-editor" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <p className="eyebrow">암호화 학생 정보</p>
            <h3>
              {mode === "add"
                ? "학생 직접 추가"
                : `${draft.number}번 ${draft.name}`}
            </h3>
          </div>
          <button type="button" className="quiet-button" onClick={close}>
            닫기
          </button>
        </div>
        <div className="form-grid">
          {input("번호", "number", "number")}
          {input("성명", "name")}
          {input("성별", "gender")}
          {input("생년월일", "birthDate", "date")}
          {input("주소", "address")}
          {input("전입일", "transferInDate", "date")}
          {input("학생 휴대전화", "studentPhone")}
          {input("부 성명", "fatherName")}
          {input("부 휴대전화", "fatherPhone")}
          {input("모 성명", "motherName")}
          {input("모 휴대전화", "motherPhone")}
          {input("기타 보호자 성명", "guardianName")}
          {input("보호자 관계", "guardianRelationship")}
          {input("보호자 휴대전화", "guardianPhone")}
          <label>
            결석신고서 보호자 성명
            <select
              value={draft.documentGuardian || ""}
              onChange={(event) => setDraft(new models.Student({ ...draft, documentGuardian: event.target.value }))}
            >
              <option value="">자동 선택 (모 → 부 → 기타 보호자)</option>
              <option value="모">모 성명</option>
              <option value="부">부 성명</option>
              <option value="기타 보호자">기타 보호자 성명</option>
            </select>
          </label>
          {input("진로희망", "careerHope")}
          <label style={{ gridColumn: "1 / -1" }}>
            특이사항 · 지도 유의사항
            <textarea
              value={draft.note || ""}
              onChange={(event) =>
                setDraft(new models.Student({ ...draft, note: event.target.value }))
              }
              placeholder="알레르기, 건강 상태, 교우관계, 지도 유의사항 등 특이사항을 기록해 주세요."
              rows={3}
              style={{
                display: "block",
                boxSizing: "border-box",
                width: "100%",
                marginTop: "7px",
                padding: "11px 12px",
                border: "1px solid #dce3ea",
                borderRadius: "8px",
                background: "#fff",
                color: "#364656",
                font: "inherit",
                resize: "vertical",
              }}
            />
          </label>
        </div>
        {notice && <p className="form-notice">{notice}</p>}
        <div className="editor-actions">
          <button type="button" className="quiet-button" onClick={close}>
            취소
          </button>
          <button className="primary-button" disabled={busy}>
            {busy
              ? "저장 중입니다"
              : mode === "add"
                ? "학생 추가"
                : "암호화 저장"}
          </button>
        </div>
      </form>
      <button
        type="button"
        className="editor-nav editor-nav-next"
        onClick={() => moveTo(nextStudent)}
        disabled={!nextStudent || busy}
        aria-label="다음 학생"
        title="다음 학생"
      >
        ›
      </button>
    </div>
  );
}
