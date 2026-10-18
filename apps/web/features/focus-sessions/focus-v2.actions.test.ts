import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOCUS_V2_CONFIG } from "./focus-v2-config.schemas";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), fetch: vi.fn(), schedule: vi.fn(), snapshot: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/ai-api/fetch-ai-api", () => ({
  fetchAiApi: mocks.fetch,
  AiApiError: class AiApiError extends Error {
    constructor(message: string, public status: number, public requestId: string) { super(message); }
  },
}));
vi.mock("@/features/engagement-retention/engagement-retention.background", () => ({ scheduleEngagementRecalculation: mocks.schedule }));
vi.mock("./focus-v2.queries", () => ({ getFocusV2Snapshot: mocks.snapshot }));

import { createFocusV2SessionAction, transitionFocusV2Action, loadFocusV2SnapshotAction } from "./focus-v2.actions";
const userId = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const segmentId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  mocks.auth.mockResolvedValue({ user: { id: userId } });
});

afterEach(() => vi.unstubAllEnvs());

describe("Focus V2 server actions", () => {
  it("never calls privileged backend when flag is off", async () => {
    vi.stubEnv("FOCUS_V2_ENABLED", "false");
    expect((await createFocusV2SessionAction(DEFAULT_FOCUS_V2_CONFIG)).success).toBe(false);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("validates configuration before making requests", async () => {
    const invalid = { ...DEFAULT_FOCUS_V2_CONFIG, focusMinutes: 999 };
    expect((await createFocusV2SessionAction(invalid)).success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("creates using server-verified identity, never client userId", async () => {
    mocks.fetch.mockResolvedValue({ session_id: sessionId });
    const result = await createFocusV2SessionAction(DEFAULT_FOCUS_V2_CONFIG);
    expect(result).toMatchObject({ success: true, data: { sessionId } });
    expect(mocks.fetch).toHaveBeenCalledWith(expect.objectContaining({
      path: "/api/v1/focus-v2/create", retries: 0,
      body: expect.objectContaining({ user_id: userId, task_id: null, focus_minutes: 25 }),
    }));
  });
  it("rejects transitions without segment identity", async () => {
    const result = await transitionFocusV2Action({ sessionId, action: "complete", expectedSegmentId: null });
    expect(result.success).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("triggers engagement only for confirmed final completion", async () => {
    mocks.fetch.mockResolvedValueOnce({ parentStatus: "ongoing", segmentId,
      nextSegmentId: sessionId, parentCompleted: false });
    expect((await transitionFocusV2Action({ sessionId, action: "complete", expectedSegmentId: segmentId })).success).toBe(true);
    expect(mocks.schedule).not.toHaveBeenCalled();
    mocks.fetch.mockResolvedValueOnce({ parentStatus: "completed", segmentId,
      nextSegmentId: null, parentCompleted: true });
    expect((await transitionFocusV2Action({ sessionId, action: "complete", expectedSegmentId: segmentId })).success).toBe(true);
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith({
      userId, source: "focus-completion", activity: { type: "focus_session", id: sessionId },
    });
  });
  it("maps stale conflict and prevents reward on failed completion", async () => {
    const { AiApiError } = await import("@/lib/ai-api/fetch-ai-api");
    mocks.fetch.mockRejectedValue(new AiApiError("conflict", 409, "ref"));
    const result = await transitionFocusV2Action({ sessionId, action: "complete", expectedSegmentId: segmentId });
    expect(result).toMatchObject({ success: false, message: "Session state changed. Please refresh." });
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("loads only through authenticated RLS query", async () => {
    mocks.snapshot.mockResolvedValue({ session: { id: sessionId } });
    expect((await loadFocusV2SnapshotAction(sessionId)).success).toBe(true);
    expect(mocks.snapshot).toHaveBeenCalledWith(sessionId);
  });
  it("rejects malformed snapshot identity", async () => {
    expect((await loadFocusV2SnapshotAction("wrong")).success).toBe(false);
    expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
