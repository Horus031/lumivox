import Link from "next/link";

import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";

type FrozenStreakAlertProps = {
  stats: UserEngagementStats | null;
};

function formatDeadline(value: string | null) {
  if (!value) return "soon";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FrozenStreakAlert({ stats }: FrozenStreakAlertProps) {
  if (!stats || stats.streak_status !== "frozen") {
    return null;
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
            Streak Frozen
          </p>

          <h2 className="mt-1 text-xl font-bold text-amber-950">
            Your study streak is at risk
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900">
            You missed a valid study activity day, but your streak can still be
            restored using tokens before{" "}
            <span className="font-semibold">
              {formatDeadline(stats.streak_restore_deadline_at)}
            </span>
            .
          </p>
        </div>

        <Link
          href="#engagement-summary"
          className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
        >
          Restore now
        </Link>
      </div>
    </section>
  );
}