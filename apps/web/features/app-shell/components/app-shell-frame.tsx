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

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        aria-label={
          isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
        }
        title={isSidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")}
        className={cn(
          "hidden lg:fixed lg:top-5 lg:z-30 lg:flex lg:h-10 lg:w-10 lg:rounded-full lg:border lg:border-border/70 lg:bg-surface lg:shadow-sm lg:transition-[left] lg:duration-300 lg:ease-out lg:hover:bg-muted/80",
          isSidebarCollapsed ? "lg:left-17" : "lg:left-63",
        )}
      >
        {isSidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>

      <header
        className={cn(
          "hidden lg:fixed lg:right-0 lg:top-0 lg:z-20 lg:flex lg:h-18 lg:items-center lg:justify-end lg:border-b lg:border-border/60 lg:bg-background/86 lg:px-8 lg:backdrop-blur-xl",
          "transition-[left] duration-300 ease-out",
          isSidebarCollapsed ? "lg:left-22" : "lg:left-68",
        )}
      >
        <div className="flex items-center gap-4">
          <LanguageSwitcher />

          <AccountDropdown profile={profile} align="end" />
        </div>
      </header>

      <main
        className={cn(
          "z-1 min-w-0 flex-1 transition-[padding-left] duration-300 ease-out lg:pt-18",
          isSidebarCollapsed ? "lg:pl-22" : "lg:pl-68",
        )}
      >
        <div className="px-4 py-6 pb-28 md:px-6 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </div>
      </main>
    </div>
  );
}
