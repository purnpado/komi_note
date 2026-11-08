import { Browser, Clipboard, Window } from "@wailsio/runtime";

// 데스크톱 앱 안의 웹 화면에서는 브라우저 전용 기능(팝업 창, 클립보드)이 막히는 경우가 있어
// 프로그램(Wails) 기능을 먼저 쓰고, 브라우저 미리보기에서만 브라우저 기능으로 대신합니다.

export async function openExternalURL(url: string): Promise<void> {
  try {
    await Browser.OpenURL(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function copyText(text: string): Promise<void> {
  try {
    await Clipboard.SetText(text);
    return;
  } catch {
    // 브라우저 미리보기(서버 모드)에서는 아래 방법을 씁니다.
  }
  await navigator.clipboard.writeText(text);
}

export function escapePrintText(value: string | number | undefined | null): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

let cleanupPrintSheet: (() => void) | null = null;

/**
 * 인쇄용 내용을 현재 화면에 숨겨 붙인 뒤 프로그램 인쇄 창을 엽니다.
 * css의 선택자는 모두 `.print-sheet` 아래로 한정해서 써야 다른 화면에 영향을 주지 않습니다.
 * `@page` 규칙은 인쇄가 끝나면(afterprint) 함께 지워집니다.
 */
export async function printSheet(html: string, css: string): Promise<void> {
  cleanupPrintSheet?.();
  const style = document.createElement("style");
  style.textContent = `.print-sheet{display:none}
@media print{
  html:has(body.printing-sheet),body.printing-sheet{background:#fff !important;height:auto !important;overflow:visible !important}
  body.printing-sheet > *:not(.print-sheet){display:none !important}
  body.printing-sheet .print-sheet,body.printing-sheet .print-sheet *{visibility:visible !important}
  body.printing-sheet .print-sheet{display:block !important;position:static;width:100%;background:#fff}
  body.printing-sheet .print-sheet *{print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
${css}`;
  const sheet = document.createElement("div");
  sheet.className = "print-sheet";
  sheet.innerHTML = html;
  document.head.appendChild(style);
  document.body.appendChild(sheet);
  document.body.classList.add("printing-sheet");
  const cleanup = () => {
    style.remove();
    sheet.remove();
    document.body.classList.remove("printing-sheet");
    window.removeEventListener("afterprint", cleanup);
    if (cleanupPrintSheet === cleanup) cleanupPrintSheet = null;
  };
  cleanupPrintSheet = cleanup;
  window.addEventListener("afterprint", cleanup);
  try {
    await Window.Print();
  } catch {
    window.print();
  }
}
