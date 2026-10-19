import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));

import { getFocusV2Analytics } from "./focus-v2-analytics.queries";

const userId = "11111111-1111-4111-8111-111111111111";

function databaseMock(failTable?: string) {
  const accessed: Array<{ table: string; eqs: Array<[string, unknown]> }> = [];
  const db = {
    from(table: string) {
      const eqs: Array<[string, unknown]> = [];
      accessed.push({ table, eqs });
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { eqs.push([key, value]); return query; },
        gte() { return query; },
        lt() { return query; },
        in() { return query; },
        order() { return query; },
        async range() {
          if (failTable === table) return { data: null, error: { message: "test db failure" } };
          if (table === "focus_sessions") return { data: [{
            id: "a", task_id: "t1", session_mode: "legacy", status: "completed",
            planned_minutes: 30, actual_focus_minutes: 20, total_paused_seconds: 0,
            started_at: new Date().toISOString(),
          }], error: null };
          if (table === "reward_ledger") return { data: [{ id: "r1", token_delta: 4 }], error: null };
          if (table === "tasks") return { data: [{ id: "t1", title: "My task" }], error: null };
          return { data: [], error: null };
        },
        async maybeSingle() {
          return { data: { current_streak_days: 2, longest_streak_days: 4,
            token_balance: 7, completed_focus_sessions_total: 5 }, error: null };
        },
      };
      return query;
    },
  };
  return { db, accessed };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FOCUS_V2_ENABLED", "true");
});

describe("Focus V2 analytics RLS-backed query", () => {
  it("rejects disabled flag before accessing authentication", async () => {
    vi.stubEnv("FOCUS_V2_ENABLED", "false");
    await expect(getFocusV2Analytics()).rejects.toThrow("disabled");
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("reads all source tables in authenticated user context, without mutations", async () => {
    const { db, accessed } = databaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: db });
    const report = await getFocusV2Analytics(7);
    expect(report.focusSeconds).toBe(1200);
    expect(report.tasks[0]?.title).toBe("My task");
    expect(report.rewardsCount).toBe(1);
    expect(accessed.map(a => a.table)).toEqual(expect.arrayContaining([
      "focus_sessions", "distraction_events", "focus_session_segments",
      "user_engagement_stats", "reward_ledger", "tasks",
    ]));
    for (const entry of accessed.filter(a => a.table !== "focus_session_segments")) {
      expect(entry.eqs).toContainEqual(["user_id", userId]);
    }
  });
  it("throws on database errors rather than returning false zero totals", async () => {
    const { db } = databaseMock("focus_sessions");
    mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: db });
    await expect(getFocusV2Analytics()).rejects.toThrow("test db failure");
  });
});
