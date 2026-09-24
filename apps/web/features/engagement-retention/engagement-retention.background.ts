import { after } from "next/server";

import {
  invalidateEngagementCache,
  processEngagementActivityForUser,
  recalculateEngagementForUser,
} from "@/features/engagement-retention/engagement-retention.server";

type EngagementRecalculationSource =
  | "focus-completion"
  | "task-update"
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

// Preserve completion ordering within a warm server instance while keeping the
// user-facing request non-blocking. Cross-instance correctness is enforced by
// the atomic Postgres engagement RPC, so this queue is only a local ordering
// optimization.
const userEngagementQueues = new Map<string, Promise<void>>();

function enqueueUserEngagementWork(
  userId: string,
  work: () => Promise<void>,
): Promise<void> {
  const previous = userEngagementQueues.get(userId) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(work)
    .finally(() => {
      if (userEngagementQueues.get(userId) === next) {
        userEngagementQueues.delete(userId);
      }
    });

  userEngagementQueues.set(userId, next);

  return next;
}

export function scheduleEngagementRecalculation({
  userId,
  source,
  activity,
}: ScheduleEngagementRecalculationOptions) {
  after(() =>
    enqueueUserEngagementWork(userId, async () => {
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
    }),
  );
}
