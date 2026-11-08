// 자동 저장을 기다리는 화면이 잠금 직전에 남은 입력을 저장할 수 있게 하는 등록소입니다.
// 화면 잠금은 보관함을 닫기 전에 flushPendingSaves를 기다립니다(최대 2초, 실패해도 잠금은 진행).

type Flush = () => Promise<void>;

const flushers = new Set<Flush>();

export function registerPendingSave(flush: Flush) {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}

export async function flushPendingSaves(timeoutMs = 2000) {
  if (flushers.size === 0) return;
  const all = Promise.allSettled([...flushers].map((flush) => flush()));
  await Promise.race([all, new Promise((resolve) => window.setTimeout(resolve, timeoutMs))]);
}
