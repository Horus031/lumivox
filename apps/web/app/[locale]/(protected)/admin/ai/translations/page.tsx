import { AdminTranslationMetricsOverview } from "@/features/admin/components/admin-translation-metrics-overview";
import { AdminTranslationSearchForm } from "@/features/admin/components/admin-translation-search-form";
import { AdminTranslationsTable } from "@/features/admin/components/admin-translations-table";
import {
  getAdminAiTranslationMetrics,
  searchAdminAiContentTranslations,
} from "@/features/admin/admin-translations.queries";
import { getTranslations } from "next-intl/server";

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
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("eyebrow")}
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
          {t("title")}
        </h1>

        <p className="mt-3 max-w-3xl text-neutral-600 dark:text-neutral-400">
          {t("description")}
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
