"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

const STORAGE_KEY = "sidebar-collapsed";

interface AppShellProps {
  sidebar: React.ReactNode;
  accountHref?: string;
  children: React.ReactNode;
}

export function AppShell({ sidebar, accountHref, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      setCollapsed(true);
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-full">
      {!collapsed && sidebar}
      <div className="flex flex-1 flex-col">
        <AppHeader accountHref={accountHref} onToggleSidebar={toggleSidebar} />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
