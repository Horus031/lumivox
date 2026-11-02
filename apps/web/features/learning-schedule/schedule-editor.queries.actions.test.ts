import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { getStudyScheduleEditorAction } from "./schedule-editor.queries.actions";
const id = "00000000-0000-4000-8000-000000000001";
const metadata = { id, status: "active", revision: 2, starts_on: "2030-01-07", ends_on: "2030-01-21", timezone: "UTC" };
describe("schedule editor read action", () => {
  let q: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.resetAllMocks(); q = {};
    for (const method of ["from", "select", "eq"]) q[method] = vi.fn(() => q);
    q.single = vi.fn().mockResolvedValueOnce({ data: metadata, error: null }).mockResolvedValue({ data: { revision: 2, status: "active" }, error: null });
    q.order = vi.fn().mockReturnValueOnce(q).mockResolvedValue({ data: [{ weekday: 1, start_time: "19:00:00", end_time: "20:30:00" }], error: null });
    mocks.auth.mockResolvedValue({ supabase: q, user: { id: "owner" } });
  });
  it("rejects bad IDs before auth", async () => {
    expect(await getStudyScheduleEditorAction("invalid")).toMatchObject({ success: false }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("loads ordered owner slots, trims seconds and rechecks revision", async () => {
    expect(await getStudyScheduleEditorAction(id)).toEqual({ success: true, revision: 2, draft: {
      startsOn: metadata.starts_on, endsOn: metadata.ends_on, timezone: "UTC", slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }],
    } });
    expect(q.eq.mock.calls.filter(x => x[0] === "user_id")).toEqual(Array(3).fill(["user_id", "owner"]));
    expect(q.order.mock.calls).toEqual([["weekday"], ["start_time"]]); expect(q.single).toHaveBeenCalledTimes(2);
  });
  it.each(["closed", "paused"])("rejects %s schedule", async status => {
    q.single.mockReset().mockResolvedValue({ data: { ...metadata, status }, error: null });
    expect(await getStudyScheduleEditorAction(id)).toMatchObject({ success: false, message: "This schedule cannot be edited." }); expect(q.order).not.toHaveBeenCalled();
  });
  it.each([{ revision: 3, status: "active" }, { revision: 2, status: "closed" }, null])("rejects concurrent changed/deleted metadata: %j", async current => {
    q.single.mockReset().mockResolvedValueOnce({ data: metadata, error: null }).mockResolvedValue({ data: current, error: null });
    expect(await getStudyScheduleEditorAction(id)).toMatchObject({ success: false, message: expect.stringContaining("changed while loading") });
  });
  it("handles missing owner, empty slots and auth failures safely", async () => {
    q.single.mockReset().mockResolvedValue({ data: null, error: { message: "private" } });
    expect(await getStudyScheduleEditorAction(id)).toMatchObject({ success: false, message: "Study schedule not found." });
    q.single.mockResolvedValue({ data: metadata, error: null }); q.order.mockReset().mockReturnValueOnce(q).mockResolvedValue({ data: [], error: null });
    expect(await getStudyScheduleEditorAction(id)).toMatchObject({ success: false, message: "Could not load weekly slots." });
    mocks.auth.mockRejectedValue(new Error("private")); expect(await getStudyScheduleEditorAction(id)).toMatchObject({ success: false, message: "Unable to load schedule editor." });
  });
});
