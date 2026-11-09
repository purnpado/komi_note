import "./setup-restore.css";
import { FormEvent, useEffect, useState } from "react";
import kkomiIcon from "../../assets/images/kkomi-note-icon.png";
import { termsVersion } from "../app-shell/AppShellDialogs";
import { DefaultRecoveryFilePath, InitializeVault, SelectRecoveryFile } from "../../../wailsjs/go/main/App";
import { main as models } from "../../../wailsjs/go/models";
import { errorMessage } from "../shared/format";
import { SetupRestore } from "./SetupRestore";
import { SetupPasswordStep } from "./SetupPasswordStep";
import "../shared/setup-settings-form.css";
import "./security.css";

const teachingGradeOptions = ["1학년", "2학년", "3학년"];
const teachingClassOptions = Array.from({ length: 10 }, (_, index) => `${index + 1}반`);

export function SetupWizard({
  onComplete,
  onRestored,
  agreementAcceptedAt,
  version,
}: {
  onComplete: (result: models.SessionResult) => void;
  onRestored: () => void;
  agreementAcceptedAt: string;
  version: string;
}) {
  const [config, setConfig] = useState({
    schoolName: "",
    schoolYear: "2026",
    teacherRole: "담임 교사",
    grade: "",
    classNumber: "",
    teacherLabel: "교사",
    teachingSubject: "",
    teachingClasses: [] as string[],
    autoLockMinutes: 5,
    termsVersion,
    termsAcceptedAt: agreementAcceptedAt,
  });
  const [masterPassword, setMasterPassword] = useState("");
  const [masterConfirm, setMasterConfirm] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirm, setRecoveryConfirm] = useState("");
  const [recoveryPath, setRecoveryPath] = useState("");
  const [teachingGrade, setTeachingGrade] = useState("");
  const [teachingClass, setTeachingClass] = useState("");
  const [customTeachingClass, setCustomTeachingClass] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // C3(2026-11-10): 1 역할·학급 → 2 마스터 비밀번호 → 3 복구 파일
  const [step, setStep] = useState<1 | 2 | 3>(1);
  useEffect(() => {
    void DefaultRecoveryFilePath()
      .then(setRecoveryPath)
      .catch(() => {});
  }, []);
  async function chooseFile() {
    try {
      const path = await SelectRecoveryFile();
      if (path) setRecoveryPath(path);
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step === 1) {
      // 1단계 내용은 여기서 미리 확인해, 마지막 단계에서야 알게 되지 않게 한다(최종 검사는 Go가 다시 함).
      if (!String(config.schoolYear || "").trim()) {
        setNotice("학년도를 입력해 주세요.");
        return;
      }
      if (config.teacherRole === "담임 교사" && (!String(config.grade || "").trim() || !String(config.classNumber || "").trim())) {
        setNotice("담임 교사는 학년과 반을 입력해 주세요.");
        return;
      }
      setNotice("");
      setStep(2);
      return;
    }
    if (step === 2) {
      if (masterPassword.length < 10) {
        setNotice("마스터 비밀번호는 10자 이상으로 정해 주세요.");
        return;
      }
      if (masterPassword !== masterConfirm) {
        setNotice("마스터 비밀번호가 서로 다릅니다.");
        return;
      }
      setNotice("");
      setStep(3);
      return;
    }
    if (masterPassword !== masterConfirm) {
      setNotice("마스터 비밀번호가 서로 다릅니다.");
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setNotice("복구용 암호가 서로 다릅니다.");
      return;
    }
    if (masterPassword === recoveryPassword) {
      setNotice("마스터 비밀번호와 복구용 암호는 다르게 설정해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const result = await InitializeVault(
        new models.SetupRequest({
          config: new models.ClassConfig(config),
          masterPassword,
          recoveryPassword,
          recoveryFilePath: recoveryPath,
        }),
      );
      onComplete(result);
    } catch (error) {
      const message = errorMessage(error);
      // 1·2단계 내용 때문에 거절되면 그 단계로 돌아가 고칠 수 있게 한다
      if (/학년|반을|담임|자동 잠금|교외체험학습|학기|기간/.test(message)) setStep(1);
      else if (/마스터 비밀번호/.test(message)) setStep(2);
      setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="setup-screen">
      <form className="setup-card" onSubmit={submit}>
        <div className="lock-title">
          <img className="brand-mark" src={kkomiIcon} alt="꼬미노트 꼬미" />
          <div>
            <strong>꼬미노트</strong>
            <small>최초 안전 설정</small>
          </div>
        </div>
        <p className="eyebrow">1차 보안 설정</p>
        <h1>나만의 암호화 보관함 만들기</h1>
        <p className="setup-copy">
          학생·수업 정보를 넣기 전에 교사 역할과 기본 정보, 잠금 방식을 설정합니다. 이 정보도 암호화해 저장합니다.
        </p>
        <ol className="setup-steps" aria-label="설정 단계">
          {["역할·학급", "마스터 비밀번호", "복구 파일"].map((label, index) => (
            <li
              key={label}
              className={step === index + 1 ? "current" : step > index + 1 ? "done" : ""}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <b>{index + 1}</b>
              {label}
            </li>
          ))}
        </ol>
        {step === 1 && <SetupRestore onRestored={onRestored} />}
        <p className="creator-watermark setup-watermark">꼬미노트 {version ? `v${version}` : ""} · 푸른파도소리 제작</p>
        {step === 1 && (
          <div className="form-grid">
            <label className="role-choice-label">
              이용 역할
              <div className="role-choice-list">
                <button
                  type="button"
                  className={config.teacherRole === "담임 교사" ? "role-choice selected" : "role-choice"}
                  onClick={() => setConfig({ ...config, teacherRole: "담임 교사" })}
                >
                  담임 교사
                </button>
                <button
                  type="button"
                  className={config.teacherRole === "비담임 교과 교사" ? "role-choice selected" : "role-choice"}
                  onClick={() =>
                    setConfig({
                      ...config,
                      teacherRole: "비담임 교과 교사",
                      grade: "",
                      classNumber: "",
                    })
                  }
                >
                  비담임 교과 교사
                </button>
              </div>
              <small>
                {config.teacherRole === "담임 교사"
                  ? "담임용·수업용·업무용 전체 기능을 사용합니다."
                  : "수업용·업무용 기능을 사용하며 담임용 메뉴는 표시하지 않습니다."}
              </small>
            </label>
            <label>
              학교명
              <input
                value={config.schoolName}
                onChange={(event) => setConfig({ ...config, schoolName: event.target.value })}
                placeholder="선택 입력"
              />
            </label>
            <label>
              학년도
              <input
                value={config.schoolYear}
                onChange={(event) => setConfig({ ...config, schoolYear: event.target.value })}
                placeholder="예: 2026"
              />
            </label>
            <label>
              학년
              <input
                disabled={config.teacherRole !== "담임 교사"}
                value={config.grade}
                onChange={(event) => setConfig({ ...config, grade: event.target.value })}
                placeholder="예: 2"
              />
            </label>
            <label>
              반
              <input
                disabled={config.teacherRole !== "담임 교사"}
                value={config.classNumber}
                onChange={(event) => setConfig({ ...config, classNumber: event.target.value })}
                placeholder="예: 3"
              />
            </label>
            <label>
              교사 표기
              <input
                value={config.teacherLabel}
                onChange={(event) => setConfig({ ...config, teacherLabel: event.target.value })}
              />
            </label>
            <label>
              담당 교과
              <input
                value={config.teachingSubject}
                onChange={(event) => setConfig({ ...config, teachingSubject: event.target.value })}
                placeholder="예: 기술·가정"
              />
            </label>
            <div className="class-selector-label">
              수업 학년·반
              <div className="class-selector">
                <select value={teachingGrade} onChange={(event) => setTeachingGrade(event.target.value)}>
                  <option value="">학년 선택</option>
                  {teachingGradeOptions.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
                <select value={teachingClass} onChange={(event) => setTeachingClass(event.target.value)}>
                  <option value="">반 선택</option>
                  {teachingClassOptions.map((className) => (
                    <option key={className} value={className}>
                      {className}
                    </option>
                  ))}
                  <option value="__직접입력">직접 입력</option>
                </select>
                {teachingClass === "__직접입력" && (
                  <input
                    className="custom-class-input"
                    value={customTeachingClass}
                    onChange={(event) => setCustomTeachingClass(event.target.value)}
                    placeholder="예: 11반·특수반"
                  />
                )}
                <button
                  type="button"
                  className="quiet-button compact-button"
                  disabled={
                    !teachingGrade || !teachingClass || (teachingClass === "__직접입력" && !customTeachingClass.trim())
                  }
                  onClick={() => {
                    const className = teachingClass === "__직접입력" ? customTeachingClass.trim() : teachingClass;
                    const next = `${teachingGrade} ${className}`;
                    setConfig((current) => {
                      const classes = current.teachingClasses || [];
                      return classes.includes(next) ? current : { ...current, teachingClasses: [...classes, next] };
                    });
                  }}
                >
                  수업 추가
                </button>
              </div>
              <div className="selected-class-list">
                {(config.teachingClasses || []).map((className) => (
                  <button
                    type="button"
                    className="selected-class-chip"
                    key={className}
                    onClick={() =>
                      setConfig((current) => ({
                        ...current,
                        teachingClasses: (current.teachingClasses || []).filter((item) => item !== className),
                      }))
                    }
                  >
                    {className} ×
                  </button>
                ))}
              </div>
              <small>학년과 반을 선택해 여러 수업을 추가할 수 있습니다. 선택한 항목을 누르면 삭제됩니다.</small>
            </div>
            <label>
              자동 잠금 시간
              <select
                value={config.autoLockMinutes}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    autoLockMinutes: Number(event.target.value),
                  })
                }
              >
                {[1, 3, 5, 10, 15, 30, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}분
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {step > 1 && (
          <SetupPasswordStep
            step={step as 2 | 3}
            masterPassword={masterPassword}
            setMasterPassword={setMasterPassword}
            masterConfirm={masterConfirm}
            setMasterConfirm={setMasterConfirm}
            recoveryPath={recoveryPath}
            chooseFile={() => void chooseFile()}
            recoveryPassword={recoveryPassword}
            setRecoveryPassword={setRecoveryPassword}
            recoveryConfirm={recoveryConfirm}
            setRecoveryConfirm={setRecoveryConfirm}
          />
        )}
        {notice && <p className="form-notice">{notice}</p>}
        <div className="setup-step-actions">
          {step > 1 && (
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setNotice("");
                setStep((step - 1) as 1 | 2 | 3);
              }}
            >
              ← 이전
            </button>
          )}
          <button className="primary-button setup-submit" disabled={busy} type="submit">
            {step < 3 ? "다음" : busy ? "암호화 보관함을 만드는 중입니다" : "안전한 보관함 만들기"} <span>→</span>
          </button>
        </div>
      </form>
    </div>
  );
}
