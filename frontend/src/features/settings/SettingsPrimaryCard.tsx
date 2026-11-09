import { KnowNote, settingsNotes } from "../shared/KnowNote";
import { main as models } from "../../../wailsjs/go/models";
import { teachingGradeOptions, teachingClassOptions } from "./useSettingsPage";
import type { SettingsPageView } from "./useSettingsPage";

/** SettingsPage.tsx에서 떼어 낸 화면 구역 */
export function SettingsPrimaryCard({ view: hookView }: { view: SettingsPageView }) {
  const { draft, setDraft, setPinRemoveOpen, teachingGrade, setTeachingGrade, teachingClass, setTeachingClass, customTeachingClass, setCustomTeachingClass, hasPin, showPinForm, setShowPinForm, pinInput, setPinInput, pinConfirmInput, setPinConfirmInput, pinNotice, setPinNotice, pinBusy, handleSavePin, update } = hookView;
  return (
    <>
      <section className="settings-primary-card">
        <h3>교사 역할 · 기본 정보</h3>
        <KnowNote items={[...settingsNotes.basic]} />
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
    </>
  );
}
