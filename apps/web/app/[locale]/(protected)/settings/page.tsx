import { PageHeader } from "@/features/app-shell/components/page-header";
import { getCurrentProfileWithWeights } from "@/features/profiles/profile.queries";
import { SettingsForm } from "@/features/settings/components/settings-form";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getStudyNotificationPreferencesAction } from "@/features/learning-schedule/notification-preferences.actions";
import { StudyNotificationSettings } from "@/features/learning-schedule/components/study-notification-settings";

async function ReminderSection() {
  const result = await getStudyNotificationPreferencesAction();
  const allowOptIn = process.env.STUDY_REMINDER_SETTINGS_ENABLED === "true";
  return result.success
    ? <StudyNotificationSettings initialPreferences={result.preferences} allowOptIn={allowOptIn} />
    : <StudyNotificationSettings initialError={result.code} allowOptIn={allowOptIn} />;
}

export default async function SettingsPage() {
  const [{ profile, weights }, t, reminders] = await Promise.all([
    getCurrentProfileWithWeights(),
    getTranslations("settings.page"),
    getTranslations("studyNotifications"),
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
        <Suspense fallback={<p role="status">{reminders("loading")}</p>}><ReminderSection /></Suspense>
      </div>
    </section>
  );
}
