import { useState } from "react";
import "./help.css";

export type GuideStep = { title: string; detail: string };

// B1·B3(2026-11-09 화면 점검): 모든 화면의 '처음 사용 안내'를 이 부품 하나로 맞추고,
// 한 번 접으면 그 화면은 다음에도 접힌 채로 연다. 저장하는 값은 열림/접힘뿐(개인정보 없음)이고,
// 브라우저 저장소를 못 쓰면 처음 상태(defaultOpen)로 연다.
const STORAGE_PREFIX = "kkomi.helpGuide.";

function readOpen(key: string, fallback: boolean): boolean {
  try {
    const value = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (value === "open") return true;
    if (value === "closed") return false;
  } catch {
    // 저장소를 쓸 수 없으면 처음 상태로
  }
  return fallback;
}

function writeOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, open ? "open" : "closed");
  } catch {
    // 저장하지 못해도 화면 동작에는 문제없음
  }
}

export function HelpGuide({
  title,
  description,
  steps,
  note,
  defaultOpen = true,
  storageKey,
}: {
  title: string;
  description: string;
  steps: GuideStep[];
  note?: string;
  defaultOpen?: boolean;
  /** 접힘 상태를 기억할 이름. 없으면 제목을 쓴다. */
  storageKey?: string;
}) {
  const key = storageKey || title;
  const [open, setOpen] = useState(() => readOpen(key, defaultOpen));
  const toggle = () => {
    const next = !open;
    writeOpen(key, next);
    setOpen(next);
  };
  return (
    <section className={open ? "help-guide" : "help-guide collapsed"}>
      <div className="help-guide-heading">
        <div>
          {open && <p className="eyebrow">처음 사용 안내</p>}
          <h3>🧭 {title}</h3>
          {open && <p>{description}</p>}
        </div>
        <button type="button" className="help-guide-toggle" onClick={toggle} aria-expanded={open}>
          {open ? "안내 접기" : "안내 보기"}
        </button>
      </div>
      {open && (
        <>
          <ol className="help-guide-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <b>{index + 1}</b>
                <div>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>
          {note && <p className="help-guide-note">💡 {note}</p>}
        </>
      )}
    </section>
  );
}
