import { useState } from "react";
import { RestoreEncryptedBackup, SelectBackupFile } from "../../../wailsjs/go/main/App";
import { errorMessage } from "../shared/format";

// 새 컴퓨터에서 예전 암호화 백업으로 바로 시작한다. 백업 당시 마스터 비밀번호가 필요하다.
export function SetupRestore({ onRestored }: { onRestored: () => void }) {
  const [path, setPath] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function choose() {
    try {
      const selected = await SelectBackupFile();
      if (selected) setPath(selected);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function restore() {
    setBusy(true);
    try {
      await RestoreEncryptedBackup(path, password);
      setPassword("");
      onRestored();
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="setup-restore">
      <summary>예전에 저장한 꼬미노트 암호화 백업이 있나요? 백업으로 시작하기</summary>
      <p>컴퓨터를 바꿨다면 새로 만들지 말고 백업 파일(.kkomi-backup)로 자료를 되살리세요. 백업할 때의 마스터 비밀번호가 필요합니다.</p>
      <div className="setup-restore-row">
        <button type="button" className="quiet-button" onClick={() => void choose()} disabled={busy}>백업 파일 선택</button>
        <code>{path || "선택한 파일 없음"}</code>
      </div>
      <label>
        백업할 때의 마스터 비밀번호
        <input type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      <button type="button" className="primary-button" disabled={busy || !path || !password} onClick={() => void restore()}>
        {busy ? "되살리는 중입니다" : "이 백업으로 시작하기"}
      </button>
      {notice && <p className="setup-restore-notice" role="alert">{notice}</p>}
    </details>
  );
}
