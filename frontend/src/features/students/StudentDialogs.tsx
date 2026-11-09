import "../shared/dialog-parts.css";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { main as models } from "../../../wailsjs/go/models";

export function ResetStudentsDialog({
  open,
  busy,
  confirmation,
  notice,
  studentCount,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  open: boolean;
  busy: boolean;
  confirmation: string;
  notice: string;
  studentCount: number;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학생 명렬을 초기화할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            저장된 학생 {studentCount}명의 기본정보와 사진, 상담 기록이 모두
            삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="dialog-safe-note">
            <b>유지되는 정보</b>
            <span>
              학급 기본 설정, 마스터 비밀번호, 복구 파일은 삭제하지 않습니다.
            </span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학생 명렬 초기화"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={busy || confirmation !== "학생 명렬 초기화"}
            >
              {busy ? "초기화 중입니다" : "학생 명렬 초기화"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function DeleteStudentDialog({
  student,
  busy,
  confirmation,
  notice,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  student: models.Student | null;
  busy: boolean;
  confirmation: string;
  notice: string;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={student !== null} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학생 정보를 삭제할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            {student?.number}번 {student?.name} 학생의 개인정보와 사진, 상담
            기록이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="dialog-safe-note">
            <b>삭제되는 정보</b>
            <span>주소, 연락처, 사진, 상담 기록을 포함한 학생 상세정보</span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학생 삭제"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={busy || confirmation !== "학생 삭제"}
            >
              {busy ? "삭제 중입니다" : "학생 정보 삭제"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export function AcademicChangeDialog({
  student,
  status,
  date,
  confirmation,
  notice,
  busy,
  changeStatus,
  changeDate,
  changeConfirmation,
  changeOpen,
  submit,
}: {
  student: models.Student | null;
  status: string;
  date: string;
  confirmation: string;
  notice: string;
  busy: boolean;
  changeStatus: (value: string) => void;
  changeDate: (value: string) => void;
  changeConfirmation: (value: string) => void;
  changeOpen: (open: boolean) => void;
  submit: () => Promise<void>;
}) {
  return (
    <AlertDialog.Root open={student !== null} onOpenChange={changeOpen}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay" />
        <AlertDialog.Content className="dialog-content">
          <div className="dialog-symbol">!</div>
          <AlertDialog.Title>학적변동을 처리할까요?</AlertDialog.Title>
          <AlertDialog.Description>
            {student?.number}번 {student?.name} 학생의
            상세정보·사진·연락처·주소·상담 기록을 삭제하고 최소 학적 이력만
            남깁니다. 이 작업은 되돌릴 수 없습니다.
          </AlertDialog.Description>
          <div className="academic-dialog-fields">
            <label className="dialog-label">
              학적변동 종류
              <select
                value={status}
                onChange={(event) => changeStatus(event.target.value)}
              >
                <option value="전출">전출</option>
                <option value="유예">유예</option>
                <option value="자퇴">자퇴</option>
                <option value="면제">면제</option>
                <option value="정원외">정원외</option>
                <option value="조기졸업">조기졸업</option>
              </select>
            </label>
            <label className="dialog-label">
              학적 처리일
              <input
                type="date"
                value={date}
                onChange={(event) => changeDate(event.target.value)}
              />
            </label>
          </div>
          <div className="dialog-safe-note">
            <b>처리 후 보존되는 정보</b>
            <span>
              학생 이름·학적변동 종류·학적 처리일만 남고, 상세보기는 제공하지
              않습니다.
            </span>
          </div>
          <label className="dialog-label">
            확인을 위해 아래 문구를 정확히 입력해 주세요.
            <input
              autoFocus
              value={confirmation}
              onChange={(event) => changeConfirmation(event.target.value)}
              placeholder="학적변동 처리"
            />
          </label>
          {notice && <p className="dialog-notice">{notice}</p>}
          <div className="dialog-actions">
            <AlertDialog.Cancel asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </AlertDialog.Cancel>
            <button
              type="button"
              className="dialog-danger-button"
              onClick={() => void submit()}
              disabled={
                busy || confirmation !== "학적변동 처리" || !status || !date
              }
            >
              {busy ? "처리 중입니다" : "학적변동 처리"}
            </button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
