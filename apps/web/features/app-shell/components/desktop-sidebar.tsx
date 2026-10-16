import { Suspense } from "react";
import type { Profile } from "@/features/profiles/profile.types";

import { AppNavigation } from "@/features/app-shell/components/app-navigation";
import { SidebarEngagementMiniStats } from "@/features/engagement-retention/components/sidebar-engagement-mini-stats";
import { getCurrentEngagementStats } from "@/features/engagement-retention/engagement-retention.queries";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type DesktopSidebarProps = {
  profile: Profile;
};

async function SidebarEngagement({ userId }: { userId: string }) {
  const engagementStats = await getCurrentEngagementStats();

  return (
    <SidebarEngagementMiniStats
      userId={userId}
      stats={engagementStats}
    />
  );
}

function SidebarEngagementFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-24 animate-pulse rounded-lg bg-muted"
    />
  );
}

export async function DesktopSidebar({ profile }: DesktopSidebarProps) {
  const t = await getTranslations("appShell.sidebar");

  return (
    <aside id="desktop-sidebar" aria-label={t("title")} className="desktop-sidebar z-20 hidden overflow-hidden border-r border-sidebar-border transition-[width] duration-200 ease-out motion-reduce:transition-none lg:fixed lg:inset-y-0 lg:block lg:w-sidebar">
      <div className="desktop-sidebar-panel flex h-full min-h-0 flex-col bg-sidebar">
        <Link href="/dashboard" aria-label={t("eyebrow")} title={t("eyebrow")} className="flex h-topbar shrink-0 items-center gap-3 border-b border-sidebar-border px-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <span aria-hidden="true" className="desktop-sidebar-brand-mark flex size-control-sm shrink-0 items-center justify-center rounded-md bg-primary text-body font-semibold text-primary-foreground">L</span>
          <span className="desktop-sidebar-brand-copy text-section font-semibold">{t("eyebrow")}</span>
        </Link>

        <div className="desktop-sidebar-nav-scroll min-h-0 w-full flex-1 overflow-y-auto px-2 py-3">
          <AppNavigation profile={profile} />
        </div>

        <div className="desktop-sidebar-engagement shrink-0 border-t border-sidebar-border px-3 pb-3">
          <Suspense fallback={<SidebarEngagementFallback />}>
            <SidebarEngagement userId={profile.id} />
          </Suspense>
        </div>
      </div>
    </aside>
  );
}
