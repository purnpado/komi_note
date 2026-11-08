// 날짜·오류 문구를 화면에 보여 줄 때 쓰는 공통 함수입니다.

// toLocalDateString은 이 컴퓨터의 시간대 기준 YYYY-MM-DD를 돌려줍니다.
// toISOString()은 UTC 기준이라 한국 시각 오전 9시 전에는 전날이 되므로 쓰지 않습니다.
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayLocal(): string {
  return toLocalDateString(new Date());
}

// errorMessage는 프로그램 오류를 교사가 읽을 문장만 남깁니다("RuntimeError: " 같은 앞부분 제거).
export function errorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message || String(error)
      : typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : String(error ?? "");
  const cleaned = raw.replace(/^(?:[A-Za-z]*Error|Error)\s*:\s*/u, "").trim();
  return cleaned || "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}
