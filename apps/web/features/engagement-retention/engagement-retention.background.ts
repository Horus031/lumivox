import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  invalidateEngagementCache,
  recalculateEngagementForUser,
} from "@/features/engagement-retention/engagement-retention.server";

type EngagementRecalculationSource = "focus-completion" | "task-update";

type ScheduleEngagementRecalculationOptions = {
  userId: string;
  source: EngagementRecalculationSource;
};

export function scheduleEngagementRecalculation({
  userId,
  source,
}: ScheduleEngagementRecalculationOptions) {
  after(async () => {
    try {
      await invalidateEngagementCache(userId);
      await recalculateEngagementForUser(userId);

      revalidatePath("/dashboard");
      revalidatePath("/settings");
      revalidatePath("/", "layout");
    } catch (error) {
      console.error(
        `[Engagement] Deferred recalculation failed after ${source}:`,
        error,
      );
    }
  });
}
