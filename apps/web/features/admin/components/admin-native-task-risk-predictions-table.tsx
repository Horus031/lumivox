import { useTranslations } from "next-intl";

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
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }

  if (band === "elevated") {
    return "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300";
  }

  if (band === "moderate") {
    return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  }

  return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function percent(value: number) {
  return `${Math.round(Number(value) * 100)}%`;
}

export function AdminNativeTaskRiskPredictionsTable({
  predictions,
}: Props) {
  const t = useTranslations("admin.nativeTaskRisk.predictions");

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {t("eyebrow")}
        </p>

        <h2 className="mt-2 text-2xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("title")}
        </h2>
      </div>

      {predictions.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {predictions.map((prediction) => (
            <article
              key={prediction.prediction_id}
              className="rounded-2xl border p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${bandClass(
                        prediction.risk_band
                      )}`}
                    >
                      {t(`riskBands.${prediction.risk_band}`)}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {percent(prediction.risk_probability)}
                    </span>

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {t("threshold", {
                        value: prediction.decision_threshold,
                      })}
                    </span>

                    {prediction.days_until_due !== null ? (
                      <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                        {t("daysLeft", {
                          count: prediction.days_until_due,
                        })}
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-neutral-950 dark:text-neutral-50">
                    {prediction.task_title ?? prediction.task_id}
                  </h3>

                  {prediction.goal_title ? (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {t("goal", { title: prediction.goal_title })}
                    </p>
                  ) : null}

                  <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("owner", {
                      name: prediction.owner_name ?? t("unknownOwner"),
                      email: prediction.owner_email ?? prediction.user_id,
                    })}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("model", {
                      algorithm: prediction.algorithm,
                      version: prediction.model_version,
                      mode: prediction.prediction_mode ?? "native_ml",
                    })}
                  </p>

                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("created", {
                      value: new Date(prediction.created_at).toLocaleString(),
                    })}
                  </p>
                </div>

                <Link
                  href={`/admin/native-task-risk/${prediction.prediction_id}`}
                  className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
                >
                  {t("viewDetail")}
                </Link>
              </div>

              {prediction.reason_summaries?.length > 0 ? (
                <div className="mt-4 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
                  <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    {t("explanationSummary")}
                  </p>

                  <div className="mt-3 space-y-2">
                    {prediction.reason_summaries.slice(0, 2).map((reason) => (
                      <div
                        key={`${prediction.prediction_id}-${reason.title}`}
                        className="rounded-xl bg-white p-3 dark:bg-neutral-950"
                      >
                        <p className="text-sm font-medium text-neutral-950 dark:text-neutral-50">
                          {reason.title}
                        </p>

                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
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
