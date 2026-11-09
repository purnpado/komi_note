import { useEffect, useState } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { MemoEditor } from "./MemoEditor";
import "./memo.css";

/** 상단 바 ‘빠른 메모’ 버튼(Ctrl+M). 어느 화면에서든 메모·할 일을 바로 적는다. 저장하면 memo:변경 알림으로 다른 화면이 다시 읽는다. */
export function QuickMemo({ onSaved }: { onSaved?: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    // 트레이 메뉴 '빠른 메모'
    const off = EventsOn("app:빠른메모", () => setOpen(true));
    return () => { window.removeEventListener("keydown", onKey); off(); };
  }, []);
  return (
    <>
      <button className="quiet-button" title="빠른 메모 (Ctrl+M)" onClick={() => setOpen(true)}>✎ 빠른 메모</button>
      <MemoEditor open={open} item={null} kind="메모" tagSuggestions={[]} onOpenChange={setOpen} onSaved={(_, message) => onSaved?.(message)} />
    </>
  );
}
