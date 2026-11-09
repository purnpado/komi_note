// C3(2026-11-10 화면 점검): 최초 설정 2단계(마스터 비밀번호)와 3단계(복구 파일) 칸.
// 값과 검사는 SetupWizard가 가지고, 여기는 화면만 그린다.
type Props = {
  step: 2 | 3;
  masterPassword: string;
  setMasterPassword: (value: string) => void;
  masterConfirm: string;
  setMasterConfirm: (value: string) => void;
  recoveryPath: string;
  chooseFile: () => void;
  recoveryPassword: string;
  setRecoveryPassword: (value: string) => void;
  recoveryConfirm: string;
  setRecoveryConfirm: (value: string) => void;
};

export function SetupPasswordStep(props: Props) {
  const {
    step,
    masterPassword,
    setMasterPassword,
    masterConfirm,
    setMasterConfirm,
    recoveryPath,
    chooseFile,
    recoveryPassword,
    setRecoveryPassword,
    recoveryConfirm,
    setRecoveryConfirm,
  } = props;
  if (step === 2) {
    return (
      <div className="setup-section">
        <h3>마스터 비밀번호</h3>
        <p>10자 이상으로 설정합니다. 이 비밀번호로 프로그램을 엽니다.</p>
        <div className="form-grid">
          <label>
            마스터 비밀번호
            <input type="password" value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} />
          </label>
          <label>
            비밀번호 확인
            <input type="password" value={masterConfirm} onChange={(event) => setMasterConfirm(event.target.value)} />
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className="setup-section recovery-section">
      <h3>복구 파일 만들기</h3>
      <p>
        비밀번호를 잊었을 때만 사용합니다. 외부 저장장치에 보관하고, 마스터 비밀번호와 다른 복구용 암호를 사용해
        보호합니다.
      </p>
      <label>
        복구 파일 저장 위치
        <div className="file-select">
          <input readOnly value={recoveryPath} placeholder="프로그램 폴더의 backup_key에 자동 저장" />
          <button type="button" className="quiet-button" onClick={chooseFile}>
            저장 위치 선택
          </button>
        </div>
      </label>
      <div className="form-grid">
        <label>
          복구용 암호
          <input
            type="password"
            value={recoveryPassword}
            onChange={(event) => setRecoveryPassword(event.target.value)}
          />
        </label>
        <label>
          복구용 암호 확인
          <input type="password" value={recoveryConfirm} onChange={(event) => setRecoveryConfirm(event.target.value)} />
        </label>
      </div>
    </div>
  );
}
