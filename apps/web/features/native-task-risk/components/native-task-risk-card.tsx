import type {
  NativeTaskRiskAssessmentWithTask,
  NativeTaskRiskEvidenceItem,
} from "@/features/native-task-risk/native-task-risk.types";

import { GenerateNativeTaskInsightButton } from "@/features/native-task-risk/components/generate-native-task-insight-button";

type NativeTaskRiskCardProps = {
  assessment: NativeTaskRiskAssessmentWithTask;
};

function getRiskBadgeClass(band: "low" | "moderate" | "elevated" | "high") {
  if (band === "high") {
    return "bg-red-100 text-red-800";
  }

  if (band === "elevated") {
    return "bg-amber-100 text-amber-800";
  }

  if (band === "moderate") {
    return "bg-yellow-100 text-yellow-800";
  }

  return "bg-emerald-100 text-emerald-800";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "No due date";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function NativeTaskRiskCard({ assessment }: NativeTaskRiskCardProps) {
  const evidence =
    (assessment.evidence_payload as NativeTaskRiskEvidenceItem[]) ?? [];

  const task = assessment.tasks;

  return (
    <article className="rounded-[28px] border border-border/70 bg-card/90 p-5 shadow-[0_16px_50px_-45px_hsl(var(--primary)/0.6)]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getRiskBadgeClass(
                assessment.risk_band,
              )}`}
            >
              {assessment.risk_band} risk
            </span>

            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
              Native risk v1
            </span>
          </div>

          <h3 className="text-xl font-semibold text-foreground">{task?.title ?? "Unknown task"}</h3>

          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>Due: {formatDate(task?.due_at)}</p>
            <p className="capitalize">
              Priority: {task?.priority ?? "unknown"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-secondary/35 px-5 py-4 text-left md:text-right">
          <p className="text-sm font-medium text-muted-foreground">Risk score</p>
          <p className="mt-1 text-4xl font-semibold tracking-tight text-foreground">
            {Number(assessment.risk_score).toFixed(1)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">/ 100</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MiniMetric
          label="Deadline"
          value={assessment.deadline_pressure_score}
        />
        <MiniMetric
          label="Priority"
          value={assessment.priority_pressure_score}
        />
        <MiniMetric
          label="Focus Neglect"
          value={assessment.focus_neglect_score}
        />
        <MiniMetric
          label="History"
          value={assessment.deadline_reliability_risk_score}
        />
        <MiniMetric
          label="Workload"
          value={assessment.workload_pressure_score}
        />
      </div>

      {assessment.id && (
        <div className="mt-5">
          <GenerateNativeTaskInsightButton assessmentId={assessment.id} />
        </div>
      )}

      <details className="group mt-5 rounded-2xl border border-border/70 bg-secondary/20 p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 outline-none">
          <div>
            <h4 className="font-semibold text-foreground">Why this task was flagged</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Deadline pressure, priority, workload, and focus signals.
            </p>
          </div>

          <span className="rounded-full border border-border/70 bg-card/90 px-3 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-primary group-open:text-primary-foreground">
            Toggle
          </span>
        </summary>

        <div className="mt-4 space-y-3">
          {evidence.map((item) => (
            <div
              key={`${item.key}-${item.title}`}
              className="rounded-xl border border-border/70 bg-card/90 p-4"
            >
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.message}
              </p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

type MiniMetricProps = {
  label: string;
  value: number;
};

function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-lg font-bold">
        {Math.round(Number(value) * 100)}%
      </p>
    </div>
  );
}
