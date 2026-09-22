import { Suspense } from "react";

import { PageHeader } from "@/features/app-shell/components/page-header";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { getCurrentEngagementStats } from "@/features/engagement-retention/engagement-retention.queries";
import { StreakRestoreSettingsCard } from "@/features/engagement-retention/components/streak-restore-settings-card";
import { getTranslations } from "next-intl/server";

async function SettingsEngagementSection() {
  const engagementStats = await getCurrentEngagementStats();
  return <StreakRestoreSettingsCard stats={engagementStats} />;
}

function SettingsEngagementFallback() {
  return (
    <div
      aria-hidden="true"
      className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card/60"
    />
  );
}

export default async function SettingsPage() {
  const [{ profile, weights }, t] = await Promise.all([
    getCurrentProfileWithWeights(),
    getTranslations("settings.page"),
  ]);

  return (
    <section>
      <div className="mx-auto max-w-5xl space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <SettingsForm profile={profile} weights={weights} />

        <Suspense fallback={<SettingsEngagementFallback />}>
          <SettingsEngagementSection />
        </Suspense>
      </div>
    </section>
  );
}
