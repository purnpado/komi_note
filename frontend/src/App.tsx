import { useEffect, useRef, useState } from "react";
import { flushPendingSaves } from "./features/shared/pendingSaves";
import "./App.css";
import "./features/shared/navigation.css";
import {
  AgreementGate,
  termsVersion,
  UpdateDialog,
} from "./features/app-shell/AppShellDialogs";
import {
  AppConfirmDialogHost,
} from "./features/app-shell/AppConfirmDialog";
import { DesktopTitleBar } from "./features/app-shell/DesktopTitleBar";
import { useWindowControls } from "./features/app-shell/useWindowControls";
import { renderPage } from "./features/app-shell/renderPage";
import { Sidebar } from "./features/navigation/Sidebar";
import { menus, type PageKey } from "./features/navigation/menuTypes";
import { useSidebar } from "./features/navigation/useSidebar";
import { LockScreen } from "./features/security/LockScreen";
import { SetupWizard } from "./features/security/SetupWizard";
import { StudentCard } from "./features/students/StudentDetail";
import type { StudentDetailNavigationRequest } from "./features/shared/featureNavigation";
import {
  CheckForUpdate,
  GetAppState,
  GetSessionConfig,
  GetParticipationSafetyState,
  ResumeParticipationSessions,
  GetAppVersion,
  InstallAvailableUpdate,
  ListStudents,
  LockVault,
  RemoveApplicationAndQuit,
  UnlockVault,
  UnlockVaultWithPin,
  UpdateSettings,
} from "../wailsjs/go/main/App";
import { main as models } from "../wailsjs/go/models";



import { errorMessage } from "./features/shared/format";
import { ProfileMenu, QuickSearch } from "./features/app-shell/HeaderTools";
function displayGender(gender: string) {
  if (["남", "남자", "남성"].includes(gender)) return "남";
  if (["여", "여자", "여성"].includes(gender)) return "여";
  return gender;
}

function isClassicTheme(theme?: string) {
  return theme === "초록" || theme === "기존 초록";
}

// QR 참여 회차가 열려 있어도 교사 입력이 이 시간 동안 없으면 화면을 잠급니다.
const PARTICIPATION_LOCK_LIMIT_MINUTES = 30;
const PARTICIPATION_LOCK_LIMIT_MS = PARTICIPATION_LOCK_LIMIT_MINUTES * 60 * 1000;

function App() {
  const windowControls = useWindowControls();
  const [ready, setReady] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [locked, setLocked] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pinNotice, setPinNotice] = useState("");
  const [config, setConfig] = useState<models.ClassConfig | null>(null);
  const [active, setActive] = useState<PageKey>("대시보드");
  const [notice, setNotice] = useState("");
  const [students, setStudents] = useState<models.Student[]>([]);
  const [studentCard, setStudentCard] = useState<models.Student | null>(null);
  const [attendanceFocusDate, setAttendanceFocusDate] = useState("");
  const [consultationFocusStudentID, setConsultationFocusStudentID] =
    useState("");
  const [consultationPageKey, setConsultationPageKey] = useState(0);
  const [update, setUpdate] = useState<models.UpdateInfo | null>(null);
  const [updating, setUpdating] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const [setupAgreementAccepted, setSetupAgreementAccepted] = useState(false);
  const [termsRequired, setTermsRequired] = useState(false);
  const { collapsed: sidebarCollapsed, setCollapsed: setSidebarCollapsed } = useSidebar();
  const lockTimer = useRef<number | undefined>(undefined);
	const [participationPaused, setParticipationPaused] = useState(false);

  // 화면을 다시 불러왔거나(새로 고침·백업 되살리기) 다른 경로로 보관함이 열린 경우
  // 잠금 해제 때와 같이 설정과 학생 명렬을 다시 읽습니다.
  const loadOpenSession = async () => {
    const session = await GetSessionConfig();
    setConfig(session.config);
    setStudents((await ListStudents()) || []);
    setTermsRequired(!session.config.termsAcceptedAt);
  };

  const refreshAppState = async () => {
    try {
      const state = await GetAppState();
      if (!state.needsSetup && !state.locked) await loadOpenSession();
      setNeedsSetup(state.needsSetup);
      setLocked(state.locked);
      setHasPin(state.hasPin || false);
      setPinLocked(state.pinLocked || false);
      setPinAttempts(state.pinAttempts || 0);
      setPinNotice(state.pinNotice || "");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  useEffect(() => {
    GetAppState()
      .then(async (state) => {
        if (!state.needsSetup && !state.locked) {
          try {
            await loadOpenSession();
          } catch {
            // 보관함이 그사이 잠겼으면 잠금 화면을 보여 줍니다.
            state.locked = true;
          }
        }
        setNeedsSetup(state.needsSetup);
        setLocked(state.locked);
        setHasPin(state.hasPin || false);
        setPinLocked(state.pinLocked || false);
        setPinAttempts(state.pinAttempts || 0);
        setPinNotice(state.pinNotice || "");
        setReady(true);
      })
      .catch((error) => {
        setNotice(errorMessage(error));
        setReady(true);
      });
  }, []);

  useEffect(() => {
    void GetAppVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(""));
  }, []);

  useEffect(() => {
    if (!ready) return;
    CheckForUpdate()
      .then((result) => {
        const info = new models.UpdateInfo(result);
        if (info.available) setUpdate(info);
      })
      .catch(() => {
        // 인터넷 연결이 없거나 배포 정보가 아직 없으면 조용히 건너뜁니다.
      });
  }, [ready]);

  async function installUpdate() {
    setUpdating(true);
    try {
      await InstallAvailableUpdate();
    } catch (error) {
      setUpdating(false);
      setNotice(errorMessage(error));
    }
  }

  function lockScreen(message = "") {
    // 자동 저장을 기다리던 입력(학교생활기록 등)을 먼저 저장한 뒤 보관함을 닫습니다.
    void flushPendingSaves().finally(() => {
      LockVault();
      setConfig(null);
      setStudents([]);
      setStudentCard(null);
      setLocked(true);
      void refreshAppState();
      if (message) setNotice(message);
    });
  }

  useEffect(() => {
    if (locked || !config) return;
    // 마지막 입력 시각입니다. QR 회차 중이라도 이 시각부터 상한 시간이 지나면 잠급니다.
    let lastActivityAt = Date.now();
    const resetTimer = () => {
      window.clearTimeout(lockTimer.current);
      lockTimer.current = window.setTimeout(() => {
        void GetParticipationSafetyState()
          .then((state) => {
            if (state.active && Date.now() - lastActivityAt < PARTICIPATION_LOCK_LIMIT_MS) {
              setNotice("QR 참여 회차가 진행 중이어서 자동 잠금을 보류했습니다.");
              resetTimer();
              return;
            }
            if (state.active) {
              lockScreen(
                `QR 참여 회차 중이지만 ${PARTICIPATION_LOCK_LIMIT_MINUTES}분 넘게 입력이 없어 화면을 잠갔습니다. 잠금을 해제한 뒤 이어서 진행할 수 있습니다.`,
              );
              return;
            }
            lockScreen("입력이 없어 화면을 자동으로 잠갔습니다.");
          })
          .catch(() => lockScreen("입력이 없어 화면을 자동으로 잠갔습니다."));
      }, config.autoLockMinutes * 60 * 1000);
    };
    const onActivity = () => {
      lastActivityAt = Date.now();
      resetTimer();
    };
    const events = ["mousemove", "mousedown", "keydown", "touchstart"];
    events.forEach((eventName) =>
      window.addEventListener(eventName, onActivity),
    );
    resetTimer();
    return () => {
      window.clearTimeout(lockTimer.current);
      events.forEach((eventName) =>
        window.removeEventListener(eventName, onActivity),
      );
    };
  }, [locked, config]);

  useEffect(() => {
    document.documentElement.dataset.kkomiTheme = isClassicTheme(config?.theme)
      ? "classic"
      : "cheese";
  }, [config?.theme]);

  const isHomeroomTeacher = config?.teacherRole !== "비담임 교과 교사";
  const desktopTitleBar = (
    <DesktopTitleBar
      fullscreen={windowControls.fullscreen}
      maximised={windowControls.maximised}
      onClose={() => void windowControls.close()}
      onMinimise={() => void windowControls.minimise()}
      onToggleFullscreen={() => void windowControls.toggleFullscreen()}
      onToggleMaximise={() => void windowControls.toggleMaximise()}
    />
  );

  function handleStudentDetailNavigation(
    request: StudentDetailNavigationRequest,
  ) {
    setStudentCard(null);
    if (request.destination === "출결 관리") {
      setAttendanceFocusDate(request.date);
      setActive("출결 관리");
      return;
    }
    setConsultationFocusStudentID(request.studentID);
    setConsultationPageKey((value) => value + 1);
    setActive("상담 기록");
  }

  useEffect(() => {
    const activeMenu = menus.find((menu) => menu.key === active);
    if (!isHomeroomTeacher && activeMenu?.homeroomOnly) {
      setStudentCard(null);
      setActive("대시보드");
    }
  }, [active, isHomeroomTeacher]);

  async function unlock(password: string) {
    try {
      const result = await UnlockVault(password);
      setConfig(result.config);
      setStudents((await ListStudents()) || []);
      setTermsRequired(!result.config.termsAcceptedAt);
      setLocked(false);
      setPinLocked(false);
      setPinAttempts(0);
      const safety = await GetParticipationSafetyState();
      setParticipationPaused(safety.paused);
      setNotice(safety.paused ? "QR 회차가 안전 일시정지되어 있습니다. 확인 후 회차 재개를 눌러 주세요." : "");
    } catch (error) {
      setNotice(errorMessage(error));
      void refreshAppState();
    }
  }

  async function unlockWithPin(pin: string) {
    try {
      const result = await UnlockVaultWithPin(pin);
      setConfig(result.config);
      setStudents((await ListStudents()) || []);
      setTermsRequired(!result.config.termsAcceptedAt);
      setLocked(false);
      setPinLocked(false);
      setPinAttempts(0);
      const safety = await GetParticipationSafetyState();
      setParticipationPaused(safety.paused);
      setNotice(safety.paused ? "QR 회차가 안전 일시정지되어 있습니다. 확인 후 회차 재개를 눌러 주세요." : "");
    } catch (error) {
      setNotice(errorMessage(error));
      void refreshAppState();
      throw error;
    }
  }

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
