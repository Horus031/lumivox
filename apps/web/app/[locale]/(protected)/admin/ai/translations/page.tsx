import { AdminTranslationMetricsOverview } from "@/features/admin/components/admin-translation-metrics-overview";
import { AdminTranslationSearchForm } from "@/features/admin/components/admin-translation-search-form";
import { AdminTranslationsTable } from "@/features/admin/components/admin-translations-table";
import {
  getAdminAiTranslationMetrics,
  searchAdminAiContentTranslations,
} from "@/features/admin/admin-translations.queries";

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

  const [metrics, translations] = await Promise.all([
    getAdminAiTranslationMetrics(),
    searchAdminAiContentTranslations({
      query,
      targetLocale,
      status: translationStatus,
    }),
  ]);

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Admin CMS
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          AI Translation Monitoring
        </h1>

        <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
          Monitor cached translations for AI-generated content across English
          and Vietnamese interfaces.
        </p>
      </section>

      <AdminTranslationMetricsOverview metrics={metrics} />

      <AdminTranslationSearchForm
        initialQuery={query}
        initialTargetLocale={targetLocale}
        initialStatus={translationStatus}
      />

      <AdminTranslationsTable translations={translations} />
    </main>
  );
}