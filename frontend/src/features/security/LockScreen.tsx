import { FormEvent, useEffect, useState } from "react";
import kkomiIcon from "../../assets/images/kkomi-note-icon.png";
import { ResetMasterPassword, SelectRecoveryFile } from "../../../wailsjs/go/main/App";

import { errorMessage } from "../shared/format";
export function LockScreen({
  notice,
  unlock,
  unlockWithPin,
  hasPin = false,
  pinLocked = false,
  pinAttempts = 0,
  pinNotice = "",
  refreshAppState,
  version,
}: {
  notice: string;
  unlock: (password: string) => Promise<void>;
  unlockWithPin?: (pin: string) => Promise<void>;
  hasPin?: boolean;
  pinLocked?: boolean;
  pinAttempts?: number;
  pinNotice?: string;
  refreshAppState?: () => Promise<void>;
  version: string;
}) {
  const [mode, setMode] = useState<"pin" | "password">(() => {
    return hasPin && !pinLocked ? "pin" : "password";
  });
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localNotice, setLocalNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pinLocked && mode === "pin") {
      setMode("password");
      setLocalNotice("PIN 번호 입력 실패 횟수를 초과하여 간편 로그인이 잠겼습니다. 마스터 비밀번호로 로그인해 주세요.");
    }
  }, [pinLocked, mode]);

  useEffect(() => {
    if (hasPin && !pinLocked) {
      setMode("pin");
    } else {
      setMode("password");
    }
  }, [hasPin, pinLocked]);

  async function submitPinUnlock(event: FormEvent) {
    event.preventDefault();
    if (!pin.trim() || !unlockWithPin) return;
    setBusy(true);
    setLocalNotice("");
    try {
      await unlockWithPin(pin);
    } catch (error) {
      setLocalNotice(errorMessage(error));
      setPin("");
      if (refreshAppState) void refreshAppState();
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordUnlock(event: FormEvent) {
    event.preventDefault();
    if (!password.trim()) return;
    setBusy(true);
    setLocalNotice("");
    try {
      await unlock(password);
    } catch (error) {
      setLocalNotice(errorMessage(error));
      if (refreshAppState) void refreshAppState();
    } finally {
      setBusy(false);
    }
  }

  async function selectRecoveryFile() {
    try {
      const path = await SelectRecoveryFile();
      if (path) setRecoveryPath(path);
    } catch (error) {
      setLocalNotice(errorMessage(error));
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setLocalNotice("새 비밀번호가 서로 다릅니다.");
      return;
    }
    setBusy(true);
    try {
      await ResetMasterPassword(recoveryPath, recoveryPassword, newPassword);
      setRecovering(false);
      setPassword("");
      setLocalNotice(
        "새 비밀번호가 설정되었습니다. 새 비밀번호로 보관함을 열어 주세요.",
      );
      if (refreshAppState) void refreshAppState();
    } catch (error) {
      setLocalNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  // 화면 안내 메시지 우선순위
  const currentNotice = localNotice || notice;

  return (
    <div className="lock-screen">
      <div className="lock-art">
        <img className="large-mark" src={kkomiIcon} alt="꼬미노트 꼬미" />
        <p>
          학생 정보는 이 컴퓨터에만
          <br />
          암호화하여 저장됩니다.
        </p>
        <ul>
          <li>마스터 암호 및 간편 PIN 잠금</li>
          <li>Argon2id + AES-256 종단 암호화</li>
          <li>오프라인 교사용 독립 보관함</li>
        </ul>
      </div>

      <div className="unlock-card">
        <div className="lock-title">
          <img className="brand-mark" src={kkomiIcon} alt="꼬미노트 꼬미" />
          <div>
            <strong>꼬미노트</strong>
            <small>안전한 교사 업무공간</small>
          </div>
        </div>

        {recovering ? (
          <form onSubmit={resetPassword}>
            <h1>비밀번호를 재설정합니다</h1>
            <p>별도로 보관한 복구 파일과 복구용 암호가 필요합니다.</p>
            <label>
              복구 파일
              <div className="file-select">
                <input
                  readOnly
                  value={recoveryPath}
                  placeholder="저장해 둔 복구 파일 선택"
                />
                <button
                  type="button"
                  className="quiet-button"
                  onClick={selectRecoveryFile}
                >
                  찾기
                </button>
              </div>
            </label>
            <label>
              복구용 암호
              <input
                type="password"
                value={recoveryPassword}
                onChange={(event) => setRecoveryPassword(event.target.value)}
              />
            </label>
            <label>
              새 마스터 비밀번호
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="10자 이상 입력"
              />
            </label>
            <label>
              새 비밀번호 확인
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
            {currentNotice && <p className="form-notice">{currentNotice}</p>}
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "재설정 중입니다" : "새 비밀번호 저장"}
            </button>
            <button
              type="button"
              className="text-button wide-text-button"
              onClick={() => setRecovering(false)}
            >
              로그인 화면으로 돌아가기
            </button>
          </form>
        ) : mode === "pin" && hasPin && !pinLocked ? (
          <form onSubmit={submitPinUnlock}>
            <h1>간편 PIN 로그인</h1>
            <p>설정한 간편 숫자 PIN 번호로 빠르게 엽니다.</p>

            <label>
              간편 PIN 번호
              <input
                autoFocus
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(event) => {
                  const val = event.target.value.replace(/[^0-9]/g, "");
                  setPin(val);
                }}
                placeholder="숫자 PIN 입력"
                style={{
                  fontSize: "1.25rem",
                  letterSpacing: "0.25rem",
                  textAlign: "center",
                }}
              />
            </label>

            {pinAttempts > 0 && (
              <small style={{ color: "#d97706", display: "block", marginBottom: "0.5rem" }}>
                ⚠️ 오류 횟수: {pinAttempts}회 / 5회 (5회 실패 시 마스터 비밀번호 필요)
              </small>
            )}

            {currentNotice && <p className="form-notice">{currentNotice}</p>}

            <button className="primary-button" type="submit" disabled={busy || pin.length < 4}>
              {busy ? "확인 중..." : "간편 로그인"} <span>→</span>
            </button>

            <button
              type="button"
              className="text-button wide-text-button"
              onClick={() => {
                setMode("password");
                setLocalNotice("");
              }}
            >
              마스터 비밀번호로 로그인
            </button>

            <small className="hint">
              환경설정에서 언제든지 간편 PIN 번호를 변경하거나 삭제할 수 있습니다.
            </small>

            <small className="creator-watermark lock-watermark">
              꼬미노트 {version ? `v${version}` : ""} · 푸른파도소리 제작
            </small>
          </form>
        ) : (
          <form onSubmit={submitPasswordUnlock}>
            <h1>꼬미노트를 열어 주세요</h1>
            <p>
              {pinLocked
                ? "간편 PIN 오류로 마스터 비밀번호 로그인이 필요합니다."
                : "마스터 비밀번호로 암호화된 꼬미노트를 엽니다."}
            </p>

            {pinLocked && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  padding: "0.625rem",
                  borderRadius: "8px",
                  fontSize: "0.85rem",
                  marginBottom: "0.75rem",
                }}
              >
                🔒 PIN 5회 연속 실패로 간편 로그인이 비활성화되었습니다. 마스터 비밀번호로 로그인하시면 간편 로그인이 다시 활성화됩니다.
              </div>
            )}

            {pinNotice && !pinLocked && (
              <div className="form-notice" role="status" style={{ marginBottom: "0.75rem" }}>
                🖥️ {pinNotice}
              </div>
            )}

            <label>
              마스터 비밀번호
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="마스터 비밀번호 입력"
              />
            </label>

            {currentNotice && <p className="form-notice">{currentNotice}</p>}

            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "꼬미노트 여는 중..." : "안전하게 시작하기"} <span>→</span>
            </button>

            {hasPin && !pinLocked && (
              <button
                type="button"
                className="text-button wide-text-button"
                onClick={() => {
                  setMode("pin");
                  setLocalNotice("");
                }}
              >
                간편 PIN 번호로 로그인
              </button>
            )}

            <button
              type="button"
              className="text-button wide-text-button"
              onClick={() => {
                setRecovering(true);
                setLocalNotice("");
              }}
            >
              비밀번호를 잊었어요
            </button>

            <small className="hint">
              복구 파일은 프로그램 데이터와 다른 안전한 위치에 보관해 주세요.
            </small>

            <small className="creator-watermark lock-watermark">
              꼬미노트 {version ? `v${version}` : ""} · 푸른파도소리 제작
            </small>
          </form>
        )}
      </div>
    </div>
  );
}