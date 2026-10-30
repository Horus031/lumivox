import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { reviseStudyScheduleAction } from "./schedule-revision.actions";
const request = { scheduleId: "00000000-0000-4000-8000-000000000001", expectedRevision: 1,
  startsOn: "2030-01-07", endsOn: "2030-01-21", timezone: "UTC", slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }] };
describe("revision action conflict boundary", () => {
  let q: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.resetAllMocks(); q = {};
    for (const name of ["from", "select", "eq", "rpc"]) q[name] = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: { revision: 1 }, error: null });
    q.abortSignal = vi.fn().mockResolvedValue({ data: 2, error: null });
    mocks.auth.mockResolvedValue({ supabase: q, user: { id: "owner" } });
  });
  it("bounds RPC with AbortSignal and reports confirmed success", async () => {
    expect(await reviseStudyScheduleAction(request)).toEqual({ success: true, revision: 2, sessionCount: 3 });
    expect(q.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(q.rpc).toHaveBeenCalledWith("ls_revise_schedule", expect.objectContaining({ p_expected_revision: 1 }));
  });
  it("maps normal 40001 directly to conflict", async () => {
    q.abortSignal.mockResolvedValue({ data: null, error: { code: "40001" } });
    expect(await reviseStudyScheduleAction(request)).toMatchObject({ success: false, conflict: true });
    expect(q.maybeSingle).toHaveBeenCalledOnce();
  });
  it("after abort, rechecks owned revision and returns conflict without success/retry", async () => {
    q.abortSignal.mockResolvedValue({ data: null, error: { code: "", message: "AbortError" } });
    q.maybeSingle.mockResolvedValueOnce({ data: { revision: 1 }, error: null }).mockResolvedValue({ data: { revision: 2 }, error: null });
    expect(await reviseStudyScheduleAction(request)).toMatchObject({ success: false, conflict: true });
    expect(q.rpc).toHaveBeenCalledOnce(); expect(q.eq.mock.calls.filter(x => x[0] === "user_id")).toHaveLength(2);
  });
  it.each([{ data: { revision: 1 }, error: null }, { data: null, error: { message: "private" } }])("does not infer success or conflict without changed owned revision: %j", async current => {
    q.abortSignal.mockResolvedValue({ data: null, error: { code: "", message: "private" } });
    q.maybeSingle.mockResolvedValueOnce({ data: { revision: 1 }, error: null }).mockResolvedValue(current);
    expect(await reviseStudyScheduleAction(request)).toMatchObject({ success: false, message: "Could not update schedule. Check future dates and active sessions." });
  });
});
