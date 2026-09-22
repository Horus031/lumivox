import { after } from "next/server";

import {
  invalidateEngagementCache,
  processEngagementActivityForUser,
  recalculateEngagementForUser,
} from "@/features/engagement-retention/engagement-retention.server";

type EngagementRecalculationSource =
  | "focus-completion"
  | "task-update"
  | "stale-read"
  | "manual-refresh";

export type EngagementActivity = {
  type: "focus_session" | "task";
  id: string;
};

type ScheduleEngagementRecalculationOptions = {
  userId: string;
  source: EngagementRecalculationSource;
  activity?: EngagementActivity;
};

export function scheduleEngagementRecalculation({
  userId,
  source,
  activity,
}: ScheduleEngagementRecalculationOptions) {
  after(async () => {
    try {
      await invalidateEngagementCache(userId);

      if (activity) {
        await processEngagementActivityForUser(userId, activity);
      } else {
        await recalculateEngagementForUser(userId);
      }
    } catch (error) {
      console.error(
        `[Engagement] Deferred recalculation failed after ${source}:`,
        error,
      );
    }
  });
}
