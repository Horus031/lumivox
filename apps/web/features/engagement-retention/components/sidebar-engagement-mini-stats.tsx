"use client";

import type { UserEngagementStats } from "@/features/engagement-retention/engagement-retention.types";
import { createClient } from "@/lib/supabase/client";
import { Coins, Flame } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("appShell.engagement");
  const [engageStats, setEngageStats] = useState(stats);
  const supabase = createClient();

  useEffect(() => {
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
          setEngageStats(payload.new as UserEngagementStats);
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
        {t("empty")}
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
          {t("status", {
            status: t(`statuses.${engageStats.streak_status}`),
          })}
        </p>
      </div>

      <div className="mt-3 gap-2 text-xs">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-secondary">
            <Flame
              className="size-3.5"
              style={{ color: "var(--streak-fire)" }}
            />
            {t("streak")}
          </span>
          <span className="font-mono font-semibold">
            {engageStats.current_streak_days}{" "}
            {engageStats.current_streak_days === 1 ? t("day") : t("days")}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-secondary">
            <Coins
              className="size-3.5"
              style={{ color: "var(--token-gold)" }}
            />
            {t("tokens")}
          </span>
          <span className="font-mono font-semibold">
            {engageStats.token_balance}
          </span>
        </div>
      </div>
    </div>
  );
}
