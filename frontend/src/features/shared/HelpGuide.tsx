import { useState } from "react";
import "./help.css";

export type GuideStep = { title: string; detail: string };

export function HelpGuide({
  title,
  description,
  steps,
  note,
  defaultOpen = true,
}: {
  title: string;
  description: string;
  steps: GuideStep[];
  note?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={open ? "help-guide" : "help-guide collapsed"}>
      <div className="help-guide-heading">
        <div>
          <p className="eyebrow">처음 사용 안내</p>
          <h3>🧭 {title}</h3>
          <p>{description}</p>
        </div>
        <button
          type="button"
          className="help-guide-toggle"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
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
