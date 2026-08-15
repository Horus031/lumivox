import { PageHeader } from "@/features/app-shell/components/page-header";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { SettingsForm } from "@/features/settings/components/settings-form";

import { getCurrentEngagementStats } from "@/features/engagement-retention/engagement-retention.queries";
import { StreakRestoreSettingsCard } from "@/features/engagement-retention/components/streak-restore-settings-card";
import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const [{ profile, weights }, engagementStats, t] = await Promise.all([
    getCurrentProfileWithWeights(),
    getCurrentEngagementStats(),
    getTranslations("settings.page"),
  ]);

  return (
    <section className="px-4 py-6 md:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <SettingsForm profile={profile} weights={weights} />

        <StreakRestoreSettingsCard stats={engagementStats} />
      </div>
    </section>
  );
}
