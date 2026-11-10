import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { activeSectionId, nextTabIndex } from "./sectionTabsState";
import "./section-tabs.css";

export type SectionTabItem = { id: string; label: string };

function moveFocus(event: KeyboardEvent<HTMLElement>, index: number, count: number, go: (next: number) => void) {
  const next = nextTabIndex(index, count, event.key);
  if (next < 0) return;
  event.preventDefault();
  go(next);
  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
  buttons?.[next]?.focus();
}

/**
 * 진짜 탭: 한 번에 한 구역만 보인다. 구역 쪽은 `id={tabPanelId(item.id)}`·`role="tabpanel"`을 붙인다.
 */
export function SectionTabs({ items, value, onChange, label }: { items: SectionTabItem[]; value: string; onChange: (id: string) => void; label: string }) {
  const index = Math.max(0, items.findIndex((item) => item.id === value));
  return (
    <div className="section-tabs" role="tablist" aria-label={label}>
      {items.map((item, position) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`${item.id}-tab`}
          aria-selected={position === index}
          aria-controls={tabPanelId(item.id)}
          tabIndex={position === index ? 0 : -1}
          className={position === index ? "active" : ""}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => moveFocus(event, position, items.length, (next) => onChange(items[next].id))}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export const tabPanelId = (id: string) => `${id}-panel`;

const reduceMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};

/**
 * 바로가기 탭: 화면은 한 장 그대로 두고, 누르면 그 구역(`id`)으로 이동한다.
 * 탭 줄은 스크롤해도 위에 붙어 있고 지금 보는 구역이 강조된다. 내용이 없는 구역(높이 0)의 탭은 숨긴다.
 */
export function JumpTabs({ items, label }: { items: SectionTabItem[]; label: string }) {
  const nav = useRef<HTMLElement>(null);
  const [present, setPresent] = useState<string[]>([]);
  const [active, setActive] = useState("");
  const itemKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    const targets = () => items.map((item) => document.getElementById(item.id)).filter((node): node is HTMLElement => !!node);
    const measure = () => {
      const shown = targets().filter((node) => node.offsetHeight > 0);
      setPresent(shown.map((node) => node.id));
      const line = (nav.current?.getBoundingClientRect().bottom || 0) + 16;
      const doc = document.scrollingElement || document.documentElement;
      const atBottom = doc.scrollTop > 0 && doc.scrollTop + window.innerHeight >= doc.scrollHeight - 4;
      setActive(activeSectionId(shown.map((node) => ({ id: node.id, top: node.getBoundingClientRect().top })), line, atBottom));
    };
    measure();
    const resize = new ResizeObserver(measure);
    targets().forEach((node) => resize.observe(node));
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
    // items는 매번 새 배열이므로 id 목록이 바뀔 때만 다시 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemKey]);

  const shown = items.filter((item) => present.includes(item.id));
  if (shown.length < 2) return null;

  function jump(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    setActive(id);
  }

  return (
    <nav ref={nav} className="section-tabs jump-tabs" aria-label={label}>
      {shown.map((item, position) => (
        <button
          key={item.id}
          type="button"
          aria-current={item.id === active ? "location" : undefined}
          className={item.id === active ? "active" : ""}
          onClick={() => jump(item.id)}
          onKeyDown={(event) => moveFocus(event, position, shown.length, () => undefined)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
