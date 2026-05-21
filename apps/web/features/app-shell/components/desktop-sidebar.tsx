import type { Profile } from "@/features/profiles/profile.types";

import { AppNavigation } from "@/features/app-shell/components/app-navigation";
import { UserMenuCard } from "@/features/app-shell/components/user-menu-card";

type DesktopSidebarProps = {
  profile: Profile;
};

export function DesktopSidebar({ profile }: DesktopSidebarProps) {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:block lg:w-77 lg:p-4 xl:p-0">
      <div className="flex h-full flex-col rounded-4xl bg-sidebar/95 px-4 py-5 gap-4 shadow-[0_20px_70px_-55px_hsl(var(--primary)/0.28)] ring-1 ring-border/70 backdrop-blur-xl">
        <div className="">
          <div className="rounded-[28px] bg-sidebar px-1 py-1">
            <div className="rounded-3xl bg-muted/55 px-4 py-4">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Lumivox
              </p>

              <h4 className="mt-3 font-semibold tracking-tight text-foreground">
                Behaviour Intelligence
              </h4>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto lg:h-full pr-1">
          <AppNavigation />
        </div>

        <div>
          <UserMenuCard profile={profile} />
        </div>
      </div>
    </aside>
  );
}
