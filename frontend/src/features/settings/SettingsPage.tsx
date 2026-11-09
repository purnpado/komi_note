import { BackgroundPanel } from "./BackgroundPanel";
import React, { FormEvent, useEffect, useState } from "react";
import { main as models } from "../../../wailsjs/go/models";
import { HasPin, SetPin, RemovePin } from "../../../wailsjs/go/main/App";
import { HelpGuide } from "../shared/HelpGuide";
import { FeedbackPanel } from "./FeedbackPanel";
import { PasswordChangePanel } from "./PasswordChangePanel";
import { BackupPanel } from "./BackupPanel";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import "./settings.css";

import { errorMessage } from "../shared/format";
const teachingGradeOptions = ["1학년", "2학년", "3학년"];
const teachingClassOptions = Array.from({ length: 10 }, (_, index) => `${index + 1}반`);
function isClassicTheme(theme?: string) { return theme === "초록" || theme === "기존 초록"; }

export function SettingsFeaturePage({
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
  return (
    <>
      <section className="page-intro">
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
            detail:
              "교무실·교실에서 자리를 비울 때 학생 개인정보가 보이지 않도록 시간을 정합니다.",
          },
          {
            title: "테마 선택 후 저장",
            detail:
              "치즈냥 또는 초록 테마를 고르고 설정 저장을 누르면 다음 실행에도 유지됩니다.",
          },
          {
            title: "교외체험학습 기준 입력",
            detail:
              "학교 규정에 따라 학년 또는 학기 단위와 허용 일수·학기 기간을 입력합니다.",
          },
        ]}
        note="설정은 이 컴퓨터의 암호화 보관함에만 저장됩니다."
      />
      <section className="panel settings-panel">
        <form onSubmit={submit}>
          <div className="settings-top-grid">
            <section className="settings-primary-card">
              <h3>교사 역할 · 기본 정보</h3>
              <div className="form-grid">
                <label className="role-choice-label">
                  이용 역할
                  <div className="role-choice-list">
                    <button
                      type="button"
                      className={
                        draft.teacherRole !== "비담임 교과 교사"
                          ? "role-choice selected"
                          : "role-choice"
                      }
                      onClick={() => update({ teacherRole: "담임 교사" })}
                    >
                      담임 교사
                    </button>
                    <button
                      type="button"
                      className={
                        draft.teacherRole === "비담임 교과 교사"
                          ? "role-choice selected"
                          : "role-choice"
                      }
                      onClick={() =>
                        update({
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
                    역할을 바꿔도 기존 데이터는 삭제하지 않으며, 역할에 맞지
                    않는 메뉴만 숨깁니다.
                  </small>
                </label>
                <label>
                  학교명
                  <input
                    value={draft.schoolName || ""}
                    onChange={(event) =>
                      update({ schoolName: event.target.value })
                    }
                  />
                </label>
                <label>
                  학년도
                  <input
                    value={draft.schoolYear || ""}
                    onChange={(event) =>
                      update({ schoolYear: event.target.value })
                    }
                  />
                </label>
                <label>
                  학년
                  <input
                    disabled={draft.teacherRole === "비담임 교과 교사"}
                    value={draft.grade || ""}
                    onChange={(event) => update({ grade: event.target.value })}
                  />
                </label>
                <label>
                  반
                  <input
                    disabled={draft.teacherRole === "비담임 교과 교사"}
                    value={draft.classNumber || ""}
                    onChange={(event) =>
                      update({ classNumber: event.target.value })
                    }
                  />
                </label>
                <label>
                  교사 표기
                  <input
                    value={draft.teacherLabel || ""}
                    onChange={(event) =>
                      update({ teacherLabel: event.target.value })
                    }
                  />
                </label>
                <label>
                  담당 교과
                  <input
                    value={draft.teachingSubject || ""}
                    onChange={(event) =>
                      update({ teachingSubject: event.target.value })
                    }
                    placeholder="예: 기술·가정"
                  />
                </label>
                <div className="class-selector-label">
                  수업 학년·반
                  <div className="class-selector">
                    <select
                      value={teachingGrade}
                      onChange={(event) => setTeachingGrade(event.target.value)}
                    >
                      <option value="">학년 선택</option>
                      {teachingGradeOptions.map((grade) => (
                        <option key={grade} value={grade}>
                          {grade}
                        </option>
                      ))}
                    </select>
                    <select
                      value={teachingClass}
                      onChange={(event) => setTeachingClass(event.target.value)}
                    >
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
                        onChange={(event) =>
                          setCustomTeachingClass(event.target.value)
                        }
                        placeholder="예: 11반·특수반"
                      />
                    )}
                    <button
                      type="button"
                      className="quiet-button compact-button"
                      disabled={
                        !teachingGrade ||
                        !teachingClass ||
                        (teachingClass === "__직접입력" &&
                          !customTeachingClass.trim())
                      }
                      onClick={() => {
                        const className =
                          teachingClass === "__직접입력"
                            ? customTeachingClass.trim()
                            : teachingClass;
                        const next = `${teachingGrade} ${className}`;
                        setDraft((current) => {
                          const classes = current.teachingClasses || [];
                          return classes.includes(next)
                            ? current
                            : new models.ClassConfig({
                                ...current,
                                teachingClasses: [...classes, next],
                              });
                        });
                      }}
                    >
                      수업 추가
                    </button>
                  </div>
                  <div className="selected-class-list">
                    {(draft.teachingClasses || []).map((className) => (
                      <button
                        type="button"
                        className="selected-class-chip"
                        key={className}
                        onClick={() =>
                          setDraft(
                            (current) =>
                              new models.ClassConfig({
                                ...current,
                                teachingClasses: (
                                  current.teachingClasses || []
                                ).filter((item) => item !== className),
                              }),
                          )
                        }
                      >
                        {className} ×
                      </button>
                    ))}
                  </div>
                  <small>
                    학년과 반을 선택해 여러 수업을 추가할 수 있습니다. 선택한
                    항목을 누르면 삭제됩니다.
                  </small>
                </div>
                <label>
                  자동 잠금 시간
                  <select
                    value={draft.autoLockMinutes}
                    onChange={(event) =>
                      update({ autoLockMinutes: Number(event.target.value) })
                    }
                  >
                    {[1, 3, 5, 10, 15, 30, 60, 120].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes}분
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* 간편 PIN 번호 설정 카드 */}
              <div
                style={{
                  marginTop: "1.25rem",
                  padding: "1rem",
                  borderRadius: "10px",
                  background: "var(--card-subtle-bg, #f8fafc)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div>
                    <strong style={{ fontSize: "0.95rem" }}>🔑 간편 숫자 PIN 로그인</strong>
                    <span
                      style={{
                        marginLeft: "0.5rem",
                        padding: "0.15rem 0.5rem",
                        borderRadius: "999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        background: hasPin ? "#dcfce7" : "#f1f5f9",
                        color: hasPin ? "#166534" : "#64748b",
                      }}
                    >
                      {hasPin ? "사용 중" : "미등록"}
                    </span>
                  </div>

                  {!showPinForm && (
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => {
                          setShowPinForm(true);
                          setPinNotice("");
                          setPinInput("");
                          setPinConfirmInput("");
                        }}
                      >
                        {hasPin ? "PIN 변경" : "PIN 등록"}
                      </button>
                      {hasPin && (
                        <button
                          type="button"
                          className="danger-button"
                          style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem" }}
                          onClick={() => setPinRemoveOpen(true)}
                          disabled={pinBusy}
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.82rem", color: "#64748b", lineHeight: 1.4 }}>
                  자동 잠금 후 또는 교실 업무 중 마스터 비밀번호 대신 4~8자리 숫자 PIN으로 빠르게 잠금을 해제할 수 있습니다. 5회 연속 오류 시 마스터 암호가 요구됩니다. PIN은 등록한 이 컴퓨터의 현재 Windows 계정에서만 작동하며, 프로그램 폴더를 다른 컴퓨터로 옮기면 마스터 비밀번호로 연 뒤 다시 등록해야 합니다. 자리를 비울 때는 Windows 화면 잠금(Win+L)도 함께 사용해 주세요.
                </p>

                {showPinForm && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      padding: "0.75rem",
                      borderRadius: "8px",
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                    }}
                  >
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                      <label style={{ fontSize: "0.85rem" }}>
                        새 PIN 번호 (숫자 4~8자리)
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={8}
                          value={pinInput}
                          onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="숫자 입력"
                          style={{ marginTop: "0.25rem" }}
                        />
                      </label>
                      <label style={{ fontSize: "0.85rem" }}>
                        새 PIN 번호 확인
                        <input
                          type="password"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={8}
                          value={pinConfirmInput}
                          onChange={(e) => setPinConfirmInput(e.target.value.replace(/[^0-9]/g, ""))}
                          placeholder="한 번 더 입력"
                          style={{ marginTop: "0.25rem" }}
                        />
                      </label>
                    </div>

                    {pinNotice && (
                      <p style={{ color: "#dc2626", fontSize: "0.8rem", margin: "0.5rem 0 0 0" }}>
                        {pinNotice}
                      </p>
                    )}

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.75rem" }}>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => setShowPinForm(false)}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
                        onClick={handleSavePin}
                        disabled={pinBusy || pinInput.length < 4}
                      >
                        {pinBusy ? "저장 중..." : "PIN 저장"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="setting-note">
                <b>제품 이름</b>
                <span>꼬미노트는 꼼꼼히 정리하는 교사 업무공간입니다.</span>
              </div>
            </section>
            <div className="settings-section settings-academic-card">
              <div>
                <p className="eyebrow">출결 기준 설정</p>
                <h3>학사 일정 · 교외체험학습</h3>
                <p>
                  교외체험학습은 이후 출결 화면에서 수업일만 자동으로
                  누계합니다.
                </p>
              </div>
              <div className="form-grid">
                <label>
                  관리 단위
                  <select
                    value={draft.experienceLearningUnit || "학년"}
                    onChange={(event) =>
                      update({ experienceLearningUnit: event.target.value })
                    }
                  >
                    <option value="학년">학년 단위</option>
                    <option value="학기">학기 단위</option>
                  </select>
                </label>
                {draft.experienceLearningUnit === "학기" ? (
                  <>
                    <label>
                      1학기 허용 일수
                      <input
                        type="number"
                        min="0"
                        value={draft.semester1ExperienceLimit || 0}
                        onChange={(event) =>
                          update({
                            semester1ExperienceLimit: Number(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      2학기 허용 일수
                      <input
                        type="number"
                        min="0"
                        value={draft.semester2ExperienceLimit || 0}
                        onChange={(event) =>
                          update({
                            semester2ExperienceLimit: Number(
                              event.target.value,
                            ),
                          })
                        }
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    학년 허용 일수
                    <input
                      type="number"
                      min="0"
                      value={draft.experienceLearningYearLimit || 0}
                      onChange={(event) =>
                        update({
                          experienceLearningYearLimit: Number(
                            event.target.value,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </div>
              <div className="term-grid">
                <fieldset>
                  <legend>1학기 기간</legend>
                  <label>
                    시작일
                    <input
                      type="date"
                      value={draft.semester1StartDate || ""}
                      onChange={(event) =>
                        update({ semester1StartDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    종료일
                    <input
                      type="date"
                      value={draft.semester1EndDate || ""}
                      onChange={(event) =>
                        update({ semester1EndDate: event.target.value })
                      }
                    />
                  </label>
                </fieldset>
                <fieldset>
                  <legend>2학기 기간</legend>
                  <label>
                    시작일
                    <input
                      type="date"
                      value={draft.semester2StartDate || ""}
                      onChange={(event) =>
                        update({ semester2StartDate: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    종료일
                    <input
                      type="date"
                      value={draft.semester2EndDate || ""}
                      onChange={(event) =>
                        update({ semester2EndDate: event.target.value })
                      }
                    />
                  </label>
                </fieldset>
              </div>
              <p className="setting-help">
                학기 단위를 선택하면 1·2학기 기간을 모두 입력해야 합니다. 학년
                단위도 수업일 달력과 정확한 누계를 위해 학기 기간 입력을
                권장합니다.
              </p>
              <div className="settings-theme-divider" />
              <div className="theme-settings">
                <div>
                  <p className="eyebrow">화면 모양</p>
                  <h3>테마 선택</h3>
                  <p>
                    선택하면 바로 미리보기로 적용되며, 설정 저장 후에도
                    유지됩니다.
                  </p>
                </div>
                <div className="theme-choice-list">
                  <button
                    type="button"
                    className={
                      !isClassicTheme(draft.theme)
                        ? "theme-choice selected cheese-choice"
                        : "theme-choice cheese-choice"
                    }
                    onClick={() => update({ theme: "치즈냥" })}
                  >
                    <span className="theme-choice-preview" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>치즈냥 테마</strong>
                    <small>크림 배경과 꼬미의 따뜻한 오렌지 색상</small>
                  </button>
                  <button
                    type="button"
                    className={
                      isClassicTheme(draft.theme)
                        ? "theme-choice selected classic-choice"
                        : "theme-choice classic-choice"
                    }
                    onClick={() => update({ theme: "초록" })}
                  >
                    <span className="theme-choice-preview" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    <strong>초록 테마</strong>
                    <small>차분한 초록 계열의 업무 화면</small>
                  </button>
                </div>
              </div>
            </div>
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
