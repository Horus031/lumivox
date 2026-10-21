import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";
import { useTranslations } from "next-intl";

type TranslationMetrics = {
  total_translations: number;
  english_translations: number;
  vietnamese_translations: number;
  failed_translations: number;
  unique_entities: number;
};

type AdminTranslationMetricsOverviewProps = {
  metrics: TranslationMetrics | null;
};

function value(input: number | null | undefined) {
  return input ?? 0;
}

export function AdminTranslationMetricsOverview({
  metrics,
}: AdminTranslationMetricsOverviewProps) {
  const t = useTranslations("admin.translations.metrics");

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <AdminMetricCard
        label={t("totalTranslations")}
        value={value(metrics?.total_translations)}
        description={t("totalTranslationsDescription")}
      />

      <AdminMetricCard
        label={t("english")}
        value={value(metrics?.english_translations)}
        description={t("englishDescription")}
      />

      <AdminMetricCard
        label={t("vietnamese")}
        value={value(metrics?.vietnamese_translations)}
        description={t("vietnameseDescription")}
      />

      <AdminMetricCard
        label={t("failed")}
        value={value(metrics?.failed_translations)}
        description={t("failedDescription")}
      />

      <AdminMetricCard
        label={t("uniqueEntities")}
        value={value(metrics?.unique_entities)}
        description={t("uniqueEntitiesDescription")}
      />
    </section>
  );
}
