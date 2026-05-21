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
    <div className="min-h-screen w-full bg-background text-foreground">
      <MobileAppHeader profile={profile} />

      <div className="flex min-h-screen">
        <DesktopSidebar profile={profile} />

        <main className="min-w-0 flex-1 pb-28 lg:pb-0 lg:pl-81">{children}</main>
      </div>

      <MobileBottomNav />
    </div>
  );
}
