import { useEffect, useState } from "react";

const sidebarCollapsedStorageKey = "kkomi.sidebar.collapsed";

export function useSidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(sidebarCollapsedStorageKey) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(sidebarCollapsedStorageKey, String(collapsed));
    } catch {
      // 화면 설정을 저장하지 못해도 현재 상태는 유지합니다.
    }
  }, [collapsed]);

  return { collapsed, setCollapsed };
}
