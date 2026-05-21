type PbiSnapshot = {
  standard_pbi: number;
  personalized_pbi: number;
  task_completion_rate: number;
  focus_quality_score: number;
  deadline_adherence_score: number;
  goal_momentum_score: number;
  consistency_score: number;
  period_start: string;
  period_end: string;
};

type PbiScoreCardsProps = {
  snapshot: PbiSnapshot | null;
};

export function PbiScoreCards({ snapshot }: PbiScoreCardsProps) {
  if (!snapshot) {
    return (
      <div className="rounded-[28px] border border-dashed border-border/70 bg-card/80 p-10 text-center">
        <h3 className="text-lg font-semibold text-foreground">No PBI snapshot yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Generate your first PBI snapshot after creating tasks, goals,
          and focus sessions.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-[28px] border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-[0_22px_70px_-50px_hsl(var(--primary)/0.85)]">
          <p className="text-sm font-medium text-primary/80">
            Standard PBI
          </p>
          <p className="mt-3 text-5xl font-semibold tracking-tight text-foreground">
            {snapshot.standard_pbi}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fixed academic baseline weights.
          </p>
        </article>

        <article className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_22px_70px_-55px_hsl(var(--primary)/0.5)]">
          <p className="text-sm font-medium text-primary/80">
            Personalized PBI
          </p>
          <p className="mt-3 text-5xl font-semibold tracking-tight text-foreground">
            {snapshot.personalized_pbi}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Uses the user&apos;s onboarding/calibration weights.
          </p>
        </article>
      </div>

      <p className="text-sm text-muted-foreground">
        Snapshot period: {snapshot.period_start} → {snapshot.period_end}
      </p>
    </section>
  );
}