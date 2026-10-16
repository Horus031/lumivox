import { PageHeader } from "@/features/app-shell/components/page-header";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const [{ profile, weights }, t] = await Promise.all([
    getCurrentProfileWithWeights(),
    getTranslations("settings.page"),
  ]);

  return (
    <section>
      <div className="min-w-0 max-w-4xl space-y-section">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />

        <SettingsForm profile={profile} weights={weights} />
      </div>
    </section>
  );
}
