import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { main as models } from "../../../wailsjs/go/models";
import { menus, type PageKey } from "../navigation/menuTypes";
import { openExternalURL } from "../shared/desktopActions";
import "./header-tools.css";

const extraPages: { key: PageKey; icon: string; homeroomOnly?: boolean }[] = [
  { key: "자리배정", icon: "▦", homeroomOnly: true },
  { key: "청소배정", icon: "▤", homeroomOnly: true },
  { key: "환경 설정", icon: "⚙" },
];

type Result =
  | { kind: "student"; label: string; detail: string; student: models.Student }
  | { kind: "page"; label: string; detail: string; page: PageKey };

// 상단 "빠른 검색": 학생 이름·번호와 메뉴 이름으로 바로 이동한다. Ctrl+K(맥은 ⌘K)로도 연다.
export function QuickSearch({
  students,
  isHomeroomTeacher,
  onOpenStudent,
  onNavigate,
}: {
  students: models.Student[];
  isHomeroomTeacher: boolean;
  onOpenStudent: (student: models.Student) => void;
  onNavigate: (page: PageKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    const text = query.trim().replace(/\s+/g, "");
    const pages: Result[] = [
      ...menus.filter((menu) => isHomeroomTeacher || !menu.homeroomOnly).map((menu) => ({ key: menu.key as PageKey, icon: menu.icon })),
      ...extraPages.filter((page) => isHomeroomTeacher || !page.homeroomOnly),
    ]
      .filter((page) => page.key !== "학급 운영")
      .filter((page) => !text || page.key.replace(/[\s·]/g, "").includes(text.replace(/·/g, "")))
      .map((page) => ({ kind: "page" as const, label: page.key, detail: "메뉴로 이동", page: page.key }));
    if (!text) return pages.slice(0, 8);
    const found: Result[] = isHomeroomTeacher
      ? students
          .filter((student) => student.name.replace(/\s+/g, "").includes(text) || String(student.number) === text.replace(/번$/, ""))
          .slice(0, 8)
          .map((student) => ({ kind: "student" as const, label: `${student.number}번 ${student.name}`, detail: "학생 상세정보 열기", student }))
      : [];
    return [...found, ...pages].slice(0, 10);
  }, [query, students, isHomeroomTeacher]);

  useEffect(() => setCursor(0), [query, open]);

  function choose(result: Result | undefined) {
    if (!result) return;
    setOpen(false);
    setQuery("");
    if (result.kind === "student") onOpenStudent(result.student);
    else onNavigate(result.page);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
      <Dialog.Trigger asChild>
        <button className="quiet-button" title="빠른 검색 (Ctrl+K)">⌕ 빠른 검색</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content quick-search-dialog" aria-describedby="quick-search-help">
          <Dialog.Title>빠른 검색</Dialog.Title>
          <p id="quick-search-help" className="quick-search-help">
            학생 이름·번호{isHomeroomTeacher ? "" : "(담임 교사만)"}나 메뉴 이름을 입력하고 Enter를 누르세요.
          </p>
          <input
            className="quick-search-input"
            autoFocus
            placeholder={isHomeroomTeacher ? "예: 김도윤, 12, 출결" : "예: 평가, 설문"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setCursor((value) => Math.min(results.length - 1, value + 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setCursor((value) => Math.max(0, value - 1)); }
              if (event.key === "Enter") { event.preventDefault(); choose(results[cursor]); }
            }}
            aria-label="검색어"
          />
          <ul className="quick-search-results" role="listbox" aria-label="검색 결과">
            {results.map((result, index) => (
              <li key={`${result.kind}-${result.label}`} role="option" aria-selected={index === cursor}>
                <button type="button" className={index === cursor ? "active" : ""} onMouseEnter={() => setCursor(index)} onClick={() => choose(result)}>
                  <b>{result.label}</b>
                  <small>{result.detail}</small>
                </button>
              </li>
            ))}
            {!results.length && <li className="quick-search-empty">찾는 학생이나 메뉴가 없습니다.</li>}
          </ul>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button">닫기</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// 상단 프로필 버튼: 지금 학급·역할과 자주 쓰는 동작(환경 설정, 화면 잠금, 의견 보내기)을 모은다.
export function ProfileMenu({
  config,
  version,
  onNavigate,
  onLock,
}: {
  config: models.ClassConfig | null;
  version: string;
  onNavigate: (page: PageKey) => void;
  onLock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const homeroom = config?.teacherRole !== "비담임 교과 교사";
  const label = homeroom
    ? config?.grade && config?.classNumber
      ? `${config.grade}학년 ${config.classNumber}반 담임`
      : "담임 학급 설정 필요"
    : `${config?.teachingSubject || "교과"} 교사`;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="profile" aria-label="내 정보와 빠른 메뉴" title="내 정보">
          {(config?.teacherLabel || "담").trim().slice(0, 1) || "담"}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content profile-dialog" aria-describedby="profile-desc">
          <Dialog.Title>{config?.teacherLabel || "교사"}</Dialog.Title>
          <p id="profile-desc" className="profile-summary">
            {config?.schoolName ? `${config.schoolName} · ` : ""}
            {config?.schoolYear ? `${config.schoolYear}학년도 · ` : ""}
            {label}
            <br />
            자동 잠금 {config?.autoLockMinutes ?? "-"}분 · 꼬미노트 {version ? `v${version}` : ""}
          </p>
          <div className="profile-actions">
            <button type="button" className="quiet-button" onClick={() => { setOpen(false); onNavigate("환경 설정"); }}>⚙ 환경 설정</button>
            <button type="button" className="quiet-button" onClick={() => { setOpen(false); onLock(); }}>▣ 화면 잠금</button>
            <button type="button" className="quiet-button" onClick={() => void openExternalURL("https://github.com/purnpado/komi_note/issues")}>✉ 의견 보내기</button>
          </div>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <button className="quiet-button">닫기</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
