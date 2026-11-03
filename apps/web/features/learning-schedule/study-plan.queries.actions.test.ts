import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
import { getStudyPlanAction } from "./study-plan.queries.actions";
const uuid = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = (i: number) => ({ id: uuid(i), task_id: uuid(100001 + i % 2), schedule_id: uuid(200001 + i % 2), logical_occurrence_key: `key-${i}`,
  local_date: "2026-11-02", local_start_time: "19:00:00", local_end_time: "20:00:00", timezone: "UTC", scheduled_start_at: "2026-11-02T19:00:00Z",
  scheduled_end_at: "2026-11-02T20:00:00Z", status: "missed", completed_at: null as string | null });
type Event = { id: string; session_id: string; created_at: string };
type Query = { table: string; filters: Record<string, unknown>; orders: string[]; range?: [number, number]; select?: unknown[] };
type Result = { data: unknown; error: unknown; count?: number | null };
let rows: ReturnType<typeof row>[], events: Event[], queries: Query[], override: (q: Query, r: Result) => Result;
const failed = { success: false, code: "loadFailed" }, incomplete = { success: false, code: "incompleteData" };
function client() {
  return { from: (table: string) => {
    const q: Query = { table, filters: {}, orders: [] }; queries.push(q);
    const b = {
      select: (...a: unknown[]) => { q.select = a; return b; }, eq: (k: string, v: unknown) => { q.filters[k] = v; return b; },
      in: (k: string, v: unknown) => { q.filters[k] = v; return b; }, order: (k: string) => { q.orders.push(k); return b; },
      range: (f: number, t: number) => { q.range = [f, t]; return b; },
      then: (resolve: (r: Result) => unknown) => {
        const data = table === "task_study_sessions" ? rows : table === "tasks" ? [...new Set(rows.map(r => r.task_id))]
          .filter(id => (q.filters.id as string[]).includes(id)).map(id => ({ id, title: `Task ${id}` })) : events.filter(e => (q.filters.session_id as string[]).includes(e.session_id));
        const [f, t] = q.range!; return Promise.resolve(override(q, { data: data.slice(f, t + 1), error: null, count: data.length })).then(resolve);
      },
    }; return b;
  } };
}
const call = (month = "2026-11") => getStudyPlanAction({ month });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-03T01:00:00Z")); vi.clearAllMocks(); rows = []; events = []; queries = []; override = (_q, r) => r;
  auth.requireUser.mockResolvedValue({ supabase: client(), user: { id: "owner" } }); });
afterEach(() => vi.useRealTimers());
describe("Study Planner owner-scoped action", () => {
  it.each([{}, { month: "2026-13" }, { month: "2026-1" }, { month: "2026-11", userId: "b" }])("rejects invalid input before Auth %j", async input => {
    expect(await getStudyPlanAction(input)).toEqual({ success: false, code: "invalidInput" }); expect(auth.requireUser).not.toHaveBeenCalled(); });
  it("handles unauthenticated user", async () => { auth.requireUser.mockRejectedValue(new Error("unauthenticated")); expect(await call()).toEqual(failed); });
  it("returns empty views and N/A", async () => { expect(await call()).toMatchObject({ success: true, today: [], calendar: [], summary: { attendanceRate: null, plannedCoverage: null } }); });
  it("reads 501 rows with exact counts, stable ordering, owner predicates and chunked lookups", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i)); expect(await call()).toMatchObject({ success: true, summary: { eligibleDue: 501 } });
    const pages = queries.filter(q => q.table === "task_study_sessions"); expect(pages.map(q => q.range)).toEqual([[0, 499], [500, 999]]);
    pages.forEach(q => expect(q.orders).toEqual(["scheduled_start_at", "id"])); expect(queries.filter(q => q.table === "task_study_session_events")).toHaveLength(11);
    queries.forEach(q => { expect(q.filters.user_id).toBe("owner"); expect(q.select?.[1]).toEqual({ count: "exact" }); });
  });
  it("loads Today across zones independently of chosen month", async () => {
    rows = [{ ...row(1), timezone: "America/New_York", scheduled_start_at: "2026-11-03T00:00:00Z", scheduled_end_at: "2026-11-03T01:00:00Z", status: "skipped" },
      { ...row(2), timezone: "Asia/Tokyo", local_date: "2026-11-03", scheduled_start_at: "2026-11-03T10:00:00Z", scheduled_end_at: "2026-11-03T11:00:00Z", status: "scheduled" }];
    const r = await call("2026-12"); if (!r.success) throw new Error(r.code);
    expect(r.today.map(s => s.id)).toEqual([uuid(1), uuid(2)]); expect(r.calendar).toEqual([]); expect(r.today[0].taskTitle).toContain("Task");
  });
  it("aggregates 1/1 plus 5/10 as 6/11, not a percentage average", async () => {
    rows = Array.from({ length: 11 }, (_, i) => ({ ...row(i), schedule_id: uuid(i === 0 ? 200001 : 200002), status: i < 6 ? "completed" : "missed", completed_at: i < 6 ? "2026-11-02T20:00:00Z" : null }));
    const r = await call(); if (!r.success) throw new Error(r.code); expect(r.summary.attendanceRate).toBeCloseTo(600 / 11); expect(r.summary.eligibleDue).toBe(11);
  });
  it("retains cancelled revision history while deduplicating eligible logical obligations", async () => {
    rows = [{ ...row(1), status: "cancelled" }, { ...row(2), schedule_id: row(1).schedule_id, logical_occurrence_key: row(1).logical_occurrence_key }];
    events = [{ id: uuid(300001), session_id: row(1).id, created_at: "2026-11-01T12:00:00Z" }];
    const r = await call(); if (!r.success) throw new Error(r.code); expect(r.calendar[0].sessions).toHaveLength(2); expect(r.summary.eligibleDue).toBe(1);
  });
  it.each(["task_study_sessions", "tasks", "task_study_session_events"])("rejects %s query errors", async table => {
    rows = [row(1)]; override = (q, r) => q.table === table ? { ...r, error: {} } : r; expect(await call()).toEqual(failed); });
  it.each(["task_study_sessions", "tasks", "task_study_session_events"])("rejects unavailable exact count in %s", async table => {
    rows = [row(1)]; override = (q, r) => q.table === table ? { ...r, count: null } : r; expect(await call()).toEqual(incomplete); });
  it.each(["task_study_sessions", "tasks", "task_study_session_events"])("detects truncation in %s", async table => {
    rows = [{ ...row(1), status: "cancelled" }]; events = [{ id: uuid(300001), session_id: row(1).id, created_at: "2026-11-01T12:00:00Z" }];
    override = (q, r) => q.table === table ? { ...r, data: [] } : r; expect(await call()).toEqual(incomplete); });
  it("rejects an RLS-hidden/deleted Task instead of guessing its title", async () => {
    rows = [row(1)]; override = (q, r) => q.table === "tasks" ? { ...r, data: [], count: 0 } : r; expect(await call()).toEqual(incomplete); });
  it.each(["missing", "duplicate", "contradictory"])("rejects %s cancellation audit", async mode => {
    rows = [{ ...row(1), status: mode === "contradictory" ? "scheduled" : "cancelled" }];
    events = mode === "missing" ? [] : [{ id: uuid(300001), session_id: row(1).id, created_at: "2026-11-01T12:00:00Z" }];
    if (mode === "duplicate") events.push({ ...events[0], id: uuid(300002) }); expect(await call()).toEqual(incomplete); });
  it("detects repeated IDs and changing cardinality between pages", async () => {
    rows = Array.from({ length: 501 }, (_, i) => row(i)); rows[500] = { ...rows[0] }; expect(await call()).toEqual(incomplete);
    rows[500] = row(500); override = (q, r) => q.range?.[0] === 500 ? { ...r, count: 502 } : r; expect(await call()).toEqual(incomplete); });
  it("bounds read history and serialized payload without silent truncation", async () => {
    rows = Array.from({ length: 20001 }, (_, i) => row(i)); expect(await call()).toEqual(incomplete);
    rows = rows.slice(0, 2001); expect(await call()).toEqual(incomplete); });
  it.each(["status", "zone", "ambiguity"])("rejects malformed/ambiguous %s", async mode => {
    rows = [row(1)]; if (mode === "status") rows[0].status = "unknown"; if (mode === "zone") rows[0].timezone = "Not/AZone";
    if (mode === "ambiguity") rows.push({ ...row(2), schedule_id: row(1).schedule_id, logical_occurrence_key: row(1).logical_occurrence_key });
    expect(await call()).toEqual(incomplete); });
});
