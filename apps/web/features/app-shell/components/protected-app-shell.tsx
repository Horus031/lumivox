import type { ReactNode } from "react";

import type { Profile } from "@/features/profiles/profile.types";
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

      <div className="flex min-h-screen">
        <DesktopSidebar profile={profile} />

        <main className="min-w-0 flex-1 pb-28 lg:pb-0 lg:pl-81 z-1">
          {children}
        </main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
