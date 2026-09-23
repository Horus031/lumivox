import { AdminNativeTaskRiskMetricsOverview } from "@/features/admin/components/admin-native-task-risk-metrics-overview";
import { AdminNativeTaskRiskModelsCard } from "@/features/admin/components/admin-native-task-risk-models-card";
import { AdminNativeTaskRiskPredictionsTable } from "@/features/admin/components/admin-native-task-risk-predictions-table";
import { AdminNativeTaskRiskSearchForm } from "@/features/admin/components/admin-native-task-risk-search-form";
import {
  getAdminNativeTaskRiskMetrics,
  getAdminNativeTaskRiskModelVersions,
  searchAdminNativeTaskRiskPredictions,
} from "@/features/admin/admin-native-task-risk.queries";
import type { Json } from "@/types/database.types";
import { getTranslations } from "next-intl/server";

type AdminNativeTaskRiskPageProps = {
  searchParams: Promise<{
    q?: string;
    risk?: string;
  }>;
};

function toRecord(value: Json): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toArray<T>(value: Json): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default async function AdminNativeTaskRiskPage({
  searchParams,
}: AdminNativeTaskRiskPageProps) {
  const { q, risk } = await searchParams;

  const query = q ?? "";
  const riskBand = risk ?? "all";

  const [metrics, models, predictions, t] = await Promise.all([
    getAdminNativeTaskRiskMetrics(),
    getAdminNativeTaskRiskModelVersions(),
    searchAdminNativeTaskRiskPredictions({
      query,
      riskBand,
    }),
    getTranslations("admin.nativeTaskRisk.page"),
  ]);

  const normalizedModels = models.map((model) => ({
    ...model,
    metrics: toRecord(model.metrics),
    feature_schema: toRecord(model.feature_schema),
    explainability_metadata: toRecord(model.explainability_metadata),
  }));

  const normalizedPredictions = predictions.map((prediction) => ({
    ...prediction,
    feature_payload: toRecord(prediction.feature_payload),
    reason_summaries: toArray<{
      title: string;
      description: string;
      severity: string;
    }>(prediction.reason_summaries),
    recommended_actions: toArray<{
      label: string;
      action_type: string;
      description: string;
    }>(prediction.recommended_actions),
  }));

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

      <AdminNativeTaskRiskMetricsOverview metrics={metrics} />

      <AdminNativeTaskRiskModelsCard models={normalizedModels} />

      <AdminNativeTaskRiskSearchForm
        initialQuery={query}
        initialRiskBand={riskBand}
      />

      <AdminNativeTaskRiskPredictionsTable
        predictions={normalizedPredictions}
      />
    </main>
  );
}
