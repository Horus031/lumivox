import { AdminCmsSettingsForm } from "@/features/admin/components/admin-cms-settings-form";
import { getAdminCmsSettings } from "@/features/admin/admin-settings.queries";
import { getTranslations } from "next-intl/server";

export default async function AdminSettingsPage() {
  const [settings, t] = await Promise.all([
    getAdminCmsSettings(),
    getTranslations("admin.settings.page"),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6 shadow-sm">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-muted-foreground">
          {t("description")}
        </p>
      </section>

      <AdminCmsSettingsForm settings={settings} />
    </main>
  );
}
