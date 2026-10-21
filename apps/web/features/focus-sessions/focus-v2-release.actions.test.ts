import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOCUS_V2_CONFIG } from "./focus-v2-config.schemas";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), fetchApi: vi.fn(), loadSnapshot: vi.fn(), schedule: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/ai-api/fetch-ai-api", () => ({
  fetchAiApi: mocks.fetchApi,
  AiApiError: class AiApiError extends Error {
    constructor(message: string, public status: number, public requestId: string) {
      super(message);
    }
  },
}));
vi.mock("@/features/engagement-retention/engagement-retention.background", () => ({
  scheduleEngagementRecalculation: mocks.schedule,
}));
vi.mock("./focus-v2.queries", () => ({ getFocusV2Snapshot: mocks.loadSnapshot }));

import {
  createFocusV2SessionAction,
  loadFocusV2SnapshotAction,
  transitionFocusV2Action,
} from "./focus-v2.actions";

const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  vi.stubEnv("FOCUS_V2_CREATION_ENABLED", "false");
  mocks.requireUser.mockResolvedValue({ user: { id: userId } });
});
afterEach(() => vi.unstubAllEnvs());

describe("Phase 9 drain-mode server-side enforcement", () => {
  it("rejects creation before authentication or privileged backend access", async () => {
    expect((await createFocusV2SessionAction(DEFAULT_FOCUS_V2_CONFIG)).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.fetchApi).not.toHaveBeenCalled();
  });

  it("continues to load a previously created Pomodoro parent via RLS", async () => {
    mocks.loadSnapshot.mockResolvedValue({ session: { id: sessionId } });
    const result = await loadFocusV2SnapshotAction(sessionId);
    expect(result.success).toBe(true);
    expect(mocks.loadSnapshot).toHaveBeenCalledWith(sessionId);
  });

  it("permits pause/resume/cancel transitions of existing sessions", async () => {
    mocks.fetchApi.mockResolvedValue({
      parentStatus: "paused", segmentId, nextSegmentId: null, parentCompleted: false,
    });
    const result = await transitionFocusV2Action({
      sessionId, action: "pause", expectedSegmentId: segmentId,
    });
    expect(result.success).toBe(true);
    expect(mocks.fetchApi).toHaveBeenCalledWith(expect.objectContaining({
      path: "/api/v1/focus-v2/transition", retries: 0,
      body: expect.objectContaining({ user_id: userId, session_id: sessionId, action: "pause" }),
    }));
  });

  it("hard-off blocks transitions (only allowed when all sessions drained)", async () => {
    vi.stubEnv("FOCUS_V2_ENABLED", "false");
    const result = await transitionFocusV2Action({
      sessionId, action: "cancel", expectedSegmentId: segmentId,
    });
    expect(result.success).toBe(false);
    expect(mocks.fetchApi).not.toHaveBeenCalled();
  });
});
