import "./App.css";
import "./features/shared/navigation.css";
import { AgreementGate, termsVersion, UpdateDialog } from "./features/app-shell/AppShellDialogs";
import { AppConfirmDialogHost } from "./features/app-shell/AppConfirmDialog";
import { renderPage } from "./features/app-shell/renderPage";
import { Sidebar } from "./features/navigation/Sidebar";
import { LockScreen } from "./features/security/LockScreen";
import { SetupWizard } from "./features/security/SetupWizard";
import { StudentCard } from "./features/students/StudentDetail";
import { ResumeParticipationSessions, ListStudents, RemoveApplicationAndQuit, UpdateSettings } from "../wailsjs/go/main/App";
import { main as models } from "../wailsjs/go/models";
import { errorMessage } from "./features/shared/format";
import { ProfileMenu, QuickSearch } from "./features/app-shell/HeaderTools";
import { QuickMemo } from "./features/memo/QuickMemo";
import { ReminderInbox } from "./features/reminders/ReminderInbox";
import { useAppShell, displayGender, isClassicTheme } from "./useAppShell";

function App() {
  const { windowControls, ready, setReady, needsSetup, setNeedsSetup, locked, setLocked, hasPin, setHasPin, pinLocked, setPinLocked, pinAttempts, setPinAttempts, pinNotice, setPinNotice, config, setConfig, active, setActive, notice, setNotice, students, setStudents, studentCard, setStudentCard, attendanceFocusDate, setAttendanceFocusDate, consultationFocusStudentID, setConsultationFocusStudentID, consultationPageKey, setConsultationPageKey, update, setUpdate, updating, setUpdating, appVersion, setAppVersion, setupAgreementAccepted, setSetupAgreementAccepted, termsRequired, setTermsRequired, sidebarCollapsed, setSidebarCollapsed, lockTimer, participationPaused, setParticipationPaused, loadOpenSession, refreshAppState, installUpdate, lockScreenRef, lockScreen, isHomeroomTeacher, desktopTitleBar, handleStudentDetailNavigation, unlock, unlockWithPin } = useAppShell();
  if (!ready)
    return (
      <>
        {desktopTitleBar}
        <div className="loading-screen">안전한 보관함을 준비하고 있습니다.</div>
      </>
    );

  if (needsSetup && !setupAgreementAccepted)
    return (
      <>
        {desktopTitleBar}
        <AgreementGate
          version={appVersion}
          onAgree={() => setSetupAgreementAccepted(true)}
          onDecline={() => void RemoveApplicationAndQuit()}
          removeOnDecline
        />
      </>
    );

  if (needsSetup)
    return (
      <>
        {desktopTitleBar}
        <SetupWizard
          agreementAcceptedAt={new Date().toISOString()}
          version={appVersion}
          onComplete={(result) => {
            setConfig(result.config);
            setStudents([]);
            setNeedsSetup(false);
            setLocked(false);
            setNotice("");
          }}
          onRestored={() => {
            setNotice("백업으로 보관함을 되살렸습니다. 간편 PIN은 환경 설정에서 다시 등록하고, 새 복구 파일을 만들어 두세요.");
            void refreshAppState();
          }}
        />
        <UpdateDialog
          info={update}
          busy={updating}
          onClose={() => setUpdate(null)}
          onInstall={installUpdate}
        />
      </>
    );

  if (locked) {
    return (
      <>
        {desktopTitleBar}
        <LockScreen
          notice={notice}
          unlock={unlock}
          unlockWithPin={unlockWithPin}
          hasPin={hasPin}
          pinLocked={pinLocked}
          pinAttempts={pinAttempts}
          pinNotice={pinNotice}
          refreshAppState={refreshAppState}
          version={appVersion}
        />
        <UpdateDialog
          info={update}
          busy={updating}
          onClose={() => setUpdate(null)}
          onInstall={installUpdate}
        />
      </>
    );
  }

  if (termsRequired && config) {
    return (
      <>
        {desktopTitleBar}
        <AgreementGate
          version={appVersion}
          onDecline={() => void windowControls.close()}
          onAgree={async () => {
            try {
              const next = new models.ClassConfig({
                ...config,
                termsVersion,
                termsAcceptedAt: new Date().toISOString(),
              });
              const result = await UpdateSettings(next);
              setConfig(result.config);
              setTermsRequired(false);
            } catch (error) {
              setNotice(errorMessage(error));
            }
          }}
        />
      </>
    );
  }

  return (
    <>
      {desktopTitleBar}
      <UpdateDialog
        info={update}
        busy={updating}
        onClose={() => setUpdate(null)}
        onInstall={installUpdate}
      />
      <AppConfirmDialogHost />
      <div
        className={`application ${isClassicTheme(config?.theme) ? "theme-classic" : "theme-cheese"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      >
        <Sidebar
          active={active}
          appVersion={appVersion}
          collapsed={sidebarCollapsed}
          config={config}
          isHomeroomTeacher={isHomeroomTeacher}
          onCollapsedChange={setSidebarCollapsed}
          onLock={() => lockScreen()}
          onNavigate={(page) => {
            setStudentCard(null);
            if (page === "상담 기록") {
              setConsultationFocusStudentID("");
              setConsultationPageKey((value) => value + 1);
            }
            setActive(page);
          }}
        />
        <main>
          <header className="topbar">
            <div>
              <p className="eyebrow">
                로컬 암호화 보관함 · 자동 잠금 {config?.autoLockMinutes}분
              </p>
              <h1>{active}</h1>
            </div>
            <div className="top-actions">
              {participationPaused && <button className="quiet-button" onClick={() => { ResumeParticipationSessions(); setParticipationPaused(false); setNotice("QR 참여 회차를 재개했습니다."); }}>회차 재개</button>}
              <QuickSearch
                students={students || []}
                isHomeroomTeacher={isHomeroomTeacher}
                onOpenStudent={(student) => setStudentCard(student)}
                onNavigate={(page) => {
                  setStudentCard(null);
                  setActive(page);
                }}
              />
              <ReminderInbox onNavigate={(page) => { setStudentCard(null); setActive(page); }} />
              <QuickMemo onSaved={setNotice} />
              <span className="local-status">
                <i />이 기기에 안전하게 저장됨
              </span>
              <ProfileMenu
                config={config}
                version={appVersion}
                onNavigate={(page) => {
                  setStudentCard(null);
                  setActive(page);
                }}
                onLock={() => lockScreen()}
              />
            </div>
          </header>
          <div className="page-content">
            {studentCard ? (
              <StudentCard
                student={
                  (students || []).find(
                    (student) => student.id === studentCard.id,
                  ) || studentCard
                }
                close={() => setStudentCard(null)}
                students={students || []}
                navigate={(nextStudent) => setStudentCard(nextStudent)}
                config={config}
                requestNavigation={handleStudentDetailNavigation}
                reloadStudents={async () =>
                  setStudents((await ListStudents()) || [])
                }
                deleted={async () => {
                  setStudentCard(null);
                  setActive("학생 명렬");
                  setStudents((await ListStudents()) || []);
                }}
                displayGender={displayGender}
              />
            ) : (
              renderPage(
                active,
                students || [],
                async () => setStudents((await ListStudents()) || []),
                (student) => setStudentCard(student),
                config,
                attendanceFocusDate,
                consultationFocusStudentID,
                consultationPageKey,
                async (nextConfig: models.ClassConfig) => {
                  const result = await UpdateSettings(nextConfig);
                  setConfig(result.config);
                },
                isHomeroomTeacher,
                (page) => {
                  setStudentCard(null);
                  setActive(page);
                },
                (studentID) =>
                  handleStudentDetailNavigation({ destination: "상담 기록", studentID }),
              )
            )}
          </div>
        </main>
      </div>
    </>
  );
}


export default App;
