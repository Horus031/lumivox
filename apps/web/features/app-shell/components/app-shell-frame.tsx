"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Profile } from "@/features/profiles/profile.types";
import { AccountDropdown } from "@/features/app-shell/components/account-dropdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/features/theme/theme-switcher";

type AppShellFrameProps = {
  profile: Profile;
  sidebar: ReactNode;
  children: ReactNode;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY = "lumivox-sidebar-collapsed";

export function AppShellFrame({
  profile,
  sidebar,
  children,
}: AppShellFrameProps) {
  const t = useTranslations("appShell.sidebar");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    setIsSidebarCollapsed(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true",
    );
  }, []);

  function toggleSidebar() {
    setIsSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        String(nextValue),
      );
      return nextValue;
    });
  }

  return (
    <div
      data-sidebar-collapsed={isSidebarCollapsed}
      className="group/sidebar-shell flex min-h-[calc(100svh-var(--spacing-topbar))] lg:min-h-svh"
    >
      {sidebar}

      <header
        className={cn(
          "hidden lg:fixed lg:right-0 lg:top-0 lg:z-20 lg:flex lg:h-topbar lg:items-center lg:justify-between lg:border-b lg:border-border lg:bg-background lg:px-page",
          "transition-[left] duration-200 ease-out motion-reduce:transition-none",
          isSidebarCollapsed ? "lg:left-sidebar-collapsed" : "lg:left-sidebar",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-controls="desktop-sidebar"
          aria-expanded={!isSidebarCollapsed}
          aria-label={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
          title={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
        >
          {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
        <div className="flex items-center gap-2">
          <ThemeSwitcher compact />

          <LanguageSwitcher compact />

          <AccountDropdown profile={profile} align="end" />
        </div>
      </header>

      <main
        className={cn(
          "min-w-0 flex-1 transition-[padding-left] duration-200 ease-out motion-reduce:transition-none lg:pt-topbar",
          isSidebarCollapsed ? "lg:pl-sidebar-collapsed" : "lg:pl-sidebar",
        )}
      >
        <div className="min-w-0 px-card py-page pb-[calc(6rem+env(safe-area-inset-bottom))] md:px-page lg:pb-page">
          {children}
        </div>
      </main>
    </div>
  );
}
