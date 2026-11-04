// @vitest-environment node
// LOCAL ONLY. Admin is limited to fixture identity/task setup and cleanup.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
import { getStudyNotificationPreferencesAction, saveStudyNotificationPreferencesAction, saveStudyNotificationTaskOverrideAction } from "./notification-preferences.actions";
const url = process.env.LEARNING_SCHEDULE_TEST_URL, key = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY, service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const off = { studyEmailEnabled: false, leadMinutes: 15, quietHoursEnabled: false, quietStartLocal: null, quietEndLocal: null, timezone: null };
describe.skipIf(!url || !key || !service)("local notification consent HTTP integration", () => {
  let admin: SupabaseClient<Database>;
  const fixtures: { user: User; client: SupabaseClient<Database> }[] = [];
  let taskId: string;
  beforeAll(async () => {
    const api = new URL(url!); expect(api.protocol).toBe("http:"); expect(api.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(api.port).toBe("55321");
    admin = createClient<Database>(url!, service!, opts);
    for (let i = 0; i < 2; i++) {
      const email = `np-http-${randomUUID()}@example.invalid`, password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(created.error).toBeNull();
      const user = created.data.user!, client = createClient<Database>(url!, key!, opts); fixtures.push({ user, client });
      expect((await admin.from("profiles").upsert({ id: user.id })).error).toBeNull(); expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    }
    auth.requireUser.mockResolvedValue({ supabase: fixtures[0].client, user: fixtures[0].user });
    const task = await admin.from("tasks").insert({ user_id: fixtures[0].user.id, title: "Notification HTTP fixture", status: "todo" }).select("id").single(); expect(task.error).toBeNull(); taskId = task.data!.id;
  }, 30000);
  afterAll(async () => {
    const failures: string[] = [];
    for (const { user, client } of fixtures) {
      await client.auth.signOut(); if ((await admin.auth.admin.deleteUser(user.id)).error) failures.push("Auth cleanup failed");
      for (const table of ["tasks", "study_notification_preferences", "study_notification_task_overrides", "study_notification_jobs", "study_notification_deliveries"] as const) {
        const r = await admin.from(table).select("user_id", { count: "exact", head: true }).eq("user_id", user.id);
        if (r.error || r.count !== 0) failures.push(`${table} cleanup incomplete`);
      }
    }
    expect(failures).toEqual([]);
  }, 30000);
  it("NP-01/02/03 real Auth+RPC records DB consent, preserves retry, then opts out", async () => {
    expect(await getStudyNotificationPreferencesAction()).toMatchObject({ success: true, preferences: { studyEmailEnabled: false, consentedAt: null } });
    const absent = await fixtures[0].client.from("study_notification_preferences").select("user_id"); expect(absent.data).toEqual([]);
    const before = Date.now(); const enabled = await saveStudyNotificationPreferencesAction({ ...off, studyEmailEnabled: true });
    if (!enabled.success) throw new Error(enabled.code); expect(enabled.preferences.studyEmailEnabled).toBe(true); expect(Date.parse(enabled.preferences.consentedAt!)).toBeGreaterThanOrEqual(before - 2000);
    const replay = await saveStudyNotificationPreferencesAction({ ...off, studyEmailEnabled: true }); expect(replay).toMatchObject({ success: true, preferences: { consentedAt: enabled.preferences.consentedAt } });
    expect(await saveStudyNotificationPreferencesAction(off)).toMatchObject({ success: true, preferences: { studyEmailEnabled: false, consentedAt: enabled.preferences.consentedAt } });
  });
  it("NP-05/06 quiet hours and Task override cannot bypass global OFF", async () => {
    expect(await saveStudyNotificationPreferencesAction({ ...off, quietHoursEnabled: true, quietStartLocal: "22:00", quietEndLocal: "07:00", timezone: "Asia/Ho_Chi_Minh" })).toMatchObject({ success: true });
    expect(await saveStudyNotificationTaskOverrideAction({ taskId, enabled: true })).toMatchObject({ success: true });
    const effective = await fixtures[0].client.rpc("ls_study_notification_task_enabled", { p_task_id: taskId }); expect(effective.error).toBeNull(); expect(effective.data).toBe(false);
    const invalid = await fixtures[0].client.rpc("ls_set_study_notification_preferences", { p_study_email_enabled: true, p_lead_minutes: 10 }); expect(invalid.error?.code).toBe("22023");
  });
  it("NP-07/08 real owner B cannot read A, override A or forge jobs/deliveries/control", async () => {
    const b = fixtures[1].client;
    const read = await b.from("study_notification_preferences").select("*").eq("user_id", fixtures[0].user.id); expect(read.error).toBeNull(); expect(read.data).toEqual([]);
    const command = await b.rpc("ls_set_study_notification_task_override", { p_task_id: taskId, p_enabled: false }); expect(command.error?.code).toBe("22023");
    const pref = await b.from("study_notification_preferences").update({ study_email_enabled: true }).eq("user_id", fixtures[0].user.id); expect(pref.error?.code).toBe("42501");
    const jobs = await b.from("study_notification_jobs").update({ status: "sent" }).eq("user_id", fixtures[1].user.id); expect(jobs.error?.code).toBe("42501");
    const deliveries = await b.from("study_notification_deliveries").update({ status: "delivered" }).eq("user_id", fixtures[1].user.id); expect(deliveries.error?.code).toBe("42501");
    const gate = await b.from("study_notification_dispatch_control").update({ enabled: true }).eq("singleton", true); expect(gate.error?.code).toBe("42501");
    const anonymous = createClient<Database>(url!, key!, opts);
    const anon = await anonymous.rpc("ls_set_study_notification_preferences", { p_study_email_enabled: true }); expect(anon.error?.code).toBe("42501");
  });
});
