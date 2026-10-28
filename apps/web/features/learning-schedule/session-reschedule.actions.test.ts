import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { rescheduleStudySessionAction } from "./session-reschedule.actions";
const command = { sessionId: "00000000-0000-4000-8000-000000000001", expectedUpdatedAt: "2026-10-28T01:00:00Z", localDate: "2030-01-08", startTime: "19:00", endTime: "20:30", eventKey: "00000000-0000-4000-8000-000000000002" };
describe("session reschedule action", () => {
  let client: Record<string, ReturnType<typeof vi.fn>>;
  let session: Record<string, ReturnType<typeof vi.fn>>;
  let schedule: Record<string, ReturnType<typeof vi.fn>>;
  let current: Record<string, ReturnType<typeof vi.fn>>;
  let rpc: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.resetAllMocks();
    function builder() { const q: Record<string, ReturnType<typeof vi.fn>> = {}; for (const method of ["select", "eq"]) q[method] = vi.fn(() => q); return q; }
    session = builder(); schedule = builder(); current = builder(); rpc = builder();
    session.maybeSingle = vi.fn().mockResolvedValue({ data: { id: command.sessionId, schedule_id: "schedule" }, error: null });
    schedule.maybeSingle = vi.fn().mockResolvedValue({ data: { timezone: "Asia/Ho_Chi_Minh" }, error: null });
    current.abortSignal = vi.fn(() => current); current.maybeSingle = vi.fn().mockResolvedValue({ data: { updated_at: "2026-10-28T02:00:00Z" }, error: null });
    rpc.abortSignal = vi.fn().mockResolvedValue({ data: command.sessionId, error: null });
    client = { from: vi.fn().mockReturnValueOnce(session).mockReturnValueOnce(schedule).mockReturnValue(current), rpc: vi.fn(() => rpc) };
    mocks.auth.mockResolvedValue({ supabase: client, user: { id: "owner" } });
  });
  it.each([{ ...command, eventKey: "bad" }, { ...command, endTime: "18:00" }, { ...command, userId: "forged" }])("rejects invalid input before auth %j", async payload => {
    expect(await rescheduleStudySessionAction(payload)).toMatchObject({ success: false }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("resolves owning timezone and sends immutable identity/version/key with UTC times", async () => {
    expect(await rescheduleStudySessionAction(command)).toEqual({ success: true, sessionId: command.sessionId });
    expect(session.eq).toHaveBeenCalledWith("user_id", "owner"); expect(schedule.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(client.rpc).toHaveBeenCalledWith("ls_reschedule_session", { p_session_id: command.sessionId, p_expected_updated_at: command.expectedUpdatedAt,
      p_new_local_date: command.localDate, p_new_start_time: command.startTime, p_new_end_time: command.endTime,
      p_new_start_at: "2030-01-08T12:00:00Z", p_new_end_at: "2030-01-08T13:30:00Z", p_event_key: command.eventKey });
    expect(rpc.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("rejects DST gap before RPC and selects earlier fold", async () => {
    schedule.maybeSingle.mockResolvedValue({ data: { timezone: "America/New_York" }, error: null });
    expect(await rescheduleStudySessionAction({ ...command, localDate: "2030-03-10", startTime: "02:30", endTime: "04:00" })).toMatchObject({ success: false }); expect(client.rpc).not.toHaveBeenCalled();
  });
  it("selects earlier fold in real Temporal conversion", async () => {
    schedule.maybeSingle.mockResolvedValue({ data: { timezone: "America/New_York" }, error: null });
    await rescheduleStudySessionAction({ ...command, localDate: "2030-11-03", startTime: "01:30", endTime: "01:45" });
    expect(client.rpc).toHaveBeenCalledWith("ls_reschedule_session", expect.objectContaining({ p_new_start_at: "2030-11-03T05:30:00Z", p_new_end_at: "2030-11-03T05:45:00Z" }));
  });
  it.each(["40001", "23P01", "22023"])("handles database rejection %s without success", async code => {
    rpc.abortSignal.mockResolvedValue({ data: null, error: { code } });
    expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false, conflict: code === "40001" });
  });
  it("unknown outcome rereads only owner version and requests explicit retry/reload", async () => {
    rpc.abortSignal.mockResolvedValue({ data: null, error: { code: "", message: "AbortError" } });
    expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false, uncertain: true, conflict: true });
    expect(current.eq).toHaveBeenCalledWith("user_id", "owner"); expect(client.rpc).toHaveBeenCalledOnce();
  });
  it("thrown RPC failure is unknown, without automatic replay", async () => {
    rpc.abortSignal.mockRejectedValue(new Error("network")); expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false, uncertain: true }); expect(client.rpc).toHaveBeenCalledOnce();
  });
  it("denies absent owner session before RPC", async () => {
    session.maybeSingle.mockResolvedValue({ data: null, error: null }); expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false, message: "Study session not found." }); expect(client.rpc).not.toHaveBeenCalled();
  });
});
