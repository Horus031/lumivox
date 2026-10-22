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
import { PageHeader } from "@/features/app-shell/components/page-header";

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
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />

      <AdminNativeTaskRiskMetricsOverview metrics={metrics} />

      <AdminNativeTaskRiskModelsCard models={normalizedModels} />

      <AdminNativeTaskRiskSearchForm
        initialQuery={query}
        initialRiskBand={riskBand}
      />

      <AdminNativeTaskRiskPredictionsTable
        predictions={normalizedPredictions}
      />
    </div>
  );
}
