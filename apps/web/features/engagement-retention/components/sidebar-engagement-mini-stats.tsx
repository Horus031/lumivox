"use client";

import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { createClient } from "@/lib/supabase/client";
import { Coins, Flame } from "lucide-react";
import { useEffect, useState } from "react";

type SidebarEngagementMiniStatsProps = {
  userId: string | null;
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
  userId,
  stats,
}: SidebarEngagementMiniStatsProps) {
  console.log(userId, stats);
  const [engageStats, setEngageStats] = useState(stats);
  const supabase = createClient();

  useEffect(() => {
    // Lắng nghe xem khi nào dòng dữ liệu stats của User này thay đổi trong DB
    const channel = supabase
      .channel(`stats-changes-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "user_engagement_stats",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          // Khi background task tính xong và update DB, hàm này lập tức kích hoạt
          console.log("Streak cập nhật realtime:", payload.new);
          setEngageStats(payload.new as UserEngagementStats); // Cập nhật UI ngay lập tức!
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase]);

  if (!engageStats) {
    return (
      <div className="mt-3 rounded-xl border bg-neutral-50 p-3 text-xs text-neutral-600">
        Engagement stats will appear after your first valid study activity.
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border bg-background p-3">
      <div className="flex items-center gap-2">
        {engageStats.streak_status !== "lost" && (
          <span
            className={`h-2.5 w-2.5 rounded-full ${getStatusDotClass(
              engageStats.streak_status,
            )}`}
          />
        )}

        <p className="text-xs font-semibold capitalize text-foreground">
          {engageStats.streak_status} streak
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
            {engageStats.current_streak_days}{" "}
            {engageStats.current_streak_days == 1 ? "day" : "days"}
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
          <span className="font-mono font-semibold">
            {engageStats.token_balance}
          </span>
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
