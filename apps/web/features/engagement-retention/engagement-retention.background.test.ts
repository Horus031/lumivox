import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  invalidateEngagementCache: vi.fn(),
  recalculateEngagementForUser: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: mocks.after,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock(
  "@/features/engagement-retention/engagement-retention.server",
  () => ({
    invalidateEngagementCache: mocks.invalidateEngagementCache,
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
    mocks.recalculateEngagementForUser.mockResolvedValue({});
  });

  it("defers recalculation until the after callback runs", async () => {
    scheduleEngagementRecalculation({
      userId: "user-1",
      source: "focus-completion",
    });

    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.invalidateEngagementCache).not.toHaveBeenCalled();
    expect(mocks.recalculateEngagementForUser).not.toHaveBeenCalled();

    await scheduledTask?.();

    expect(mocks.invalidateEngagementCache).toHaveBeenCalledWith("user-1");
    expect(mocks.recalculateEngagementForUser).toHaveBeenCalledWith("user-1");
    expect(
      mocks.invalidateEngagementCache.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.recalculateEngagementForUser.mock.invocationCallOrder[0],
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("contains background failures", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.recalculateEngagementForUser.mockRejectedValue(
      new Error("API unavailable"),
    );

    scheduleEngagementRecalculation({
      userId: "user-2",
      source: "task-update",
    });

    await expect(scheduledTask?.()).resolves.toBeUndefined();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      "[Engagement] Deferred recalculation failed after task-update:",
      expect.any(Error),
    );

    consoleError.mockRestore();
  });
});
