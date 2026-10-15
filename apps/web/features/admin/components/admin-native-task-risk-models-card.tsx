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
    <section className="min-w-0 space-y-3 border-t border-border pt-card">
      <div>
        <p className="text-caption text-muted-foreground">
          {t("eyebrow")}
        </p>

        <h2 className="mt-1 text-section font-semibold text-foreground">
          {t("title")}
        </h2>
      </div>

      {models.length === 0 ? (
        <div className="py-section">
          <p className="text-body text-secondary-text">
            {t("empty")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {models.map((model) => (
            <article
              key={model.model_version_id}
              className="min-w-0 py-card"
            >
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0 [overflow-wrap:anywhere]">
                  <div className="flex flex-wrap items-center gap-2">
                    {model.is_active ? (
                      <span className="rounded-sm border border-success/25 bg-success/10 px-2 py-0.5 text-caption font-medium text-foreground">
                        {t("active")}
                      </span>
                    ) : null}

                    <span className="text-caption text-secondary-text">
                      {model.algorithm}
                    </span>
                  </div>

                  <h3 className="mt-2 text-section font-semibold text-foreground">
                    {model.version}
                  </h3>

                  <p className="mt-1 text-body text-secondary-text">
                    {model.training_dataset}
                  </p>

                  <p className="mt-2 text-caption text-muted-foreground">
                    {t("artifact", { path: model.artifact_path })}
                  </p>
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-3">
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-caption text-muted-foreground">
                      {t("metricLabels.recall")}
                    </p>
                    <p className="mt-1 text-body font-medium tabular-nums text-foreground">
                      {metricValue(model.metrics, "recall") ?? t("notAvailable")}
                    </p>
                  </div>

                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-caption text-muted-foreground">
                      {t("metricLabels.precision")}
                    </p>
                    <p className="mt-1 text-body font-medium tabular-nums text-foreground">
                      {metricValue(model.metrics, "precision") ??
                        t("notAvailable")}
                    </p>
                  </div>

                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-caption text-muted-foreground">
                      {t("metricLabels.f1")}
                    </p>
                    <p className="mt-1 text-body font-medium tabular-nums text-foreground">
                      {metricValue(model.metrics, "f1_score") ??
                        t("notAvailable")}
                    </p>
                  </div>

                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="text-caption text-muted-foreground">
                      {t("metricLabels.rocAuc")}
                    </p>
                    <p className="mt-1 text-body font-medium tabular-nums text-foreground">
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
