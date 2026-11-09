import { KnowNote, settingsNotes } from "../shared/KnowNote";
import { useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import {
  CreateRecoveryFile,
  ExportEncryptedBackup,
  RestoreEncryptedBackup,
  SelectBackupFile,
} from "../../../wailsjs/go/main/App";
import { errorMessage } from "../shared/format";

// 암호화 백업 내보내기·되살리기와 복구 파일 다시 만들기.
// 백업 파일은 그때의 마스터 비밀번호로만 열리며, USB 등 다른 곳에 보관하도록 안내한다.
export function BackupPanel() {
  const [notice, setNotice] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restorePath, setRestorePath] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");

  function show(message: string, success: boolean) {
    setNotice(message);
    setOk(success);
  }

  async function exportBackup() {
    setBusy(true);
    try {
      const path = await ExportEncryptedBackup();
      if (path) show(`암호화 백업을 저장했습니다: ${path}\nUSB나 개인 클라우드처럼 이 컴퓨터가 아닌 곳에 보관하세요. 되살릴 때는 지금 마스터 비밀번호가 필요합니다.`, true);
    } catch (error) {
      show(errorMessage(error), false);
    } finally {
      setBusy(false);
    }
  }

  async function chooseBackup() {
    try {
      const path = await SelectBackupFile();
      if (path) setRestorePath(path);
    } catch (error) {
      show(errorMessage(error), false);
    }
  }

  async function restore() {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const result = await RestoreEncryptedBackup(restorePath, restorePassword);
      setRestorePassword("");
      setRestorePath("");
      show(
        `백업을 되살렸습니다(학생 ${result.studentCount}명${result.attachmentsRestored ? `, 사진·영수증 ${result.attachmentsRestored}장` : ""}${result.attachmentsFailed ? `, 되살리지 못한 사진 ${result.attachmentsFailed}장` : ""}). 화면을 새 자료로 다시 불러옵니다. 간편 PIN은 다시 등록해 주세요.` +
          (result.recoveryMismatch ? " 지금 가진 복구 파일과 맞지 않을 수 있으니 아래에서 새 복구 파일을 만들어 두세요." : ""),
        true,
      );
      window.setTimeout(() => window.location.reload(), 2500);
    } catch (error) {
      show(errorMessage(error), false);
    } finally {
      setBusy(false);
    }
  }

  async function createRecovery() {
    if (recoveryPassword.trim().length < 10) {
      show("복구용 암호는 10자 이상 입력해 주세요.", false);
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      show("복구용 암호와 확인이 서로 다릅니다.", false);
      return;
    }
    setBusy(true);
    try {
      const path = await CreateRecoveryFile(recoveryPassword);
      if (path) {
        setRecoveryOpen(false);
        setRecoveryPassword("");
        setRecoveryConfirm("");
        show(`새 복구 파일을 저장했습니다: ${path}\n복구용 암호와 함께 이 컴퓨터가 아닌 곳에 보관하세요.`, true);
      }
    } catch (error) {
      show(errorMessage(error), false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-extra-panel" aria-labelledby="settings-backup-title">
      <div className="settings-extra-heading">
        <div>
          <p className="eyebrow">자료 보호</p>
          <h3 id="settings-backup-title">암호화 백업 · 되살리기</h3>
          <p>
            컴퓨터 고장·교체에 대비해 보관함 전체를 암호화된 파일로 저장합니다. 백업 파일은 그때의 마스터 비밀번호로만
            열리며, 학생 사진·영수증 사진도 암호화된 채로 함께 들어갑니다. 간편 PIN 정보는 들어가지 않습니다. 학기 중 정기적으로 USB 등에 저장해 두세요.
          </p>
          <KnowNote items={[...settingsNotes.backup]} />
        </div>
        <button type="button" className="primary-button" onClick={() => void exportBackup()} disabled={busy}>
          암호화 백업 저장
        </button>
      </div>
      <div className="settings-extra-form">
        <strong>백업 파일로 되살리기</strong>
        <div className="settings-extra-row">
          <button type="button" className="quiet-button" onClick={() => void chooseBackup()} disabled={busy}>
            백업 파일 선택
          </button>
          <code className="settings-extra-path">{restorePath || "선택한 파일 없음"}</code>
        </div>
        <label>
          백업할 때의 마스터 비밀번호
          <input type="password" autoComplete="off" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} />
        </label>
        <div className="settings-extra-actions">
          <button type="button" className="danger-button" disabled={busy || !restorePath || !restorePassword} onClick={() => setConfirmOpen(true)}>
            이 백업으로 되살리기
          </button>
        </div>
      </div>
      <div className="settings-extra-form">
        <div className="settings-extra-row between">
          <strong>복구 파일 다시 만들기</strong>
          {!recoveryOpen && (
            <button type="button" className="quiet-button" onClick={() => setRecoveryOpen(true)} disabled={busy}>
              새 복구 파일 만들기
            </button>
          )}
        </div>
        <small>비밀번호를 잊었을 때 쓰는 복구 파일을 잃어버렸거나, 다른 컴퓨터의 백업을 되살린 뒤에 새로 만듭니다.</small>
        {recoveryOpen && (
          <>
            <label>
              새 복구용 암호(10자 이상, 마스터 비밀번호와 다르게)
              <input type="password" autoComplete="new-password" value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} />
            </label>
            <label>
              복구용 암호 확인
              <input type="password" autoComplete="new-password" value={recoveryConfirm} onChange={(event) => setRecoveryConfirm(event.target.value)} />
            </label>
            <div className="settings-extra-actions">
              <button type="button" className="quiet-button" onClick={() => { setRecoveryOpen(false); setRecoveryPassword(""); setRecoveryConfirm(""); }} disabled={busy}>
                취소
              </button>
              <button type="button" className="primary-button" onClick={() => void createRecovery()} disabled={busy || !recoveryPassword || !recoveryConfirm}>
                복구 파일 저장
              </button>
            </div>
          </>
        )}
      </div>
      {notice && <p className={ok ? "settings-extra-notice ok" : "settings-extra-notice"} role="status">{notice}</p>}
      <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>지금 자료를 백업 시점으로 바꿀까요?</AlertDialog.Title>
            <AlertDialog.Description>
              학생 명렬·상담·출결 등 지금 보관함의 모든 자료가 선택한 백업 파일의 내용으로 바뀝니다. 바로 전 자료는
              프로그램 폴더의 자동 백업(vault.dat.bak.1)으로 남습니다. 되살린 뒤에는 간편 PIN을 다시 등록해야 합니다.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => void restore()}>
                  되살리기
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
