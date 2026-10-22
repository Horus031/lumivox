import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/features/app-shell/components/page-header";
import { getAdminNativeTaskRiskPredictionDetail } from "@/features/admin/admin-native-task-risk.queries";
import type { Json } from "@/types/database.types";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{
    predictionId: string;
  }>;
};

type NativeTaskRiskAttribution = {
  feature_name: string;
  feature_value: number;
  contribution: number;
  effect: string;
  rank: number;
};

function toArray<T>(value: Json): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function JsonBlock({ value, label }: { value: unknown; label: string }) {
  return (
    <pre role="region" aria-label={label} tabIndex={0} className="max-h-80 max-w-full overflow-auto rounded-md border border-border bg-muted p-3 text-caption text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function bandClass(band: string) {
  if (band === "high") {
    return "border-danger/25 bg-danger/10 text-foreground";
  }

  if (band === "elevated") {
    return "border-warning/40 bg-warning/15 text-foreground";
  }

  if (band === "moderate") {
    return "border-warning/25 bg-warning/10 text-foreground";
  }

  return "border-success/25 bg-success/10 text-foreground";
}

export default async function AdminNativeTaskRiskPredictionDetailPage({
  params,
}: PageProps) {
  const { predictionId } = await params;

  const [prediction, t] = await Promise.all([
    getAdminNativeTaskRiskPredictionDetail(predictionId),
    getTranslations("admin.nativeTaskRisk.detail"),
  ]);

  const attributions = toArray<NativeTaskRiskAttribution>(
    prediction.attributions,
  );

  return (
    <div className="min-w-0 space-y-section">
      <PageHeader eyebrow={t("eyebrow")} title={prediction.task_title ?? prediction.task_id} description={t("owner", { name: prediction.owner_name ?? t("unknownOwner"), email: prediction.owner_email ?? prediction.user_id })} action={
        <Button asChild variant="outline"><Link href="/admin/native-task-risk"><ArrowLeft aria-hidden="true" />{t("back")}</Link></Button>
      } />
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-t border-border pt-card">
        <Badge variant="outline" className={bandClass(prediction.risk_band)}>{t(`riskBands.${prediction.risk_band}`)}</Badge>
        <span className="text-label tabular-nums text-secondary-text">{t("probability", { value: Math.round(Number(prediction.risk_probability) * 100) })}</span>
        <span className="text-label tabular-nums text-secondary-text">{t("threshold", { value: prediction.decision_threshold })}</span>
        <span className="min-w-0 text-label text-secondary-text [overflow-wrap:anywhere]">{prediction.algorithm}</span>
      </div>
      <section className="grid min-w-0 gap-section xl:grid-cols-2">
        <div className="min-w-0 space-y-3 border-t border-border pt-card">
          <h2 className="text-section font-semibold text-foreground">
            {t("attributionsTitle")}
          </h2>

          <div className="divide-y divide-border">
            {attributions.map(
              (item) => (
                <div
                  key={`${item.feature_name}-${item.rank}`}
                  className="min-w-0 py-3 [overflow-wrap:anywhere]"
                >
                  <div className="flex min-w-0 flex-wrap justify-between gap-2">
                    <p className="text-body font-medium text-foreground">
                      {item.rank}. {item.feature_name}
                    </p>

                    <span className="text-caption text-muted-foreground">
                      {item.effect}
                    </span>
                  </div>

                  <p className="mt-1 text-caption text-secondary-text">
                    {t("attributionMeta", {
                      value: item.feature_value,
                      contribution: item.contribution,
                    })}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-3 border-t border-border pt-card">
          <h2 className="text-section font-semibold text-foreground">
            {t("modelMetricsTitle")}
          </h2>

          <div className="mt-4">
            <JsonBlock label={t("modelMetricsTitle")} value={prediction.model_metrics} />
          </div>
        </div>
      </section>

      <section className="min-w-0 space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("featurePayloadTitle")}
        </h2>

        <div className="mt-4">
          <JsonBlock label={t("featurePayloadTitle")} value={prediction.feature_payload} />
        </div>
      </section>

      <section className="min-w-0 space-y-3 border-t border-border pt-card">
        <h2 className="text-section font-semibold text-foreground">
          {t("predictionMetadataTitle")}
        </h2>

        <div className="mt-4">
          <JsonBlock label={t("predictionMetadataTitle")} value={prediction.prediction_metadata} />
        </div>
      </section>
    </div>
  );
}
