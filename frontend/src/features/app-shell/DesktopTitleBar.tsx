import kkomiIcon from "../../assets/images/kkomi-note-icon.png";

type DesktopTitleBarProps = {
  fullscreen: boolean;
  maximised: boolean;
  onClose: () => void;
  onMinimise: () => void;
  onToggleFullscreen: () => void;
  onToggleMaximise: () => void;
};

export function DesktopTitleBar({
  fullscreen,
  maximised,
  onClose,
  onMinimise,
  onToggleFullscreen,
  onToggleMaximise,
}: DesktopTitleBarProps) {
  return (
    <div className={maximised ? "desktop-titlebar maximised" : "desktop-titlebar"}>
      <div className="window-drag">
        <img className="window-mark" src={kkomiIcon} alt="꼬미노트" />
        <strong>꼬미노트</strong>
        <small>꼼꼼히 정리하는 교사 업무공간</small>
      </div>
      <div className="window-controls">
        <button title="최소화" onClick={onMinimise}>─</button>
        <button title={maximised ? "복원" : "최대화"} onClick={onToggleMaximise}>
          {maximised ? "❐" : "□"}
        </button>
        <button title={fullscreen ? "전체화면 해제" : "전체화면"} onClick={onToggleFullscreen}>⛶</button>
        <button className="window-close" title="프로그램 닫기" onClick={onClose}>×</button>
      </div>
    </div>
  );
}
