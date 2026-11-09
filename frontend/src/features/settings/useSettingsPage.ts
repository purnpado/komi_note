import { FormEvent, useEffect, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { HasPin, SetPin, RemovePin } from "../../../wailsjs/go/main/App";
import "./settings.css";
import { errorMessage } from "../shared/format";

export const teachingGradeOptions = ["1학년", "2학년", "3학년"];
export const teachingClassOptions = Array.from({ length: 10 }, (_, index) => `${index + 1}반`);
export function isClassicTheme(theme?: string) { return theme === "초록" || theme === "기존 초록"; }

/** SettingsFeaturePage 화면의 상태·계산·처리 함수. 화면(JSX)은 SettingsPage.tsx에 있다. */
export function useSettingsPage({
  config,
  saveConfig,
}: {
  config: models.ClassConfig;
  saveConfig: (config: models.ClassConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(
    new models.ClassConfig({
      ...config,
      teachingClasses: config.teachingClasses || [],
      experienceLearningUnit: config.experienceLearningUnit || "학년",
      theme: config.theme || "치즈냥",
    }),
  );
  const [notice, setNotice] = useState("");
  const [pinRemoveOpen, setPinRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [teachingGrade, setTeachingGrade] = useState("");
  const [teachingClass, setTeachingClass] = useState("");
  const [customTeachingClass, setCustomTeachingClass] = useState("");

  // 간편 PIN 상태 및 관리
  const [hasPin, setHasPin] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinConfirmInput, setPinConfirmInput] = useState("");
  const [pinNotice, setPinNotice] = useState("");
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    void HasPin()
      .then(setHasPin)
      .catch(() => setHasPin(false));
  }, []);

  async function handleSavePin(e: FormEvent) {
    e.preventDefault();
    if (pinInput !== pinConfirmInput) {
      setPinNotice("PIN 번호 확인이 일치하지 않습니다.");
      return;
    }
    if (pinInput.length < 4 || pinInput.length > 8) {
      setPinNotice("PIN 번호는 4~8자리 숫자로 입력해 주세요.");
      return;
    }
    setPinBusy(true);
    setPinNotice("");
    try {
      await SetPin(pinInput);
      setHasPin(true);
      setShowPinForm(false);
      setPinInput("");
      setPinConfirmInput("");
      setNotice("간편 PIN 번호가 성공적으로 등록(변경)되었습니다.");
    } catch (error) {
      setPinNotice(errorMessage(error));
    } finally {
      setPinBusy(false);
    }
  }

  async function handleRemovePin() {
    setPinRemoveOpen(false);
    setPinBusy(true);
    try {
      await RemovePin();
      setHasPin(false);
      setShowPinForm(false);
      setNotice("간편 PIN 번호가 삭제되었습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setPinBusy(false);
    }
  }
  const update = (values: Partial<models.ClassConfig>) =>
    setDraft((current) => new models.ClassConfig({ ...current, ...values }));
  useEffect(() => {
    document.documentElement.dataset.kkomiTheme = isClassicTheme(draft.theme)
      ? "classic"
      : "cheese";
    return () => {
      document.documentElement.dataset.kkomiTheme = isClassicTheme(config.theme)
        ? "classic"
        : "cheese";
    };
  }, [config.theme, draft.theme]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveConfig(draft);
      setNotice(
        "학사 일정과 교외체험학습 기준을 암호화 보관함에 저장했습니다.",
      );
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return { draft, setDraft, notice, setNotice, pinRemoveOpen, setPinRemoveOpen, busy, setBusy, teachingGrade, setTeachingGrade, teachingClass, setTeachingClass, customTeachingClass, setCustomTeachingClass, hasPin, setHasPin, showPinForm, setShowPinForm, pinInput, setPinInput, pinConfirmInput, setPinConfirmInput, pinNotice, setPinNotice, pinBusy, setPinBusy, handleSavePin, handleRemovePin, update, submit };
}

/** 화면 구역 컴포넌트에 넘기는 값 묶음 */
export type SettingsPageView = ReturnType<typeof useSettingsPage> & Parameters<typeof useSettingsPage>[0];
