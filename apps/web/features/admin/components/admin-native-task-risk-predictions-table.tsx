import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Link } from "@/i18n/navigation";

type NativeTaskRiskPrediction = {
  prediction_id: string;
  user_id: string;
  owner_name: string | null;
  owner_email: string | null;

  task_id: string;
  task_title: string | null;
  goal_id: string | null;
  goal_title: string | null;

  model_key: string;
  model_version: string;
  algorithm: string;

  risk_probability: number;
  predicted_label: boolean;
  decision_threshold: number;
  risk_score: number;
  risk_band: string;

  days_until_due: number | null;
  due_at: string | null;

  prediction_mode: string | null;
  feature_payload: Record<string, unknown>;
  reason_summaries: {
    title: string;
    description: string;
    severity: string;
  }[];
  recommended_actions: {
    label: string;
    action_type: string;
    description: string;
  }[];

  created_at: string;
};

type Props = {
  predictions: NativeTaskRiskPrediction[];
};

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

function percent(value: number) {
  return `${Math.round(Number(value) * 100)}%`;
}

export function AdminNativeTaskRiskPredictionsTable({
  predictions,
}: Props) {
  const t = useTranslations("admin.nativeTaskRisk.predictions");
  const locale = useLocale();

  return (
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div>
        <p className="text-caption text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-1 text-section font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {predictions.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-secondary-text">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {predictions.map((prediction) => (
            <article
              key={prediction.prediction_id}
              className="min-w-0 py-card"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={bandClass(prediction.risk_band)}>
                      {t(`riskBands.${prediction.risk_band}`)}
                    </Badge>

                    <span className="text-caption tabular-nums text-secondary-text">
                      {percent(prediction.risk_probability)}
                    </span>

                    <span className="text-caption tabular-nums text-secondary-text">
                      {t("threshold", {
                        value: prediction.decision_threshold,
                      })}
                    </span>

                    {prediction.days_until_due !== null ? (
                      <span className="text-caption tabular-nums text-secondary-text">
                        {t("daysLeft", {
                          count: prediction.days_until_due,
                        })}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-2 text-section font-semibold text-foreground">
                    {prediction.task_title ?? prediction.task_id}
                  </h3>

                  {prediction.goal_title ? (
                    <p className="mt-1 text-body text-secondary-text">
                      {t("goal", { title: prediction.goal_title })}
                    </p>
                  ) : null}

                  <p className="mt-3 text-caption text-muted-foreground">
                    {t("owner", {
                      name: prediction.owner_name ?? t("unknownOwner"),
                      email: prediction.owner_email ?? prediction.user_id,
                    })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("model", {
                      algorithm: prediction.algorithm,
                      version: prediction.model_version,
                      mode: prediction.prediction_mode ?? "native_ml",
                    })}
                  </p>

                  <p className="mt-1 text-caption text-muted-foreground">
                    {t("created", {
                      value: new Date(prediction.created_at).toLocaleString(locale),
                    })}
                  </p>
                </div>

                <Button asChild variant="ghost" size="icon"><Link href={`/admin/native-task-risk/${prediction.prediction_id}`} aria-label={`${t("viewDetail")}: ${prediction.task_title ?? prediction.task_id}`} title={t("viewDetail")}><ArrowUpRight aria-hidden="true" /></Link></Button>
              </div>

              {prediction.reason_summaries?.length > 0 ? (
                <div className="mt-3 min-w-0 border-l-2 border-border pl-3 [overflow-wrap:anywhere]">
                  <p className="text-label font-medium text-foreground">
                    {t("explanationSummary")}
                  </p>

                  <div className="mt-2 space-y-3">
                    {prediction.reason_summaries.slice(0, 2).map((reason) => (
                      <div
                        key={`${prediction.prediction_id}-${reason.title}`}
                        className="min-w-0"
                      >
                        <p className="text-label font-medium text-foreground">
                          {reason.title}
                        </p>

                        <p className="mt-1 text-body text-secondary-text">
                          {reason.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
