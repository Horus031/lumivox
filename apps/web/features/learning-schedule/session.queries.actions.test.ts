import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { getStudySessionsAction } from "./session.queries.actions";
const scheduleId = "00000000-0000-4000-8000-000000000001";
describe("sessions read action", () => {
  let query: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.resetAllMocks(); query = {};
    for (const name of ["from", "select", "eq", "order"]) query[name] = vi.fn(() => query);
    query.range = vi.fn().mockResolvedValue({ data: [], error: null, count: 41 });
    mocks.auth.mockResolvedValue({ supabase: query, user: { id: "owner" } });
  });
  it.each([
    { scheduleId: "bad", page: 0 }, { scheduleId, page: -1 }, { scheduleId, page: 1.5 },
    { scheduleId, page: 1001 }, { scheduleId, page: 0, userId: "forged" },
  ])("rejects invalid/extra pagination input before authentication: %j", async input => {
    expect(await getStudySessionsAction(input)).toEqual({ success: false, message: "Invalid sessions request." });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("reads exactly one page with owner filtering, exact count and deterministic order", async () => {
    expect(await getStudySessionsAction({ scheduleId, page: 1 })).toMatchObject({
      success: true, page: 1, total: 41, hasMore: true,
    });
    expect(query.eq).toHaveBeenCalledWith("schedule_id", scheduleId);
    expect(query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("cancellation_reason"), { count: "exact" });
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("updated_at"), { count: "exact" });
    expect(query.order.mock.calls).toEqual([["scheduled_start_at", { ascending: true }], ["id", { ascending: true }]]);
    expect(query.range).toHaveBeenCalledWith(20, 39);
  });
  it("handles the final page and null results/count", async () => {
    expect(await getStudySessionsAction({ scheduleId, page: 2 })).toMatchObject({ success: true, hasMore: false });
    query.range.mockResolvedValue({ data: null, error: null, count: null });
    expect(await getStudySessionsAction({ scheduleId, page: 0 })).toEqual({ success: true,
      sessions: [], page: 0, total: 0, hasMore: false });
  });
  it("sanitizes database errors and authentication failures", async () => {
    query.range.mockResolvedValue({ error: { message: "Private internal detail" } });
    expect(await getStudySessionsAction({ scheduleId, page: 0 })).toEqual({ success: false, message: "Could not load study sessions." });
    mocks.auth.mockRejectedValue(new Error("No session"));
    expect(await getStudySessionsAction({ scheduleId, page: 0 })).toEqual({ success: false, message: "Unable to load study sessions." });
  });
});
