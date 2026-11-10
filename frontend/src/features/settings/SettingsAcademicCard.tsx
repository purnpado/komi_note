import type { SettingsPageView } from "./useSettingsPage";
import { HolidayEditor } from "./HolidayEditor";

/** SettingsPage.tsx에서 떼어 낸 화면 구역 */
export function SettingsAcademicCard({ view: hookView }: { view: SettingsPageView }) {
  const { draft, update } = hookView;
  return (
    <>
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
        <HolidayEditor
          schoolYear={String(draft.schoolYear || "")}
          holidays={draft.holidays || []}
          onChange={(holidays) => update({ holidays })}
        />
      </div>
    </>
  );
}
