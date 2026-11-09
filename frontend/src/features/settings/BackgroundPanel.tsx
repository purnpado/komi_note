import { useEffect, useState } from "react";
import { GetBackgroundSettings, SaveBackgroundSettings, SendTestNotification } from "../../../bindings/TeacherNote/app";
import type { BackgroundInfo } from "../../../bindings/TeacherNote/models";
import type { Settings } from "../../../bindings/TeacherNote/internal/background/models";
import { HelpTip } from "../shared/HelpTip";
import { errorMessage } from "../shared/format";
import "../reminders/reminders.css";

/** 환경 설정 · 알림·백그라운드: Windows 알림, 창 닫기 동작(트레이), Windows 시작 때 자동 실행, 조용한 시간. 모두 기본 끔. */
export function BackgroundPanel() {
  const [info, setInfo] = useState<BackgroundInfo | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    GetBackgroundSettings().then((value) => { setInfo(value); setDraft(value.settings); }).catch((e) => setNotice(errorMessage(e)));
  }, []);
  if (!draft || !info) return null;
  const set = (patch: Partial<Settings>) => setDraft({ ...draft, ...patch });
  const changed = JSON.stringify(draft) !== JSON.stringify(info.settings);

  async function save() {
    try {
      setBusy(true);
      const next = await SaveBackgroundSettings(draft!);
      setInfo(next);
      setDraft(next.settings);
      setNotice("알림·백그라운드 설정을 저장했습니다.");
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    try {
      await SendTestNotification();
      setNotice("시험 알림을 보냈습니다. 화면 오른쪽 아래(알림 센터)를 확인해 주세요. 보이지 않으면 Windows 설정 → 시스템 → 알림에서 꼬미노트를 켜 주세요.");
    } catch (error) {
      setNotice(errorMessage(error));
    }
  }

  return (
    <section className="panel settings-extra-panel" aria-labelledby="settings-background-title">
      <div className="settings-extra-heading">
        <div>
          <p className="eyebrow">알림 · 백그라운드</p>
          <h3 id="settings-background-title">Windows 알림 · 트레이 · 자동 시작</h3>
          <p>일정·할 일 미리 알림을 Windows 알림으로 받습니다. 모두 처음에는 꺼져 있습니다. 알림·트레이 설정은 켜기/끄기와 시각만 이 컴퓨터의 data 폴더에 저장되며 일정 내용은 들어가지 않습니다.</p>
        </div>
      </div>
      {!info.desktopSupported && <p className="settings-extra-note">지금은 화면 검사용 서버 모드라 Windows 알림·트레이가 동작하지 않습니다. 알림은 상단 ‘확인할 알림’에만 쌓입니다.</p>}
      <div className="settings-extra-form background-form">
        <label className="background-toggle">
          <input type="checkbox" checked={draft.notifyEnabled} onChange={(e) => set({ notifyEnabled: e.target.checked })} />
          <span><b>미리 알림 쓰기</b><small>일정·할 일에 고른 시각이 되면 알려 줍니다. 꼬미노트가 켜져 있거나 트레이에 있을 때만 울립니다.</small></span>
        </label>
        <fieldset className="background-choice" disabled={!draft.notifyEnabled}>
          <legend>알림에 보일 내용 <HelpTip>‘보호 표시’는 알림 센터·잠금 화면에 “확인할 알림이 있습니다”만 보입니다. ‘제목 표시’를 고르면 일정·할 일 제목이 보이므로 학생 이름을 제목에 쓰지 마세요. 꼬미노트 화면이 잠겨 있으면 언제나 보호 표시입니다.</HelpTip></legend>
          <label><input type="radio" name="notify-detail" checked={draft.notifyDetail !== "제목"} onChange={() => set({ notifyDetail: "보호" })} /> 보호 표시(권장)</label>
          <label><input type="radio" name="notify-detail" checked={draft.notifyDetail === "제목"} onChange={() => set({ notifyDetail: "제목" })} /> 제목 표시</label>
        </fieldset>
        <fieldset className="background-choice" disabled={!draft.notifyEnabled}>
          <legend>조용한 시간 <HelpTip>이 시간에는 Windows 알림을 띄우지 않고 상단 ‘확인할 알림’에만 남깁니다.</HelpTip></legend>
          <label><input type="checkbox" checked={draft.quietEnabled} onChange={(e) => set({ quietEnabled: e.target.checked })} /> 쓰기</label>
          <input type="time" aria-label="조용한 시간 시작" value={draft.quietStart} disabled={!draft.quietEnabled} onChange={(e) => set({ quietStart: e.target.value })} />
          <span>~</span>
          <input type="time" aria-label="조용한 시간 끝" value={draft.quietEnd} disabled={!draft.quietEnabled} onChange={(e) => set({ quietEnd: e.target.value })} />
        </fieldset>
        <fieldset className="background-choice">
          <legend>창을 닫으면 <HelpTip>‘트레이로 내리기’를 고르면 창을 닫아도 꼬미노트가 화면 오른쪽 아래 트레이에 남아 알림을 계속 보냅니다. 트레이 아이콘을 누르면 다시 열리고, 메뉴에서 화면 잠금·빠른 메모·완전 종료를 고릅니다. 자동 잠금은 그대로 동작합니다.</HelpTip></legend>
          <label><input type="radio" name="close-mode" checked={!draft.closeToTray} onChange={() => set({ closeToTray: false })} /> 완전 종료(권장)</label>
          <label><input type="radio" name="close-mode" checked={draft.closeToTray} disabled={!info.desktopSupported} onChange={() => set({ closeToTray: true })} /> 트레이로 내리기</label>
        </fieldset>
        <label className="background-toggle">
          <input type="checkbox" checked={draft.autoStart} disabled={!info.autoStartSupported && !draft.autoStart} onChange={(e) => set({ autoStart: e.target.checked })} />
          <span><b>Windows 시작 때 자동 실행</b><small>컴퓨터를 켜면 꼬미노트가 잠긴 채로 시작합니다(트레이로 내리기를 켰으면 창 없이 트레이에서). 관리자 권한이 필요 없습니다.{!info.autoStartSupported && " 이 컴퓨터에서는 쓸 수 없습니다(Windows 전용)."}</small></span>
        </label>
        <div className="settings-extra-actions">
          <button type="button" className="quiet-button" disabled={!info.settings.notifyEnabled} onClick={() => void test()} title={info.settings.notifyEnabled ? "" : "미리 알림을 켜고 저장한 뒤 시험해 보세요"}>시험 알림 보내기</button>
          <button type="button" className="primary-button" disabled={busy || !changed} onClick={() => void save()}>{busy ? "저장 중…" : "알림 설정 저장"}</button>
        </div>
        {notice && <p className="form-notice" role="status">{notice}</p>}
      </div>
    </section>
  );
}
