import { Link } from "@/i18n/navigation";
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

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-105 overflow-auto rounded-2xl bg-neutral-950 p-4 text-xs leading-6 text-neutral-100">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

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

export default async function AdminNativeTaskRiskPredictionDetailPage({
  params,
}: PageProps) {
  const { predictionId } = await params;

  const prediction = await getAdminNativeTaskRiskPredictionDetail(predictionId);
  const attributions = toArray<NativeTaskRiskAttribution>(
    prediction.attributions
  );
  const t = await getTranslations("admin.nativeTaskRisk.detail");

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {t("eyebrow")}
            </p>

            <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950 dark:text-neutral-50">
              {prediction.task_title ?? prediction.task_id}
            </h1>

            <p className="mt-3 text-neutral-600 dark:text-neutral-400">
              {t("owner", {
                name: prediction.owner_name ?? t("unknownOwner"),
                email: prediction.owner_email ?? prediction.user_id,
              })}
            </p>
          </div>

          <Link
            href="/admin/native-task-risk"
            className="rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            {t("back")}
          </Link>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${bandClass(
              prediction.risk_band
            )}`}
          >
            {t(`riskBands.${prediction.risk_band}`)}
          </span>

          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {t("probability", {
              value: Math.round(Number(prediction.risk_probability) * 100),
            })}
          </span>

          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {t("threshold", { value: prediction.decision_threshold })}
          </span>

          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            {prediction.algorithm}
          </span>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
            {t("attributionsTitle")}
          </h2>

          <div className="mt-4 space-y-3">
            {attributions.map(
              (item) => (
                <div
                  key={`${item.feature_name}-${item.rank}`}
                  className="rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900"
                >
                  <div className="flex justify-between gap-4">
                    <p className="font-medium text-neutral-950 dark:text-neutral-50">
                      {item.rank}. {item.feature_name}
                    </p>

                    <span className="text-sm text-neutral-500">
                      {item.effect}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
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

        <div className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
            {t("modelMetricsTitle")}
          </h2>

          <div className="mt-4">
            <JsonBlock value={prediction.model_metrics} />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("featurePayloadTitle")}
        </h2>

        <div className="mt-4">
          <JsonBlock value={prediction.feature_payload} />
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        <h2 className="text-xl font-bold text-neutral-950 dark:text-neutral-50">
          {t("predictionMetadataTitle")}
        </h2>

        <div className="mt-4">
          <JsonBlock value={prediction.prediction_metadata} />
        </div>
      </section>
    </main>
  );
}
