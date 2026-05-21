import type {
  NativeTaskRiskAssessmentWithTask,
} from "@/features/native-task-risk/native-task-risk.types";

import { NativeTaskRiskCard } from "@/features/native-task-risk/components/native-task-risk-card";
import { RefreshNativeRiskButton } from "@/features/native-task-risk/components/refresh-native-risk-button";

type NativeTaskRiskSectionProps = {
  assessments: NativeTaskRiskAssessmentWithTask[];
};

export function NativeTaskRiskSection({
  assessments,
}: NativeTaskRiskSectionProps) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-4 rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)] md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary/70">
            Product-native intelligence
          </p>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Upcoming Task Risk Scan
          </h2>

          <p className="mt-2 max-w-3xl text-muted-foreground">
            A Lumivox-native risk score based on your real task deadlines,
            focus activity, recent reliability history, and workload pressure.
          </p>
        </div>

        <RefreshNativeRiskButton />
      </div>

      {assessments.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border/70 bg-card/80 p-10 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            No native task risk assessments yet
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Run the risk scan to evaluate open tasks that are approaching
            their deadlines.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {assessments.map((assessment) => (
            <NativeTaskRiskCard
              key={assessment.id}
              assessment={assessment}
            />
          ))}
        </div>
      )}
    </section>
  );
}