import { FormEvent, useState } from "react";
import { ChangeMasterPassword } from "../../../wailsjs/go/main/App";
import { errorMessage } from "../shared/format";

const MIN_LENGTH = 10;

// 마스터 비밀번호 변경: 지금 비밀번호를 확인한 뒤 새 비밀번호로 바꾼다.
// 보관함 키는 그대로라 간편 PIN과 복구 파일은 계속 쓸 수 있다.
export function PasswordChangePanel() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState(false);

  function reset() {
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    if (next.trim().length < MIN_LENGTH) {
      setNotice(`새 비밀번호는 ${MIN_LENGTH}자 이상 입력해 주세요.`);
      return;
    }
    if (next !== confirm) {
      setNotice("새 비밀번호와 확인이 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      await ChangeMasterPassword(current, next);
      reset();
      setOpen(false);
      setDone(true);
      setNotice("마스터 비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 사용하세요. 간편 PIN과 복구 파일은 그대로 쓸 수 있습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel settings-extra-panel" aria-labelledby="settings-password-title">
      <div className="settings-extra-heading">
        <div>
          <p className="eyebrow">보안</p>
          <h3 id="settings-password-title">마스터 비밀번호 변경</h3>
          <p>지금 비밀번호를 확인한 뒤 새 비밀번호로 바꿉니다. 간편 PIN과 복구 파일은 그대로 쓸 수 있습니다.</p>
        </div>
        {!open && (
          <button type="button" className="quiet-button" onClick={() => { setOpen(true); setNotice(""); setDone(false); }}>
            비밀번호 변경
          </button>
        )}
      </div>
      {open && (
        <form className="settings-extra-form" onSubmit={submit}>
          <label>
            지금 비밀번호
            <input type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
          </label>
          <label>
            새 비밀번호({MIN_LENGTH}자 이상)
            <input type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
          </label>
          <label>
            새 비밀번호 확인
            <input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </label>
          <div className="settings-extra-actions">
            <button type="button" className="quiet-button" onClick={() => { setOpen(false); reset(); setNotice(""); }} disabled={busy}>
              취소
            </button>
            <button type="submit" className="primary-button" disabled={busy || !current || !next || !confirm}>
              {busy ? "바꾸는 중입니다" : "새 비밀번호로 변경"}
            </button>
          </div>
        </form>
      )}
      {notice && <p className={done ? "settings-extra-notice ok" : "settings-extra-notice"} role="status">{notice}</p>}
    </section>
  );
}
