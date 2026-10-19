import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
import { logFocusV2DistractionAction as log } from "./focus-v2-distractions.actions";

const sessionId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const valid = { sessionId, distractionType: "other" as const, durationSeconds: 30, note: "User confirmed." };
let query: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
  query = {};
  for (const key of ["from", "select", "eq", "in"]) query[key] = vi.fn(() => query);
  query.maybeSingle = vi.fn()
    .mockResolvedValueOnce({ data: { id: sessionId }, error: null })
    .mockResolvedValueOnce({ data: { id: "segment" }, error: null });
  query.insert = vi.fn().mockResolvedValue({ error: null });
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: query });
});
afterEach(() => vi.unstubAllEnvs());

describe("Focus V2 manual distraction action", () => {
  it("does not call auth/database when feature flag is off", async () => {
    vi.stubEnv("FOCUS_V2_ENABLED", "false");
    expect((await log(valid)).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("rejects malformed input before auth", async () => {
    expect((await log({ ...valid, durationSeconds: -1 })).success).toBe(false);
    expect((await log({ ...valid, sessionId: "not-a-uuid" })).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("verifies ownership, mode, active focus segment and inserts exactly once", async () => {
    expect((await log(valid)).success).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.eq).toHaveBeenCalledWith("session_mode", "pomodoro");
    expect(query.eq).toHaveBeenCalledWith("segment_kind", "focus");
    expect(query.in).toHaveBeenCalledWith("status", ["ongoing", "paused"]);
    expect(query.in).toHaveBeenCalledWith("status", ["running", "paused"]);
    expect(query.insert).toHaveBeenCalledExactlyOnceWith({
      user_id: userId, session_id: sessionId, distraction_type: "other",
      duration_seconds: 30, note: "User confirmed.",
    });
  });
  it("rejects another user's, missing or ended session without writing", async () => {
    query.maybeSingle.mockReset().mockResolvedValueOnce({ data: null, error: null });
    expect((await log(valid)).success).toBe(false);
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("rejects a break or awaiting-next session without writing", async () => {
    query.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: sessionId }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect((await log(valid)).success).toBe(false);
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("does not falsely report success on insert error", async () => {
    query.insert.mockResolvedValue({ error: { message: "database unavailable" } });
    expect((await log(valid)).success).toBe(false);
  });
});
