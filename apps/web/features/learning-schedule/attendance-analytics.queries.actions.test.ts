import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
import { getAttendanceSummaryAction } from "./attendance-analytics.queries.actions";

const scheduleId = "a1000000-0000-4000-8000-000000000001";
const userId = "owner-a";
const row = (i: number) => ({
  id: `session-${i}`,
  schedule_id: scheduleId,
  logical_occurrence_key: `key-${i}`,
  local_date: "2026-01-01",
  timezone: "UTC",
  scheduled_start_at: "2026-01-01T08:00:00Z",
  scheduled_end_at: "2026-01-01T09:00:00Z",
  status: "missed",
  completed_at: null,
});
type Row = Omit<ReturnType<typeof row>, "completed_at"> & { completed_at: string | null };
type Event = { id: string; session_id: string; event_type: string; created_at: string };
type Query = {
  table: string;
  filters: Record<string, unknown>;
  orders: string[];
  range?: [number, number];
  select?: unknown[];
};
type Result = { data: unknown; error: unknown; count?: number | null };
let rows: Row[];
let events: Event[];
let schedule: Result;
let queries: Query[];
let override: (q: Query, result: Result) => Result;
function client() {
  return {
    from: vi.fn((table: string) => {
      const q: Query = { table, filters: {}, orders: [] };
      queries.push(q);
      const builder = {
        select: (...args: unknown[]) => {
          q.select = args;
          return builder;
        },
        eq: (key: string, value: unknown) => {
          q.filters[key] = value;
          return builder;
        },
        in: (key: string, value: unknown) => {
          q.filters[key] = value;
          return builder;
        },
        order: (key: string) => {
          q.orders.push(key);
          return builder;
        },
        range: (from: number, to: number) => {
          q.range = [from, to];
          return builder;
        },
        maybeSingle: () => builder,
        then: (resolve: (r: Result) => unknown) => {
          if (table === "task_study_schedules")
            return Promise.resolve(override(q, schedule)).then(resolve);
          const matching =
            table === "task_study_sessions"
              ? rows
              : events.filter((e) => (q.filters.session_id as string[]).includes(e.session_id));
          const [from, to] = q.range!;
          return Promise.resolve(
            override(q, {
              data: matching.slice(from, to + 1),
              count: matching.length,
              error: null,
            }),
          ).then(resolve);
        },
      };
      return builder;
    }),
  };
}
const call = () => getAttendanceSummaryAction({ scheduleId });
const incomplete = { success: false, code: "incompleteData" };
const failed = { success: false, code: "loadFailed" };
beforeEach(() => {
  vi.clearAllMocks();
  rows = [];
  events = [];
  queries = [];
  schedule = { data: { id: scheduleId }, error: null };
  override = (_q, r) => r;
  auth.requireUser.mockResolvedValue({ supabase: client(), user: { id: userId } });
});
describe("owner-scoped attendance read action", () => {
  it.each([{}, { scheduleId: "invalid" }, { scheduleId, userId: "injected" }])(
    "rejects invalid/extra input before Auth: %j",
    async (input) => {
      expect(await getAttendanceSummaryAction(input)).toEqual({
        success: false,
        code: "invalidInput",
      });
      expect(auth.requireUser).not.toHaveBeenCalled();
    },
  );
  it("returns a safe failure when unauthenticated", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthenticated"));
    expect(await call()).toEqual(failed);
    expect(queries).toHaveLength(0);
  });
  it("denies an invisible User B schedule without reading sessions", async () => {
    schedule.data = null;
    expect(await call()).toEqual({ success: false, code: "notAuthorized" });
    expect(queries.map((q) => q.table)).toEqual(["task_study_schedules"]);
  });
  it("returns N/A for an empty schedule and application clock provenance", async () => {
    const before = Date.now();
    const result = await call();
    expect(result).toMatchObject({
      success: true,
      source: "application-server",
      summary: {
        eligiblePlanned: 0,
        attendanceRate: null,
        onTimeRate: null,
        plannedCoverage: null,
      },
    });
    if (!result.success) throw new Error("expected success");
    expect(Date.parse(result.asOf)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(result.asOf)).toBeLessThanOrEqual(Date.now());
  });
  it("reads 501 equal-timestamp sessions with stable ID order, exact counts, owner filters and 50-ID audit chunks", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i));
    expect(await call()).toMatchObject({
      success: true,
      summary: { eligibleDue: 501, eligiblePlanned: 501 },
    });
    const pages = queries.filter((q) => q.table === "task_study_sessions");
    expect(pages.map((q) => q.range)).toEqual([
      [0, 499],
      [500, 999],
    ]);
    pages.forEach((q) => {
      expect(q.orders).toEqual(["scheduled_start_at", "id"]);
      expect(q.filters.schedule_id).toBe(scheduleId);
    });
    expect(queries.filter((q) => q.table === "task_study_session_events")).toHaveLength(11);
    queries.forEach((q) => expect(q.filters.user_id).toBe(userId));
    queries
      .filter((q) => q.table !== "task_study_schedules")
      .forEach((q) => expect(q.select?.[1]).toEqual({ count: "exact" }));
    // The only supplied client has read methods; no admin/service-role factory is mocked or used.
    expect(auth.requireUser).toHaveBeenCalledTimes(1);
  });
  it.each([499, 500, 1000, 20000])("reads the complete %i-session boundary", async (n) => {
    rows = Array.from({ length: n }, (_, i) => row(i));
    expect(await call()).toMatchObject({ success: true, summary: { eligiblePlanned: n } });
  });
  it("refuses more than 20,000 sessions", async () => {
    rows = Array.from({ length: 20001 }, (_, i) => row(i));
    expect(await call()).toEqual(incomplete);
  });
  it.each(["2025-12-31T08:00:00Z", "2026-01-01T08:30:00Z"])(
    "uses cancellation audit created_at %s",
    async (created_at) => {
      rows = [{ ...row(1), status: "cancelled" }];
      events = [{ id: "event-1", session_id: rows[0].id, event_type: "cancelled", created_at }];
      expect(await call()).toMatchObject({
        success: true,
        summary: {
          eligibleDue: created_at.startsWith("2025") ? 0 : 1,
        },
      });
    },
  );
  it("refuses missing cancellation audit", async () => {
    rows = [{ ...row(1), status: "cancelled" }];
    expect(await call()).toEqual(incomplete);
  });
  it("refuses duplicate cancellation audit", async () => {
    rows = [{ ...row(1), status: "cancelled" }];
    events = [1, 2].map((i) => ({
      id: `event-${i}`,
      session_id: rows[0].id,
      event_type: "cancelled",
      created_at: "2025-12-31T08:00:00Z",
    }));
    expect(await call()).toEqual(incomplete);
  });
  it("refuses cancellation arriving after a noncancelled session read", async () => {
    rows = [row(1)];
    events = [
      {
        id: "e",
        session_id: rows[0].id,
        event_type: "cancelled",
        created_at: "2025-12-31T08:00:00Z",
      },
    ];
    expect(await call()).toEqual(incomplete);
  });
  it.each(["task_study_schedules", "task_study_sessions", "task_study_session_events"])(
    "refuses query errors in %s",
    async (table) => {
      rows = [row(1)];
      override = (q, r) => (q.table === table ? { ...r, error: { message: "offline" } } : r);
      expect(await call()).toEqual(failed);
    },
  );
  it("never returns a partial summary after the second session page fails", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i));
    override = (q, r) =>
      q.table === "task_study_sessions" && q.range?.[0] === 500 ? { ...r, error: {} } : r;
    expect(await call()).toEqual(failed);
  });
  it.each(["task_study_sessions", "task_study_session_events"])(
    "detects truncated %s despite a short page",
    async (table) => {
      rows = [{ ...row(1), status: "cancelled" }];
      events = [
        {
          id: "e",
          session_id: rows[0].id,
          event_type: "cancelled",
          created_at: "2025-12-31T08:00:00Z",
        },
      ];
      override = (q, r) => (q.table === table ? { ...r, data: [] } : r);
      expect(await call()).toEqual(incomplete);
    },
  );
  it.each(["task_study_sessions", "task_study_session_events"])(
    "fails closed if %s exact count is unavailable",
    async (table) => {
      rows = [row(1)];
      override = (q, r) => (q.table === table ? { ...r, count: null } : r);
      expect(await call()).toEqual(incomplete);
    },
  );
  it("detects cardinality changes between session pages", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i));
    override = (q, r) =>
      q.table === "task_study_sessions" && q.range?.[0] === 500 ? { ...r, count: 502 } : r;
    expect(await call()).toEqual(incomplete);
  });
  it("detects a repeated session ID after an offset shift", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i));
    rows[500] = { ...rows[0] };
    expect(await call()).toEqual(incomplete);
  });
  it("rejects ambiguous logical keys", async () => {
    rows = [row(1), { ...row(2), logical_occurrence_key: row(1).logical_occurrence_key }];
    expect(await call()).toEqual(incomplete);
  });
  it("rejects an unsupported persisted status without a type assertion", async () => {
    rows = [{ ...row(1), status: "unknown" }];
    expect(await call()).toEqual(incomplete);
  });
  it("rejects oversized duplicate audit history without returning a partial summary", async () => {
    // A chunk contains at most 50 sessions; 501 cancellation audits are ambiguous.
    rows = Array.from({ length: 50 }, (_, i) => ({ ...row(i), status: "cancelled" }));
    events = Array.from({ length: 501 }, (_, i) => ({
      id: `e-${i}`,
      session_id: row(i % 50).id,
      event_type: "cancelled",
      created_at: "2025-12-31T08:00:00Z",
    }));
    expect(await call()).toEqual(incomplete);
    // Duplicate audits make this dataset inconsistent already in page 1.
    expect(queries.find((q) => q.table === "task_study_session_events")?.range).toEqual([0, 499]);
  });
});
