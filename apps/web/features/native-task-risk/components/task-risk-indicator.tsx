import { AlertTriangle, Clock3, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { NativeTaskRiskBand } from "../native-task-risk.types";
import type { TaskRiskViewState } from "../task-risk-presentation.types";

type TaskRiskIndicatorProps = {
  state: TaskRiskViewState;
  className?: string;
};

const BAND_CLASSES: Record<NativeTaskRiskBand, string> = {
  high: "border-danger/40 bg-danger/10 text-foreground",
  elevated: "border-warning/50 bg-warning/15 text-foreground",
  moderate: "border-warning/30 bg-warning/5 text-foreground",
  low: "border-border bg-muted text-secondary-text",
};

const BASE_CLASS =
  "inline-flex max-w-full items-center gap-1.5 rounded-md " +
  "border px-2 py-1 text-caption font-semibold";

export function TaskRiskIndicator({ state, className }: TaskRiskIndicatorProps) {
  const t = useTranslations("taskRiskRecovery");

  if (state.status === "ineligible" || state.status === "unavailable") {
    return null;
  }

  if (state.status === "loading") {
    return (
      <span
        data-task-risk-indicator="loading"
        className={cn(BASE_CLASS, "border-border bg-muted text-muted-foreground", className)}
      >
        <LoaderCircle aria-hidden="true" className="size-icon-sm animate-spin" />
        {t("status.loading")}
      </span>
    );
  }

  if (state.status === "stale") {
    return (
      <span
        data-task-risk-indicator="stale"
        className={cn(BASE_CLASS, "border-border bg-muted text-secondary-text", className)}
      >
        <Clock3 aria-hidden="true" className="size-icon-sm" />
        {t("status.stale")}
      </span>
    );
  }

  const band = state.alert.risk_band;

  if (band === "low") {
    return null;
  }

  return (
    <span data-task-risk-indicator={band} className={cn(BASE_CLASS, BAND_CLASSES[band], className)}>
      <AlertTriangle aria-hidden="true" className="size-icon-sm shrink-0" />
      {t(`status.${band}`)}
    </span>
  );
}
