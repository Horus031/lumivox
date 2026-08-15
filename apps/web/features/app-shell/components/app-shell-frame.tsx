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
      className="group/sidebar-shell flex min-h-screen"
    >
      {sidebar}

      <header
        className={cn(
          "hidden lg:fixed lg:right-0 lg:top-0 lg:z-20 lg:flex lg:h-18 lg:items-center lg:justify-between lg:border-b lg:border-border/60 lg:bg-background/86 lg:px-6 lg:backdrop-blur-xl",
          "transition-[left] duration-300 ease-out",
          isSidebarCollapsed ? "lg:left-22" : "lg:left-77",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          aria-label={
            isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
          }
          title={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="h-10 w-10 rounded-full border border-border/70 bg-surface shadow-sm hover:bg-muted/80"
        >
          {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>

        <div className="flex items-center gap-4">
          <LanguageSwitcher />

          <AccountDropdown profile={profile} align="end" />
        </div>
      </header>

      <main
        className={cn(
          "z-1 min-w-0 flex-1 pb-28 transition-[padding-left] duration-300 ease-out lg:pb-8 lg:pt-22",
          isSidebarCollapsed ? "lg:pl-22" : "lg:pl-81",
        )}
      >
        {children}
      </main>
    </div>
  );
}
