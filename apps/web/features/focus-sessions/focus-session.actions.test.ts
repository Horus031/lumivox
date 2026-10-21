import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), schedule: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/features/engagement-retention/engagement-retention.background", () => ({ scheduleEngagementRecalculation: mocks.schedule }));
import { createFocusSessionAction as create, pauseFocusSessionAction as pause, resumeFocusSessionAction as resume, completeFocusSessionAction as complete, cancelFocusSessionAction as cancel } from "./focus-session.actions";

const id = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const session = { id, started_at: "2026-10-17T10:00:00Z", planned_minutes: 25, paused_at: null, total_paused_seconds: 0, status: "ongoing" };
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-17T12:05:00Z"));
  query = {};
  for (const key of ["from", "select", "eq", "is", "update"]) query[key] = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue({ data: session, error: null });
  query.maybeSingle = vi.fn().mockResolvedValue({ data: { id }, error: null });
  query.insert = vi.fn().mockResolvedValue({ error: null });
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: query });
});
afterEach(() => vi.useRealTimers());
describe("focus actions", () => {
  it("validates create before inserting", async () => {
    expect((await create({ plannedMinutes: 0 })).success).toBe(false);
    expect(query.insert).not.toHaveBeenCalled();
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("creates with authenticated ownership and an unlinked task", async () => {
    expect((await create({ plannedMinutes: 25, taskId: "" })).success).toBe(true);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: userId, task_id: null, status: "ongoing" }));
  });
  it("explains duplicate active sessions", async () => {
    query.insert.mockResolvedValue({ error: { code: "23505", message: "duplicate" } });
    expect(await create({ plannedMinutes: 25 })).toMatchObject({ success: false, message: "You already have an active focus session." });
  });
  it("pauses ongoing sessions and requires a returned row", async () => {
    expect((await pause(id)).success).toBe(true);
    expect(query.eq).toHaveBeenCalledWith("status", "ongoing");
    expect(query.select).toHaveBeenCalledWith("id");
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await pause(id)).success).toBe(false);
  });
  it("resumes and adds an open pause exactly once", async () => {
    query.single.mockResolvedValue({ data: { ...session, status: "paused", paused_at: "2026-10-17T12:04:00Z", total_paused_seconds: 30 }, error: null });
    expect((await resume(id)).success).toBe(true);
    expect(query.update).toHaveBeenCalledWith({ status: "ongoing", paused_at: null, total_paused_seconds: 90 });
    expect(query.eq).toHaveBeenCalledWith("paused_at", "2026-10-17T12:04:00Z");
    expect(query.eq).toHaveBeenCalledWith("total_paused_seconds", 30);
  });
  it("only one competing resume succeeds", async () => {
    query.single.mockResolvedValue({ data: { ...session, status: "paused", paused_at: "2026-10-17T12:04:00Z" }, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data: { id }, error: null }).mockResolvedValueOnce({ data: null, error: null });
    const results = await Promise.all([resume(id), resume(id)]);
    expect(results.map(r => r.success)).toEqual([true, false]);
    expect(query.eq).toHaveBeenCalledWith("status", "paused");
  });
  it.each([
    [resume, "ongoing", null], [resume, "paused", null],
    [complete, "paused", "2026-10-17T10:05:00Z"],
    [complete, "completed", null], [cancel, "completed", null], [cancel, "cancelled", null],
  ] as const)("rejects invalid transition %s from %s", async (action, status, paused_at) => {
    query.single.mockResolvedValue({ data: { ...session, status, paused_at }, error: null });
    expect((await action(id)).success).toBe(false);
    expect(query.update).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("completes once, caps actual minutes and schedules only after the update", async () => {
    expect((await complete(id)).success).toBe(true);
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", actual_focus_minutes: 25 }));
    expect(query.is).toHaveBeenCalledWith("paused_at", null);
    expect(mocks.schedule).toHaveBeenCalledExactlyOnceWith({ userId, source: "focus-completion", activity: { type: "focus_session", id } });
    expect(query.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.schedule.mock.invocationCallOrder[0]);
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await complete(id)).success).toBe(false);
    expect(mocks.schedule).toHaveBeenCalledOnce();
  });
  it("cancels a paused session without counting the two-hour break", async () => {
    query.single.mockResolvedValue({ data: { ...session, status: "paused", paused_at: "2026-10-17T10:05:00Z" }, error: null });
    expect((await cancel(id)).success).toBe(true);
    expect(query.update).toHaveBeenCalledWith({ status: "cancelled", ended_at: "2026-10-17T12:05:00.000Z", actual_focus_minutes: 5, paused_at: null, total_paused_seconds: 7200 });
    expect(query.eq).toHaveBeenCalledWith("paused_at", "2026-10-17T10:05:00Z");
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it("cancels ongoing sessions with the original pause version", async () => {
    expect((await cancel(id)).success).toBe(true);
    expect(query.is).toHaveBeenCalledWith("paused_at", null);
    expect(query.eq).toHaveBeenCalledWith("status", "ongoing");
    expect(query.eq).toHaveBeenCalledWith("total_paused_seconds", 0);
  });
  it.each([pause, resume, complete, cancel])("rejects invalid IDs before auth or mutation: %s", async action => {
    expect((await action("bad-id")).success).toBe(false);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it.each([pause, resume, complete, cancel])("filters ownership and refuses zero-row writes: %s", async action => {
    query.single.mockResolvedValue({ data: { ...session, status: action === resume ? "paused" : "ongoing", paused_at: action === resume ? "2026-10-17T10:05:00Z" : null }, error: null });
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await action(id)).toMatchObject({ success: false, message: "Session state changed. Please refresh." });
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it.each([resume, complete, cancel])("does not mutate missing or unowned sessions: %s", async action => {
    query.single.mockResolvedValue({ data: null, error: null });
    expect((await action(id)).success).toBe(false);
    expect(query.update).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
  });
  it.each([pause, resume, complete, cancel])("contains database update errors: %s", async action => {
    query.single.mockResolvedValue({ data: { ...session, status: action === resume ? "paused" : "ongoing", paused_at: action === resume ? "2026-10-17T10:05:00Z" : null }, error: null });
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    expect((await action(id)).success).toBe(false);
    expect(mocks.schedule).not.toHaveBeenCalled();
  });
  it.each([resume, complete, cancel])("contains read errors: %s", async action => {
    query.single.mockResolvedValue({ data: null, error: { message: "read failed" } });
    expect((await action(id)).success).toBe(false);
    expect(query.update).not.toHaveBeenCalled();
  });
  it.each([pause, resume, complete, cancel])("requires server authentication: %s", async action => {
    mocks.requireUser.mockRejectedValue(new Error("Unauthorized"));
    expect(await action(id)).toMatchObject({ success: false, message: "Unauthorized" });
    expect(query.update).not.toHaveBeenCalled();
  });
});
