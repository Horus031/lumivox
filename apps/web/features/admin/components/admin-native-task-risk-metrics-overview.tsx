import { useTranslations } from "next-intl";

import { AdminMetricCard } from "@/features/admin/components/admin-metric-card";

type NativeTaskRiskMetrics = {
  total_predictions: number;
  predictions_last_24h: number;
  predictions_last_7d: number;

  low_risk_predictions: number;
  moderate_risk_predictions: number;
  elevated_risk_predictions: number;
  high_risk_predictions: number;

  avg_risk_probability: number | null;
  avg_risk_score: number | null;

  active_model_key: string | null;
  active_model_version: string | null;
  active_algorithm: string | null;
  active_model_created_at: string | null;
};

type Props = {
  metrics: NativeTaskRiskMetrics | null;
};

function value(input: number | null | undefined) {
  return input ?? 0;
}

function percent(input: number | null | undefined) {
  if (input === null || input === undefined) return "0%";
  return `${Math.round(Number(input) * 100)}%`;
}

export function AdminNativeTaskRiskMetricsOverview({ metrics }: Props) {
  const t = useTranslations("admin.nativeTaskRisk.metrics");

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <AdminMetricCard
        label={t("nativePredictions.label")}
        value={value(metrics?.total_predictions)}
        description={t("nativePredictions.description", {
          count: value(metrics?.predictions_last_24h),
        })}
      />

      <AdminMetricCard
        label={t("avgRisk.label")}
        value={percent(metrics?.avg_risk_probability)}
        description={t("avgRisk.description", {
          score: value(metrics?.avg_risk_score),
        })}
      />

      <AdminMetricCard
        label={t("highElevated.label")}
        value={`${value(metrics?.high_risk_predictions)} / ${value(
          metrics?.elevated_risk_predictions
        )}`}
        description={t("highElevated.description")}
      />

      <AdminMetricCard
        label={t("activeModel.label")}
        value={metrics?.active_algorithm ?? t("notAvailable")}
        description={metrics?.active_model_version ?? t("activeModel.empty")}
      />
    </section>
  );
}
