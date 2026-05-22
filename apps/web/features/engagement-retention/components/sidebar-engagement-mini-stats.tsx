import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";

type SidebarEngagementMiniStatsProps = {
  stats: UserEngagementStats | null;
};

function getStatusDotClass(status: string | null | undefined) {
  if (status === "active") {
    return "bg-emerald-500";
  }

  if (status === "frozen") {
    return "bg-amber-500";
  }

  return "bg-red-500";
}

export function SidebarEngagementMiniStats({
  stats,
}: SidebarEngagementMiniStatsProps) {
  if (!stats) {
    return (
      <div className="mt-3 rounded-xl border bg-neutral-50 p-3 text-xs text-neutral-600">
        Refresh engagement to see streak and tokens.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border bg-neutral-50 p-3">
      <div className="flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
            stats.streak_status,
          )}`}
        />

        <p className="text-xs font-semibold capitalize text-neutral-700">
          {stats.streak_status} streak
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-neutral-500">Streak</p>
          <p className="mt-1 font-bold text-neutral-900">
            {stats.current_streak_days}d
          </p>
        </div>

        <div>
          <p className="text-neutral-500">Tokens</p>
          <p className="mt-1 font-bold text-neutral-900">
            {stats.token_balance}
          </p>
        </div>
      </div>
    </div>
  );
}
