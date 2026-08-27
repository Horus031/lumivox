import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";

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
  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <AdminMetricCard
        label="Total Translations"
        value={value(metrics?.total_translations)}
        description="Cached AI content translations"
      />

      <AdminMetricCard
        label="English"
        value={value(metrics?.english_translations)}
        description="Target locale: en"
      />

      <AdminMetricCard
        label="Vietnamese"
        value={value(metrics?.vietnamese_translations)}
        description="Target locale: vi"
      />

      <AdminMetricCard
        label="Failed"
        value={value(metrics?.failed_translations)}
        description="Failed translation records"
      />

      <AdminMetricCard
        label="Unique Entities"
        value={value(metrics?.unique_entities)}
        description="AI entities with cached translations"
      />
    </section>
  );
}