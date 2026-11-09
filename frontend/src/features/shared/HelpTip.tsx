import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./help.css";

type Position = { left: number; top: number; placement: "top" | "bottom" };

const gap = 8;
const margin = 8;

// HelpTip은 짧은 도움말(?)입니다. 팝업은 화면 맨 위 층(document.body)에 그려
// 스크롤되는 대화상자 안에서도 잘리지 않고, 화면 밖으로 나가지 않게 위치를 맞춥니다.
// 마우스를 올리거나 키보드로 초점을 주면 보이고, 누르면 고정(다시 누르거나 Esc·바깥 클릭으로 닫힘)됩니다.
export function HelpTip({ children }: { children: string }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const id = useId();
  const open = hovered || focused || pinned;

  function close() {
    setHovered(false);
    setFocused(false);
    setPinned(false);
  }

  function place() {
    const trigger = triggerRef.current;
    const popup = popupRef.current;
    if (!trigger || !popup) return;
    const rect = trigger.getBoundingClientRect();
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, margin), Math.max(margin, window.innerWidth - width - margin));
    let top = rect.top - height - gap;
    let placement: Position["placement"] = "top";
    if (top < margin) {
      top = Math.min(rect.bottom + gap, Math.max(margin, window.innerHeight - height - margin));
      placement = "bottom";
    }
    setPosition({ left, top, placement });
  }

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    // 대화상자보다 먼저 Esc를 받아 도움말만 닫는다(첫 Esc에 대화상자까지 닫히지 않게)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) close();
    };
    // 스크롤·창 크기 변경 때는 위치를 다시 맞춘다
    const onMove = () => place();
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={open ? "help-tip open" : "help-tip"}
        tabIndex={0}
        role="button"
        aria-label={`도움말: ${children}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onClick={(event) => {
          // 입력 칸 이름표(label) 안에 있어도 입력 칸으로 초점이 넘어가지 않게 한다
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPinned((value) => !value);
          }
        }}
      >
        ?
      </span>
      {open &&
        createPortal(
          <span
            ref={popupRef}
            id={id}
            role="tooltip"
            className={`help-tip-popup ${position?.placement || "top"}`}
            style={position ? { left: position.left, top: position.top } : { left: -9999, top: -9999 }}
          >
            {children}
          </span>,
          document.body,
        )}
    </>
  );
}
