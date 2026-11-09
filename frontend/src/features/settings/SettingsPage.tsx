import { KnowNote, settingsNotes } from "../shared/KnowNote";
import { BackgroundPanel } from "./BackgroundPanel";
import { main as models } from "../../../wailsjs/go/models";
import { HelpGuide } from "../shared/HelpGuide";
import { FeedbackPanel } from "./FeedbackPanel";
import { PasswordChangePanel } from "./PasswordChangePanel";
import { BackupPanel } from "./BackupPanel";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import "../shared/setup-settings-form.css";
import "./settings.css";
import { useSettingsPage, teachingGradeOptions, teachingClassOptions, isClassicTheme } from "./useSettingsPage";
import { SettingsAcademicCard } from "./SettingsAcademicCard";
import { SettingsPrimaryCard } from "./SettingsPrimaryCard";

export function SettingsFeaturePage({
  config,
  saveConfig,
}: {
  config: models.ClassConfig;
  saveConfig: (config: models.ClassConfig) => Promise<void>;
}) {
  const hookView = useSettingsPage({ config, saveConfig });
  const {
    draft,
    setDraft,
    notice,
    setNotice,
    pinRemoveOpen,
    setPinRemoveOpen,
    busy,
    setBusy,
    teachingGrade,
    setTeachingGrade,
    teachingClass,
    setTeachingClass,
    customTeachingClass,
    setCustomTeachingClass,
    hasPin,
    setHasPin,
    showPinForm,
    setShowPinForm,
    pinInput,
    setPinInput,
    pinConfirmInput,
    setPinConfirmInput,
    pinNotice,
    setPinNotice,
    pinBusy,
    setPinBusy,
    handleSavePin,
    handleRemovePin,
    update,
    submit,
  } = hookView;
  return (
    <>
      <section className="page-intro page-head">
        <div>
          <p className="eyebrow">암호화 보관함 설정</p>
          <h2>환경 설정</h2>
          <p>교사 역할, 담당 수업, 자동 잠금과 학사 일정을 조정합니다.</p>
        </div>
      </section>
      <HelpGuide
        title="환경 설정하기"
        description="교사 역할·담당 수업과 자동 잠금, 화면 테마, 교사 업무 기준을 한 번에 관리합니다."
        steps={[
          {
            title: "역할과 담당 수업 설정",
            detail:
              "담임 또는 교과 교사를 고르고 담당 교과·수업 학년·반을 선택합니다. 교과 교사는 담임용 메뉴가 숨겨집니다.",
          },
          {
            title: "자동 잠금 시간 선택",
            detail: "교무실·교실에서 자리를 비울 때 학생 개인정보가 보이지 않도록 시간을 정합니다.",
          },
          {
            title: "테마 선택 후 저장",
            detail: "치즈냥 또는 초록 테마를 고르고 설정 저장을 누르면 다음 실행에도 유지됩니다.",
          },
          {
            title: "교외체험학습 기준 입력",
            detail: "학교 규정에 따라 학년 또는 학기 단위와 허용 일수·학기 기간을 입력합니다.",
          },
        ]}
        note="설정은 이 컴퓨터의 암호화 보관함에만 저장됩니다."
      />
      <section className="panel settings-panel">
        <form onSubmit={submit}>
          <div className="settings-top-grid">
            <SettingsPrimaryCard view={{ ...hookView, config, saveConfig }} />
            <SettingsAcademicCard view={{ ...hookView, config, saveConfig }} />
          </div>
          {notice && <p className="save-notice">{notice}</p>}
          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "저장 중입니다" : "설정 저장"}
          </button>
        </form>
      </section>
      <PasswordChangePanel />
      <BackupPanel />
      <BackgroundPanel />
      <FeedbackPanel />
      <AlertDialog.Root open={pinRemoveOpen} onOpenChange={setPinRemoveOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="dialog-overlay" />
          <AlertDialog.Content className="dialog-content">
            <AlertDialog.Title>간편 PIN을 삭제할까요?</AlertDialog.Title>
            <AlertDialog.Description>
              삭제하면 다음부터는 마스터 비밀번호로만 로그인할 수 있습니다. 필요하면 언제든 다시 등록할 수 있습니다.
            </AlertDialog.Description>
            <div className="dialog-actions">
              <AlertDialog.Cancel asChild>
                <button className="quiet-button">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="danger-button" onClick={() => void handleRemovePin()}>
                  PIN 삭제
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
