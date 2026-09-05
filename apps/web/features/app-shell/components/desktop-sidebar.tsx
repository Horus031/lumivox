import type { Profile } from "@/features/profiles/profile.types";

import { AppNavigation } from "@/features/app-shell/components/app-navigation";
// import { UserMenuCard } from "@/features/app-shell/components/user-menu-card";
import { getCurrentEngagementStats } from "@/features/engagement-retention/engagement-retention.queries";
import { SidebarEngagementMiniStats } from "@/features/engagement-retention/components/sidebar-engagement-mini-stats";
import { getTranslations } from "next-intl/server";

type DesktopSidebarProps = {
  profile: Profile;
};

export async function DesktopSidebar({ profile }: DesktopSidebarProps) {
  const t = await getTranslations("appShell.sidebar");
  const engagementStats = await getCurrentEngagementStats();

  return (
    <aside className="desktop-sidebar z-2 hidden transition-all duration-300 ease-out lg:fixed lg:inset-y-0 lg:block lg:w-68 lg:p-4 xl:p-0">
      <div className="desktop-sidebar-panel flex h-full flex-col gap-4 rounded-tr-2xl rounded-br-2xl bg-sidebar/95 px-4 py-5 shadow-[0_20px_70px_-55px_hsl(var(--primary)/0.28)] ring-1 ring-border/70 backdrop-blur-xl transition-all duration-300 ease-out">
        <div className="rounded-[28px] bg-sidebar px-1 py-1">
          <div className="rounded-3xl">
            <div className="desktop-sidebar-brand-mark hidden h-10 w-10 items-center justify-center rounded-2xl bg-primary/12 text-sm font-bold text-primary">
              L
            </div>
            <p className="desktop-sidebar-brand-copy text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground transition-all duration-200">
              {t("eyebrow")}
            </p>

            <h4 className="desktop-sidebar-brand-copy mt-3 font-semibold tracking-tight text-foreground transition-all duration-200">
              {t("title")}
            </h4>
          </div>
        </div>

        <div className="w-fit mt-4 flex-1 overflow-y-auto lg:h-full">
          <AppNavigation profile={profile} />
        </div>

        <div className="space-y-4">
          <div className="desktop-sidebar-engagement transition-all duration-200">
            <SidebarEngagementMiniStats
              userId={profile.id}
              stats={engagementStats}
            />
          </div>
          {/* <UserMenuCard profile={profile} /> */}
        </div>
      </div>
    </aside>
  );
}
