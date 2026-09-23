import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  invalidateEngagementCache: vi.fn(),
  processEngagementActivityForUser: vi.fn(),
  recalculateEngagementForUser: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock(
  "@/features/engagement-retention/engagement-retention.server",
  () => ({
    invalidateEngagementCache: mocks.invalidateEngagementCache,
    processEngagementActivityForUser: mocks.processEngagementActivityForUser,
    recalculateEngagementForUser: mocks.recalculateEngagementForUser,
  }),
);

import { scheduleEngagementRecalculation } from "./engagement-retention.background";

describe("scheduleEngagementRecalculation", () => {
  let scheduledTask: (() => Promise<void>) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduledTask = undefined;
    mocks.after.mockImplementation((task: () => Promise<void>) => {
      scheduledTask = task;
    });
    mocks.invalidateEngagementCache.mockResolvedValue(undefined);
    mocks.processEngagementActivityForUser.mockResolvedValue({});
    mocks.recalculateEngagementForUser.mockResolvedValue({});
  });

  it("uses the incremental fast path for a completion event", async () => {
    scheduleEngagementRecalculation({
      userId: "user-1",
      source: "focus-completion",
      activity: {
        type: "focus_session",
        id: "session-1",
      },
    });

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.processEngagementActivityForUser).not.toHaveBeenCalled();

    await scheduledTask?.();

    expect(mocks.invalidateEngagementCache).toHaveBeenCalledWith("user-1");
    expect(mocks.processEngagementActivityForUser).toHaveBeenCalledWith(
      "user-1",
      {
        type: "focus_session",
        id: "session-1",
      },
    );
    expect(mocks.recalculateEngagementForUser).not.toHaveBeenCalled();
  });

  it("keeps canonical recalculation as a deferred fallback", async () => {
    scheduleEngagementRecalculation({
      userId: "user-2",
      source: "task-update",
    });

    await scheduledTask?.();

    expect(mocks.recalculateEngagementForUser).toHaveBeenCalledWith("user-2");
    expect(mocks.processEngagementActivityForUser).not.toHaveBeenCalled();
  });


  it("reuses the short recalculation cache for stale page reads", async () => {
    scheduleEngagementRecalculation({
      userId: "user-stale",
      source: "stale-read",
    });

    await scheduledTask?.();

    expect(mocks.invalidateEngagementCache).not.toHaveBeenCalled();
    expect(mocks.recalculateEngagementForUser).toHaveBeenCalledWith(
      "user-stale",
    );
  });

  it("contains background failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.recalculateEngagementForUser.mockRejectedValue(
      new Error("API unavailable"),
    );

    scheduleEngagementRecalculation({
      userId: "user-3",
      source: "task-update",
    });

    await expect(scheduledTask?.()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(
      "[Engagement] Deferred recalculation failed after task-update:",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});
