import { AdminCmsSettingsForm } from "@/features/admin/components/admin-cms-settings-form";
import { getAdminCmsSettings } from "@/features/admin/admin-settings.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

export default async function AdminSettingsPage() {
  const [settings, t] = await Promise.all([
    getAdminCmsSettings(),
    getTranslations("admin.settings.page"),
  ]);

  return (
    <div className="min-w-0 max-w-4xl space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminCmsSettingsForm settings={settings} />
    </div>
  );
}
