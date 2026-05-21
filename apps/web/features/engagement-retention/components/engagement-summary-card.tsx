import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { RefreshEngagementButton } from "@/features/engagement-retention/components/refresh-engagement-button";

type EngagementSummaryCardProps = {
  stats: UserEngagementStats | null;
};

export function EngagementSummaryCard({
  stats,
}: EngagementSummaryCardProps) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-card/90 p-6 shadow-[0_18px_60px_-50px_hsl(var(--primary)/0.55)]">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-primary/70">
            Retention & Habit
          </p>

          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Engagement Summary
          </h2>

          <p className="mt-2 max-w-3xl text-muted-foreground">
            Track learning streaks and reward tokens earned from consistent
            focus and task completion.
          </p>
        </div>

        <RefreshEngagementButton />
      </div>

      {!stats ? (
        <div className="mt-6 rounded-[24px] border border-dashed border-border/70 p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">
            No engagement summary yet
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Refresh engagement to calculate streaks and reward tokens.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Current streak"
            value={`${stats.current_streak_days} day(s)`}
          />

          <MetricCard
            label="Longest streak"
            value={`${stats.longest_streak_days} day(s)`}
          />

          <MetricCard
            label="Token balance"
            value={`${stats.token_balance}`}
          />

          <MetricCard
            label="Tokens last 7 days"
            value={`${stats.tokens_earned_last_7d}`}
          />
        </div>
      )}
    </section>
  );
}

type MetricCardProps = {
  label: string;
  value: string;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-[24px] border border-border/70 bg-secondary/35 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}