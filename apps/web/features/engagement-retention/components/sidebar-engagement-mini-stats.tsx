import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { Coins, Flame } from "lucide-react";

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
        Engagement stats will appear after your first valid study activity.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2">
        {stats.streak_status !== "lost" && (
          <span
            className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
              stats.streak_status,
            )}`}
          />
        )}

        <p className="text-xs font-semibold capitalize text-foreground">
          {stats.streak_status} streak
        </p>
      </div>

      <div className="mt-3 gap-2 text-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-secondary">
            <Flame
              className="size-3.5"
              style={{ color: "var(--streak-fire)" }}
            />
            Streak
          </span>
          <span className="font-mono font-semibold">
            {stats.current_streak_days}{" "}
            {stats.current_streak_days == 1 ? "day" : "days"}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs mt-2">
          <span className="flex items-center gap-1.5 text-secondary">
            <Coins
              className="size-3.5"
              style={{ color: "var(--token-gold)" }}
            />
            Tokens
          </span>
          <span className="font-mono font-semibold">{stats.token_balance}</span>
        </div>
        {/* <div>
          <p className="text-neutral-500">Streak</p>
          <p className="mt-1 font-bold text-foreground">
            {stats.current_streak_days}d
          </p>
        </div>

        <div>
          <p className="text-neutral-500">Tokens</p>
          <p className="mt-1 font-bold text-foreground">
            {stats.token_balance}
          </p>
        </div> */}
      </div>
    </div>
  );
}
