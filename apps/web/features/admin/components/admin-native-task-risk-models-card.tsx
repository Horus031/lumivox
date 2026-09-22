import { useTranslations } from "next-intl";

type NativeTaskRiskModelVersion = {
  model_version_id: string;
  model_key: string;
  version: string;
  algorithm: string;
  training_dataset: string;
  artifact_path: string;
  metrics: Record<string, unknown>;
  feature_schema: Record<string, unknown>;
  explainability_metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Props = {
  models: NativeTaskRiskModelVersion[];
};

function metricValue(metrics: Record<string, unknown>, key: string) {
  const value = metrics?.[key];

  if (typeof value === "number") {
    return value.toFixed(4);
  }

  return value ? String(value) : null;
}

export function AdminNativeTaskRiskModelsCard({ models }: Props) {
  const t = useTranslations("admin.nativeTaskRisk.models");

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

      {models.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {models.map((model) => (
            <article
              key={model.model_version_id}
              className="rounded-2xl border p-4 dark:border-neutral-800"
            >
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {model.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {t("active")}
                      </span>
                    ) : null}

                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                      {model.algorithm}
                    </span>
                  </div>

                  <h3 className="mt-3 text-lg font-bold text-neutral-950 dark:text-neutral-50">
                    {model.version}
                  </h3>

                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {model.training_dataset}
                  </p>

                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("artifact", { path: model.artifact_path })}
                  </p>
                </div>

                <div className="grid min-w-[280px] grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <p className="text-xs text-neutral-500">
                      {t("metricLabels.recall")}
                    </p>
                    <p className="font-semibold">
                      {metricValue(model.metrics, "recall") ?? t("notAvailable")}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <p className="text-xs text-neutral-500">
                      {t("metricLabels.precision")}
                    </p>
                    <p className="font-semibold">
                      {metricValue(model.metrics, "precision") ??
                        t("notAvailable")}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <p className="text-xs text-neutral-500">
                      {t("metricLabels.f1")}
                    </p>
                    <p className="font-semibold">
                      {metricValue(model.metrics, "f1_score") ??
                        t("notAvailable")}
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                    <p className="text-xs text-neutral-500">
                      {t("metricLabels.rocAuc")}
                    </p>
                    <p className="font-semibold">
                      {metricValue(model.metrics, "roc_auc") ??
                        t("notAvailable")}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
