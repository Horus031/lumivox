import type { ReactNode } from "react";

import type { Profile } from "@/features/profiles/profile.types";
import { AppShellFrame } from "@/features/app-shell/components/app-shell-frame";
import { DesktopSidebar } from "@/features/app-shell/components/desktop-sidebar";
import { MobileAppHeader } from "@/features/app-shell/components/mobile-app-header";
import { MobileBottomNav } from "@/features/app-shell/components/mobile-bottom-nav";

type ProtectedAppShellProps = {
  profile: Profile;
  children: ReactNode;
};

export function ProtectedAppShell({
  profile,
  children,
}: ProtectedAppShellProps) {
  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      {/* <div className="fixed h-screen w-full bg-[url('/app-bg6.jpg')] bg-cover bg-no-repeat bg-center z-0 blur-xs brightness-75 "></div> */}

      <MobileAppHeader profile={profile} />

      <AppShellFrame
        profile={profile}
        sidebar={<DesktopSidebar profile={profile} />}
      >
        {children}
      </AppShellFrame>

      <MobileBottomNav profile={profile} />
    </div>
  );
}
