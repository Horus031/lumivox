import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
import { getStudyNotificationPreferencesAction, saveStudyNotificationPreferencesAction, saveStudyNotificationTaskOverrideAction } from "./notification-preferences.actions";
const taskId = "7a100000-0000-4000-8000-000000000001";
const input = { studyEmailEnabled: true, leadMinutes: 15, quietHoursEnabled: false, quietStartLocal: null, quietEndLocal: null, timezone: null };
const row = { user_id: "owner-a", study_email_enabled: true, lead_minutes: 15, quiet_hours_enabled: false,
  quiet_start_local: null, quiet_end_local: null, timezone: null, consented_at: "2026-11-04T05:00:00Z", created_at: "2026-11-04T05:00:00Z", updated_at: "2026-11-04T05:00:00Z" };
let rpc: ReturnType<typeof vi.fn>, abort: ReturnType<typeof vi.fn>, eq: ReturnType<typeof vi.fn>, maybeSingle: ReturnType<typeof vi.fn>, from: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks(); abort = vi.fn().mockResolvedValue({ data: row, error: null }); rpc = vi.fn(() => ({ abortSignal: abort }));
  maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null }); eq = vi.fn(() => ({ maybeSingle })); from = vi.fn(() => ({ select: vi.fn(() => ({ eq })) }));
  mocks.auth.mockResolvedValue({ supabase: { rpc, from }, user: { id: "owner-a" } });
});
describe("Study notification consent Server Actions", () => {
  it("NP-01 missing row returns default OFF without INSERT or consent", async () => {
    expect(await getStudyNotificationPreferencesAction()).toEqual({ success: true, preferences: { ...input, studyEmailEnabled: false, consentedAt: null, updatedAt: null } });
    expect(from).toHaveBeenCalledExactlyOnceWith("study_notification_preferences"); expect(eq).toHaveBeenCalledExactlyOnceWith("user_id", "owner-a"); expect(rpc).not.toHaveBeenCalled();
  });
  it("reads only the authenticated owner's persisted DB consent", async () => {
    maybeSingle.mockResolvedValue({ data: row, error: null });
    expect(await getStudyNotificationPreferencesAction()).toMatchObject({ success: true, preferences: { studyEmailEnabled: true, consentedAt: row.consented_at } });
  });
  it.each([5,15,30,60])("NP-02/04 saves explicit consent with lead %i, no client owner/timestamp", async leadMinutes => {
    expect(await saveStudyNotificationPreferencesAction({ ...input, leadMinutes })).toMatchObject({ success: true, preferences: { consentedAt: row.consented_at } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("ls_set_study_notification_preferences", { p_study_email_enabled: true, p_lead_minutes: leadMinutes,
      p_quiet_hours_enabled: false, p_quiet_start_local: undefined, p_quiet_end_local: undefined, p_timezone: undefined });
  });
  it("NP-03 persists opt-out through the same authenticated DB command", async () => {
    abort.mockResolvedValue({ data: { ...row, study_email_enabled: false }, error: null });
    expect(await saveStudyNotificationPreferencesAction({ ...input, studyEmailEnabled: false })).toMatchObject({ success: true, preferences: { studyEmailEnabled: false } });
  });
  it.each([{}, { ...input, userId: "forged" }, { ...input, consentedAt: "2000-01-01T00:00:00Z" }, { ...input, leadMinutes: 10 },
    { ...input, leadMinutes: 15.5 }, { ...input, studyEmailEnabled: "true" }, { ...input, timezone: "Not/AZone" },
    { ...input, timezone: "+07:00" }, { ...input, quietStartLocal: "24:00" }, { ...input, quietHoursEnabled: true },
    { ...input, quietHoursEnabled: true, quietStartLocal: "22:00", quietEndLocal: "22:00", timezone: "UTC" }])("rejects malformed or injected input before Auth: %j", async raw => {
    expect(await saveStudyNotificationPreferencesAction(raw)).toEqual({ success: false, code: "invalidInput" }); expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("NP-05 accepts overnight quiet hours in an explicit IANA timezone", async () => {
    expect(await saveStudyNotificationPreferencesAction({ ...input, quietHoursEnabled: true, quietStartLocal: "22:00", quietEndLocal: "07:00", timezone: "Asia/Ho_Chi_Minh" })).toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith("ls_set_study_notification_preferences", expect.objectContaining({ p_timezone: "Asia/Ho_Chi_Minh", p_quiet_start_local: "22:00", p_quiet_end_local: "07:00" }));
  });
  it.each(["42501", "22023", "23514", "XX000"])("maps RPC error %s without leaking DB text", async code => {
    abort.mockResolvedValue({ data: null, error: { code, message: "PRIVATE DATABASE DETAIL" } });
    const result = await saveStudyNotificationPreferencesAction(input);
    expect(result).toEqual({ success: false, code: code === "42501" ? "notAuthorized" : code === "XX000" ? "saveFailed" : "invalidInput" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
  });
  it("handles missing RPC result or transport exceptions safely", async () => {
    abort.mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(new Error("network"));
    expect(await saveStudyNotificationPreferencesAction(input)).toEqual({ success: false, code: "saveFailed" });
    expect(await saveStudyNotificationPreferencesAction(input)).toEqual({ success: false, code: "saveFailed" });
  });
  it("handles read query failure without manufacturing defaults", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: {} }); expect(await getStudyNotificationPreferencesAction()).toEqual({ success: false, code: "loadFailed" });
  });
  it("rejects unauthenticated read/save/override before querying", async () => {
    mocks.auth.mockRejectedValue(new Error("Unauthenticated"));
    expect(await getStudyNotificationPreferencesAction()).toEqual({ success: false, code: "notAuthorized" });
    expect(await saveStudyNotificationPreferencesAction(input)).toEqual({ success: false, code: "notAuthorized" });
    expect(await saveStudyNotificationTaskOverrideAction({ taskId, enabled: false })).toEqual({ success: false, code: "notAuthorized" });
    expect(rpc).not.toHaveBeenCalled(); expect(from).not.toHaveBeenCalled();
  });
  it("NP-06 sends only a Task identifier and suppression toggle", async () => {
    abort.mockResolvedValue({ data: { task_id: taskId, enabled: false }, error: null });
    expect(await saveStudyNotificationTaskOverrideAction({ taskId, enabled: false })).toEqual({ success: true, override: { taskId, enabled: false } });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("ls_set_study_notification_task_override", { p_task_id: taskId, p_enabled: false });
  });
  it.each([{ taskId: "bad", enabled: true }, { taskId, enabled: true, userId: "forged" }, { taskId }])("rejects invalid Task command %j", async raw => {
    expect(await saveStudyNotificationTaskOverrideAction(raw)).toEqual({ success: false, code: "invalidInput" }); expect(mocks.auth).not.toHaveBeenCalled();
  });
});
