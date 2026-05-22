import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { RefreshEngagementButton } from "@/features/engagement-retention/components/refresh-engagement-button";
import { RestoreStreakButton } from "@/features/engagement-retention/components/restore-streak-button";

type EngagementSummaryCardProps = {
  stats: UserEngagementStats | null;
};

function getStreakStatusClass(status: string | null | undefined) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "frozen") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-red-50 text-red-700";
}

function formatDeadline(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EngagementSummaryCard({ stats }: EngagementSummaryCardProps) {
  const isFrozen = stats?.streak_status === "frozen";
  const canRestore =
    isFrozen &&
    Boolean(stats?.streak_restore_deadline_at) &&
    Number(stats?.token_balance ?? 0) >= 30;

  return (
    <section
      id="engagement-summary"
      className="scroll-mt-24 rounded-2xl border bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Retention & Habit
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Engagement Summary
          </h2>

          <p className="mt-2 max-w-3xl text-neutral-600">
            Track learning streaks, reward tokens, and whether your current
            streak is active, frozen, or lost.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isFrozen ? <RestoreStreakButton disabled={!canRestore} /> : null}

          <RefreshEngagementButton />
        </div>
      </div>

      {!stats ? (
        <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
          <h3 className="text-lg font-semibold">No engagement summary yet</h3>

          <p className="mt-2 text-sm text-neutral-600">
            Refresh engagement to calculate streaks and reward tokens.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStreakStatusClass(
                stats.streak_status,
              )}`}
            >
              {stats.streak_status} streak
            </span>

            {isFrozen ? (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Restore deadline:{" "}
                {formatDeadline(stats.streak_restore_deadline_at)}
              </span>
            ) : null}
          </div>

          {isFrozen ? (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                Your streak is frozen.
              </p>

              <p className="mt-2 text-sm leading-6 text-amber-800">
                You can spend <span className="font-semibold">30 tokens</span>{" "}
                to restore your streak before the restore window expires. You
                currently have{" "}
                <span className="font-semibold">
                  {stats.token_balance} tokens
                </span>
                .
              </p>

              {!canRestore ? (
                <p className="mt-2 text-sm font-medium text-amber-900">
                  You do not have enough tokens to restore this streak yet.
                </p>
              ) : null}
            </div>
          ) : null}

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

            <MetricCard
              label="Tokens spent"
              value={`${stats.total_tokens_spent ?? 0}`}
            />

            <MetricCard
              label="Valid focus sessions"
              value={`${stats.valid_focus_sessions_total ?? 0}`}
            />

            <MetricCard
              label="Valid completed tasks"
              value={`${stats.valid_completed_tasks_total ?? 0}`}
            />

            <MetricCard
              label="Last valid activity"
              value={stats.last_valid_activity_date ?? "None"}
            />
          </div>
        </>
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
    <div className="rounded-2xl border bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>

      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}
