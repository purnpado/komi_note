import { useEffect, useRef } from "react";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import { subscribeChanges, type ChangeNotice } from "./changeEvents";

/** 화면이 보여지는 동안 변경 알림을 구독하고, 알림이 오면 reload를 부른다. 화면이 닫히면 자동으로 해제한다. */
export function useVaultChanges(names: readonly string[], reload: (name: string, notice: ChangeNotice) => void) {
  const latest = useRef(reload);
  latest.current = reload;
  const key = names.join("|");
  useEffect(() => subscribeChanges(EventsOn, key.split("|"), (name, notice) => latest.current(name, notice)), [key]);
}
