import { isClassicTheme } from "./useSettingsPage";
import type { SettingsPageView } from "./useSettingsPage";
import { hideableMenus, toggleHiddenMenu } from "../navigation/sidebarState";

/** 화면·메뉴: 테마와 왼쪽 메뉴에서 숨길 메뉴. 설정 저장을 눌러야 저장된다. */
export function SettingsDisplayCard({ view: hookView }: { view: SettingsPageView }) {
  const { draft, update } = hookView;
  const hidden = draft.hiddenMenus || [];
  const homeroom = draft.teacherRole !== "비담임 교과 교사";
  return (
    <div className="settings-section settings-academic-card settings-display-card">
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
      <div className="settings-theme-divider" />
      <fieldset className="menu-visibility">
        <legend>
          <span className="eyebrow">왼쪽 메뉴</span>
          <b>보일 메뉴 고르기</b>
        </legend>
        <p className="setting-help">
          쓰지 않는 메뉴의 표시를 끄면 왼쪽 메뉴에서 감춥니다. 자료는 지워지지 않으며 빠른 검색으로도 들어갈 수 있고, 언제든 다시
          켤 수 있습니다. 대시보드와 환경 설정은 늘 보입니다.
        </p>
        <div className="menu-visibility-list">
          {hideableMenus(homeroom).map((menu) => (
            <label key={menu.key} className="inline-check">
              <input
                type="checkbox"
                checked={!hidden.includes(menu.key)}
                onChange={() => update({ hiddenMenus: toggleHiddenMenu(hidden, menu.key) })}
              />
              <span aria-hidden="true">{menu.icon}</span> {menu.key}
              <small>{menu.group}</small>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
