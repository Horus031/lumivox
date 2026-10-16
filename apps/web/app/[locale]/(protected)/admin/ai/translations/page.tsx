import { AdminTranslationMetricsOverview } from "@/features/admin/components/admin-translation-metrics-overview";
import { AdminTranslationSearchForm } from "@/features/admin/components/admin-translation-search-form";
import { AdminTranslationsTable } from "@/features/admin/components/admin-translations-table";
import {
  getAdminAiTranslationMetrics,
  searchAdminAiContentTranslations,
} from "@/features/admin/admin-translations.queries";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/features/app-shell/components/page-header";

type AdminAiTranslationsPageProps = {
  searchParams: Promise<{
    q?: string;
    locale?: string;
    status?: string;
  }>;
};

export default async function AdminAiTranslationsPage({
  searchParams,
}: AdminAiTranslationsPageProps) {
  const { q, locale, status } = await searchParams;

  const query = q ?? "";
  const targetLocale = locale ?? "all";
  const translationStatus = status ?? "all";

  const [metrics, translations, t] = await Promise.all([
    getAdminAiTranslationMetrics(),
    searchAdminAiContentTranslations({
      query,
      targetLocale,
      status: translationStatus,
    }),
    getTranslations("admin.translations.page"),
  ]);

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminTranslationMetricsOverview metrics={metrics} />

      <AdminTranslationSearchForm
        initialQuery={query}
        initialTargetLocale={targetLocale}
        initialStatus={translationStatus}
      />

      <AdminTranslationsTable translations={translations} />
    </div>
  );
}
