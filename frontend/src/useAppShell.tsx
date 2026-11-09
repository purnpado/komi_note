import { changeEvents } from "./features/shared/changeEvents";
import { useVaultChanges } from "./features/shared/useVaultChanges";
import { useEffect, useRef, useState } from "react";
import { flushPendingSaves } from "./features/shared/pendingSaves";
import "./App.css";
import "./features/shared/navigation.css";
import { DesktopTitleBar } from "./features/app-shell/DesktopTitleBar";
import { useWindowControls } from "./features/app-shell/useWindowControls";
import { menus, type PageKey } from "./features/navigation/menuTypes";
import { useSidebar } from "./features/navigation/useSidebar";
import type { StudentDetailNavigationRequest } from "./features/shared/featureNavigation";
import { CheckForUpdate, GetAppState, GetSessionConfig, GetParticipationSafetyState, GetAppVersion, InstallAvailableUpdate, ListStudents, LockVault, UnlockVault, UnlockVaultWithPin } from "../wailsjs/go/main/App";
import { main as models } from "../wailsjs/go/models";
import { errorMessage } from "./features/shared/format";
import { EventsOn } from "../wailsjs/runtime/runtime";

export function displayGender(gender: string) {
  if (["남", "남자", "남성"].includes(gender)) return "남";
  if (["여", "여자", "여성"].includes(gender)) return "여";
  return gender;
}

export function isClassicTheme(theme?: string) {
  return theme === "초록" || theme === "기존 초록";
}

// QR 참여 회차가 열려 있어도 교사 입력이 이 시간 동안 없으면 화면을 잠급니다.
export const PARTICIPATION_LOCK_LIMIT_MINUTES = 30;
export const PARTICIPATION_LOCK_LIMIT_MS = PARTICIPATION_LOCK_LIMIT_MINUTES * 60 * 1000;

/** App 화면의 상태·계산·처리 함수. 화면(JSX)은 App.tsx에 있다. */
export function useAppShell() {
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

  // 학생 정보·학적변동·사진이 바뀌면 상단 검색·학생 화면이 쓰는 명렬을, 설정·되살리기 뒤에는 설정을 다시 읽는다.
  useVaultChanges([changeEvents.students, changeEvents.settings], (name) => {
    if (locked) return;
    if (name === changeEvents.settings) void loadOpenSession().catch(() => undefined);
    else void ListStudents().then((items) => setStudents(items || [])).catch(() => undefined);
  });

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

  // 트레이 메뉴 '화면 잠금'은 Go가 알림만 보내고, 잠금은 화면의 평소 잠금 절차(자동 저장 마무리 포함)로 한다.
  const lockScreenRef = useRef<(message?: string) => void>(() => undefined);
  useEffect(() => EventsOn("app:잠금요청", () => lockScreenRef.current("트레이 메뉴에서 화면을 잠갔습니다.")), []);

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
  lockScreenRef.current = lockScreen;

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

  return { windowControls, ready, setReady, needsSetup, setNeedsSetup, locked, setLocked, hasPin, setHasPin, pinLocked, setPinLocked, pinAttempts, setPinAttempts, pinNotice, setPinNotice, config, setConfig, active, setActive, notice, setNotice, students, setStudents, studentCard, setStudentCard, attendanceFocusDate, setAttendanceFocusDate, consultationFocusStudentID, setConsultationFocusStudentID, consultationPageKey, setConsultationPageKey, update, setUpdate, updating, setUpdating, appVersion, setAppVersion, setupAgreementAccepted, setSetupAgreementAccepted, termsRequired, setTermsRequired, sidebarCollapsed, setSidebarCollapsed, lockTimer, participationPaused, setParticipationPaused, loadOpenSession, refreshAppState, installUpdate, lockScreenRef, lockScreen, isHomeroomTeacher, desktopTitleBar, handleStudentDetailNavigation, unlock, unlockWithPin };
}
