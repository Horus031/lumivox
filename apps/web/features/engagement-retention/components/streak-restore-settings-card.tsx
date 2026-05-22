import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { RestoreStreakButton } from "@/features/engagement-retention/components/restore-streak-button";

type StreakRestoreSettingsCardProps = {
  stats: UserEngagementStats | null;
};

function formatDeadline(value: string | null) {
  if (!value) return "Not available";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusClass(status: string | null | undefined) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (status === "frozen") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-red-50 text-red-700";
}

export function StreakRestoreSettingsCard({
  stats,
}: StreakRestoreSettingsCardProps) {
  const isFrozen = stats?.streak_status === "frozen";
  const hasEnoughTokens = Number(stats?.token_balance ?? 0) >= 30;
  const canRestore = isFrozen && hasEnoughTokens;

  return (
    <section
      id="streak-restore"
      className="scroll-mt-24 rounded-2xl border bg-white p-6 shadow-sm"
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">
            Streak Protection
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-tight">
            Restore your study streak
          </h2>

          <p className="mt-2 max-w-3xl text-neutral-600">
            If your streak becomes frozen after missing a valid study activity
            day, you can spend tokens to restore it before the restore window
            expires.
          </p>
        </div>
      </div>

      {!stats ? (
        <p className="mt-2 text-sm text-neutral-600">
          Your engagement status is being prepared. Complete a valid task or
          focus session, then revisit this page.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${getStatusClass(
                stats.streak_status,
              )}`}
            >
              {stats.streak_status} streak
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
              {stats.token_balance} tokens
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
              {stats.current_streak_days} day streak
            </span>
          </div>

          {isFrozen ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-semibold text-amber-950">
                Your streak is currently frozen.
              </p>

              <p className="mt-2 text-sm leading-6 text-amber-900">
                Restore deadline:{" "}
                <span className="font-semibold">
                  {formatDeadline(stats.streak_restore_deadline_at)}
                </span>
              </p>

              <p className="mt-2 text-sm leading-6 text-amber-900">
                Restore cost: <span className="font-semibold">30 tokens</span>.
                You currently have{" "}
                <span className="font-semibold">
                  {stats.token_balance} tokens
                </span>
                .
              </p>

              <div className="mt-4">
                <RestoreStreakButton disabled={!canRestore} />
              </div>

              {!hasEnoughTokens ? (
                <p className="mt-3 text-sm font-medium text-amber-950">
                  You do not have enough tokens to restore this streak.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="rounded-2xl border bg-neutral-50 p-5">
              <p className="font-semibold text-neutral-900">
                No restore action is needed.
              </p>

              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Your streak is currently{" "}
                <span className="font-semibold">{stats.streak_status}</span>.
                Restore is only available when a streak is frozen.
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <MiniMetric
              label="Current streak"
              value={`${stats.current_streak_days} day(s)`}
            />

            <MiniMetric
              label="Longest streak"
              value={`${stats.longest_streak_days} day(s)`}
            />

            <MiniMetric
              label="Tokens spent"
              value={`${stats.total_tokens_spent ?? 0}`}
            />
          </div>
        </div>
      )}
    </section>
  );
}

type MiniMetricProps = {
  label: string;
  value: string;
};

function MiniMetric({ label, value }: MiniMetricProps) {
  return (
    <div className="rounded-2xl border bg-neutral-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>

      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  );
}
