import * as Dialog from "@radix-ui/react-dialog";
import { main as models } from "../../../wailsjs/go/models";
import { HelpTip } from "../shared/HelpTip";
import type { TimetableUi } from "./TimetablePage";

/** 교시 시각 규칙 창. */
export function TimetableBellDialog({ page }: { page: TimetableUi }) {
  const {
    notice,
    busy,
    bellOpen,
    setBellOpen,
    rule,
    setRule,
    periods,
    setPeriods,
    bellError,
    dialogError,
    recalculate,
    saveBell,
  } = page;
  return (
    <Dialog.Root open={bellOpen} onOpenChange={(open) => !busy && setBellOpen(open)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content timetable-dialog timetable-bell-dialog">
          <Dialog.Title>교시 시간 설정</Dialog.Title>
          <Dialog.Description className="timetable-dialog-description">
            우리 학교 규칙을 넣고 [자동 계산]을 누르세요. 계산한 뒤에 특정 교시 시각만 따로 고칠 수 있습니다(다시 [자동
            계산]을 누르면 규칙대로 돌아갑니다). 모든 학기에 같이 쓰입니다.
          </Dialog.Description>
          <div className="timetable-rule-grid">
            <label className="timetable-field">
              <span>1교시 시작</span>
              <input
                type="time"
                value={rule.firstStart}
                onChange={(event) => setRule(new models.TimetableBellRule({ ...rule, firstStart: event.target.value }))}
              />
            </label>
            <label className="timetable-field">
              <span>하루 교시 수</span>
              <input
                inputMode="numeric"
                value={rule.periodCount || ""}
                placeholder="예: 7"
                onChange={(event) =>
                  setRule(
                    new models.TimetableBellRule({
                      ...rule,
                      periodCount: Number(event.target.value.replace(/\D/g, "")) || 0,
                    }),
                  )
                }
              />
            </label>
            <label className="timetable-field">
              <span>수업 길이(분)</span>
              <input
                inputMode="numeric"
                value={rule.lessonMinutes || ""}
                placeholder="예: 45"
                onChange={(event) =>
                  setRule(
                    new models.TimetableBellRule({
                      ...rule,
                      lessonMinutes: Number(event.target.value.replace(/\D/g, "")) || 0,
                    }),
                  )
                }
              />
            </label>
            <label className="timetable-field">
              <span>쉬는 시간(분)</span>
              <input
                inputMode="numeric"
                value={String(rule.breakMinutes ?? "")}
                placeholder="예: 10"
                onChange={(event) =>
                  setRule(
                    new models.TimetableBellRule({
                      ...rule,
                      breakMinutes: Number(event.target.value.replace(/\D/g, "")) || 0,
                    }),
                  )
                }
              />
            </label>
            <label className="timetable-field">
              <span>
                점심 위치 <HelpTip>몇 교시가 끝난 뒤 점심을 먹는지 고릅니다. 점심이 없으면 "없음"을 고르세요.</HelpTip>
              </span>
              <select
                value={rule.lunchAfter}
                onChange={(event) =>
                  setRule(new models.TimetableBellRule({ ...rule, lunchAfter: Number(event.target.value) }))
                }
              >
                <option value={0}>없음</option>
                {Array.from({ length: Math.max(0, (rule.periodCount || 0) - 1) }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}교시 뒤
                  </option>
                ))}
              </select>
            </label>
            <label className="timetable-field">
              <span>점심 길이(분)</span>
              <input
                inputMode="numeric"
                disabled={!rule.lunchAfter}
                value={rule.lunchMinutes || ""}
                placeholder="예: 50"
                onChange={(event) =>
                  setRule(
                    new models.TimetableBellRule({
                      ...rule,
                      lunchMinutes: Number(event.target.value.replace(/\D/g, "")) || 0,
                    }),
                  )
                }
              />
            </label>
          </div>
          <button type="button" className="quiet-button timetable-compute" onClick={recalculate}>
            자동 계산
          </button>
          {(bellError || dialogError) && (
            <p className="timetable-notice" role="alert">
              {bellError || dialogError}
            </p>
          )}
          {periods.length > 0 && (
            <table className="timetable-period-table">
              <thead>
                <tr>
                  <th>교시</th>
                  <th>시작</th>
                  <th>끝</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period, index) => (
                  <tr key={period.number}>
                    <th scope="row">{period.number}교시</th>
                    <td>
                      <input
                        type="time"
                        aria-label={`${period.number}교시 시작`}
                        value={period.start}
                        onChange={(event) =>
                          setPeriods(
                            periods.map((item, at) =>
                              at === index ? new models.TimetablePeriod({ ...item, start: event.target.value }) : item,
                            ),
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        aria-label={`${period.number}교시 끝`}
                        value={period.end}
                        onChange={(event) =>
                          setPeriods(
                            periods.map((item, at) =>
                              at === index ? new models.TimetablePeriod({ ...item, end: event.target.value }) : item,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button type="button" className="quiet-button" disabled={busy}>
                취소
              </button>
            </Dialog.Close>
            <button
              type="button"
              className="primary-button"
              disabled={busy || !periods.length}
              onClick={() => void saveBell()}
            >
              저장
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
