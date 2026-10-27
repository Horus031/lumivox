// @vitest-environment node
// LOCAL ONLY: real auth/PostgREST/RPC, with requireUser bound to the signed-in
// fixture client instead of Next.js request cookies. Credentials come from the
// local CLI at execution time and are never committed or printed.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { generateStudyOccurrences } from "./schedule-engine";

const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/features/engagement-retention/engagement-retention.background", () => ({ scheduleEngagementRecalculation: vi.fn() }));
import { createStudyScheduleAction } from "./schedule.actions";
import { getTaskStudyScheduleAction } from "./schedule.queries.actions";
import { deleteTaskAction, getTaskDetailsAction, transitionTaskStatusAction, updateTaskAction } from "@/features/tasks/task.actions";

const url = process.env.LEARNING_SCHEDULE_TEST_URL;
const publicKey = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
const serviceKey = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const enabled = Boolean(url && publicKey && serviceKey);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
type Status = Database["public"]["Enums"]["task_status"];
const draft = { startsOn: "2030-01-07", endsOn: "2030-01-21", timezone: "Asia/Ho_Chi_Minh",
  slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }] };

describe.skipIf(!enabled)("local Task scheduling Server Actions integration", () => {
  let admin: SupabaseClient<Database>;
  const fixtures: { client: SupabaseClient<Database>; user: User }[] = [];
  beforeAll(async () => {
    const endpoint = new URL(url!);
    expect(["localhost", "127.0.0.1"]).toContain(endpoint.hostname);
    expect(endpoint.port).toBe("55321");
    admin = createClient<Database>(url!, serviceKey!, options);
    for (let i = 0; i < 2; i++) {
      const email = `schedule-integration-${randomUUID()}@example.invalid`;
      const password = randomUUID();
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      expect(created.error).toBeNull();
      const user = created.data.user!;
      const client = createClient<Database>(url!, publicKey!, options);
      fixtures.push({ client, user });
      expect((await admin.from("profiles").upsert({ id: user.id })).error).toBeNull();
      expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    }
  }, 30000);
  beforeEach(() => { auth.requireUser.mockResolvedValue({ supabase: fixtures[0].client, user: fixtures[0].user }); });
  afterAll(async () => {
    for (const { client, user } of fixtures) {
      await client.auth.signOut();
      expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    }
    for (const { user } of fixtures) {
      const remaining = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      expect(remaining.error).toBeNull(); expect(remaining.count).toBe(0);
    }
  }, 30000);
  async function task(status: Status = "todo", parent: string | null = null) {
    const inserted = await admin.from("tasks").insert({ title: "Schedule integration fixture",
      user_id: fixtures[0].user.id, status, parent_task_id: parent }).select("*").single();
    expect(inserted.error).toBeNull(); return inserted.data!;
  }
  it.each(["todo", "in_progress"] as const)("root %s saves through the real RPC and loads correct summary/session count", async status => {
    const root = await task(status);
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
    const created = await createStudyScheduleAction({ taskId: root.id, ...draft });
    expect(created).toMatchObject({ success: true, sessionCount: 3 });
    if (!created.success) throw new Error(created.message);
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true,
      schedule: { id: created.scheduleId, task_id: root.id, revision: 1, timezone: draft.timezone } });
    const sessions = await fixtures[0].client.from("task_study_sessions")
      .select("scheduled_start_at,scheduled_end_at,local_date,status").eq("schedule_id", created.scheduleId).order("scheduled_start_at");
    expect(sessions.error).toBeNull(); expect(sessions.data).toHaveLength(3);
    const expected = generateStudyOccurrences(draft);
    expect(sessions.data!.map(x => new Date(x.scheduled_start_at).toISOString()))
      .toEqual(expected.map(x => new Date(x.scheduledStartAt).toISOString()));
    expect(sessions.data!.every(x => x.status === "scheduled")).toBe(true);
    const details = await getTaskDetailsAction(root.id);
    expect(details).toMatchObject({ success: true, data: { task: { parent_task_id: null } } });
  });
  it.each(["completed", "cancelled", "in_review"] as const)("rejects real creation for %s", async status => {
    const root = await task(status);
    expect(await createStudyScheduleAction({ taskId: root.id, ...draft }))
      .toEqual({ success: false, message: "Task is not eligible for scheduling." });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
  });
  it("rejects subtask scheduling", async () => {
    const parent = await task(); const child = await task("todo", parent.id);
    expect(await createStudyScheduleAction({ taskId: child.id, ...draft }))
      .toEqual({ success: false, message: "Task is not eligible for scheduling." });
    expect(await getTaskStudyScheduleAction(child.id)).toMatchObject({ success: true, schedule: null });
  });
  it("two concurrent create actions persist one schedule and exactly three sessions", async () => {
    const root = await task();
    const results = await Promise.all([0, 1].map(() => createStudyScheduleAction({ taskId: root.id, ...draft })));
    expect(results.filter(x => x.success)).toHaveLength(1);
    expect(results.filter(x => !x.success)).toHaveLength(1);
    const schedules = await admin.from("task_study_schedules").select("id").eq("task_id", root.id);
    expect(schedules.error).toBeNull(); expect(schedules.data).toHaveLength(1);
    const count = await admin.from("task_study_sessions").select("id", { count: "exact", head: true }).eq("task_id", root.id);
    expect(count.error).toBeNull(); expect(count.count).toBe(3);
    expect(await createStudyScheduleAction({ taskId: root.id, ...draft })).toMatchObject({ success: false });
  });
  it("another signed-in user cannot load or create the owner's schedule", async () => {
    const root = await task();
    expect((await createStudyScheduleAction({ taskId: root.id, ...draft })).success).toBe(true);
    auth.requireUser.mockResolvedValue({ supabase: fixtures[1].client, user: fixtures[1].user });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
    expect((await createStudyScheduleAction({ taskId: root.id, ...draft })).success).toBe(false);
  });
  it("normal Task without schedule keeps real edit/status/delete Server Actions working", async () => {
    const root = await task();
    const edited = await updateTaskAction({ taskId: root.id, title: "Edited unscheduled Task",
      description: "Still editable", priority: "high", status: "todo",
      expectedStatus: root.status, expectedUpdatedAt: root.updated_at });
    expect(edited.success).toBe(true);
    const fresh = await fixtures[0].client.from("tasks").select("*").eq("id", root.id).single();
    expect(fresh.error).toBeNull(); expect(fresh.data!.title).toBe("Edited unscheduled Task");
    expect((await transitionTaskStatusAction({ taskId: root.id, targetStatus: "in_progress",
      expectedStatus: "todo", expectedUpdatedAt: fresh.data!.updated_at })).success).toBe(true);
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
    expect((await deleteTaskAction(root.id)).success).toBe(true);
    const gone = await admin.from("tasks").select("id").eq("id", root.id).maybeSingle();
    expect(gone.error).toBeNull(); expect(gone.data).toBeNull();
  });
});
