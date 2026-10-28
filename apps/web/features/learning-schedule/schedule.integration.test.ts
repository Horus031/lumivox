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
import { getStudySessionsAction } from "./session.queries.actions";
import { getStudyScheduleEditorAction } from "./schedule-editor.queries.actions";
import { reviseStudyScheduleAction } from "./schedule-revision.actions";
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
    const displayed = await getStudySessionsAction({ scheduleId: created.scheduleId, page: 0 });
    expect(displayed).toMatchObject({ success: true, total: 3, page: 0, hasMore: false });
    if (!displayed.success) throw new Error(displayed.message);
    expect(displayed.sessions.map(x => x.local_date)).toEqual(expected.map(x => x.localDate));
    expect(displayed.sessions.every(x => x.local_start_time === "19:00:00" && x.status === "scheduled")).toBe(true);
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
    const created = await createStudyScheduleAction({ taskId: root.id, ...draft });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error(created.message);
    auth.requireUser.mockResolvedValue({ supabase: fixtures[1].client, user: fixtures[1].user });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
    expect((await createStudyScheduleAction({ taskId: root.id, ...draft })).success).toBe(false);
    expect(await getStudySessionsAction({ scheduleId: created.scheduleId, page: 0 })).toEqual({
      success: true, sessions: [], total: 0, page: 0, hasMore: false,
    });
    expect(await getStudyScheduleEditorAction(created.scheduleId)).toMatchObject({ success: false });
    expect(await reviseStudyScheduleAction({ scheduleId: created.scheduleId, expectedRevision: 1, ...draft }))
      .toMatchObject({ success: false, message: "Schedule not found." });
  });
  it("revises through authenticated action, preserves history, audits cancellation and reloads revision 2 then 3", async () => {
    const root = await task();
    const created = await createStudyScheduleAction({ taskId: root.id, ...draft });
    if (!created.success) throw new Error(created.message);
    const scheduleId = created.scheduleId;
    expect(await getStudyScheduleEditorAction(scheduleId)).toEqual({ success: true, revision: 1, draft });
    const original = await admin.from("task_study_sessions").select("*").eq("schedule_id", scheduleId).order("scheduled_start_at");
    expect(original.error).toBeNull();
    const [completed, past, future] = original.data!;
    // Privileged fixtures model pre-existing completed and past scheduled history.
    expect((await admin.from("task_study_sessions").update({ status: "completed", completed_at: "2020-01-06T13:30:00Z",
      local_date: "2020-01-06", scheduled_start_at: "2020-01-06T12:00:00Z", scheduled_end_at: "2020-01-06T13:30:00Z" }).eq("id", completed.id)).error).toBeNull();
    expect((await admin.from("task_study_sessions").update({ local_date: "2020-01-13",
      scheduled_start_at: "2020-01-13T12:00:00Z", scheduled_end_at: "2020-01-13T13:30:00Z" }).eq("id", past.id)).error).toBeNull();
    const history = await admin.from("task_study_sessions").select("id,status,local_date,scheduled_start_at,scheduled_end_at,completed_at,logical_occurrence_key")
      .in("id", [completed.id, past.id]).order("id");
    expect(history.error).toBeNull();
    const next = { ...draft, startsOn: "2030-01-08", endsOn: "2030-01-22", slots: [{ weekday: 2, startTime: "20:00", endTime: "21:30" }] };
    expect(await reviseStudyScheduleAction({ scheduleId, expectedRevision: 1, ...next })).toEqual({ success: true, revision: 2, sessionCount: 3 });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: { revision: 2, starts_on: next.startsOn } });
    expect(await getStudyScheduleEditorAction(scheduleId)).toEqual({ success: true, revision: 2, draft: next });
    const rows = await getStudySessionsAction({ scheduleId, page: 0 });
    if (!rows.success) throw new Error(rows.message);
    expect(rows.total).toBe(6);
    expect(rows.sessions.filter(x => x.schedule_revision === 2)).toHaveLength(3);
    expect(rows.sessions.find(x => x.id === future.id)).toMatchObject({ status: "cancelled", cancellation_reason: "schedule_changed" });
    const afterHistory = await admin.from("task_study_sessions").select("id,status,local_date,scheduled_start_at,scheduled_end_at,completed_at,logical_occurrence_key")
      .in("id", [completed.id, past.id]).order("id");
    expect(afterHistory.error).toBeNull(); expect(afterHistory.data).toEqual(history.data);
    const events = await fixtures[0].client.from("task_study_session_events").select("*").eq("session_id", future.id).eq("event_type", "cancelled");
    expect(events.error).toBeNull(); expect(events.data).toHaveLength(1);
    expect(events.data![0]).toMatchObject({ from_status: "scheduled", to_status: "cancelled", actor_id: fixtures[0].user.id,
      payload: { reason: "schedule_changed", scheduleId, scheduleRevision: 1 } });
    const third = { ...next, slots: [{ weekday: 2, startTime: "21:00", endTime: "22:00" }] };
    expect(await reviseStudyScheduleAction({ scheduleId, expectedRevision: 2, ...third })).toEqual({ success: true, revision: 3, sessionCount: 3 });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: { revision: 3 } });
    const final = await getStudySessionsAction({ scheduleId, page: 0 });
    if (!final.success) throw new Error(final.message);
    expect(final.total).toBe(9); expect(final.sessions.filter(x => x.status === "cancelled")).toHaveLength(4);
    expect(final.sessions.filter(x => x.schedule_revision === 3 && x.status === "scheduled")).toHaveLength(3);
  });
  it("two same-revision editors yield one success, one conflict and no duplicate revision", async () => {
    const root = await task(); const created = await createStudyScheduleAction({ taskId: root.id, ...draft });
    if (!created.success) throw new Error(created.message);
    const next = { ...draft, slots: [{ weekday: 1, startTime: "20:00", endTime: "21:00" }] };
    const results = await Promise.all([0, 1].map(() => reviseStudyScheduleAction({ scheduleId: created.scheduleId, expectedRevision: 1, ...next })));
    expect(results.filter(x => x.success)).toHaveLength(1);
    expect(results.find(x => !x.success)).toMatchObject({ success: false, conflict: true });
    expect(await getStudyScheduleEditorAction(created.scheduleId)).toEqual({ success: true, revision: 2, draft: next });
    const read = await getStudySessionsAction({ scheduleId: created.scheduleId, page: 0 });
    if (!read.success) throw new Error(read.message);
    expect(read.total).toBe(6); expect(read.sessions.filter(x => x.status === "scheduled")).toHaveLength(3);
  }, 15000);
  it("rejects past-date revision and in-progress session without changing schedule or sessions", async () => {
    const root = await task(); const created = await createStudyScheduleAction({ taskId: root.id, ...draft });
    if (!created.success) throw new Error(created.message);
    const scheduleId = created.scheduleId;
    const first = await admin.from("task_study_sessions").select("id").eq("schedule_id", scheduleId).limit(1).single();
    expect(first.error).toBeNull();
    expect((await admin.from("task_study_sessions").update({ status: "in_progress" }).eq("id", first.data!.id)).error).toBeNull();
    const snapshot = () => admin.from("task_study_sessions").select("*").eq("schedule_id", scheduleId).order("id");
    const before = await snapshot(); expect(before.error).toBeNull();
    expect(await reviseStudyScheduleAction({ scheduleId, expectedRevision: 1, ...draft })).toMatchObject({ success: false });
    expect(await reviseStudyScheduleAction({ scheduleId, expectedRevision: 1, ...draft, startsOn: "2020-01-06", endsOn: "2020-01-20" })).toMatchObject({ success: false });
    const after = await snapshot(); expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
    expect(await getStudyScheduleEditorAction(scheduleId)).toEqual({ success: true, revision: 1, draft });
  });
  it("reads >20 sessions in stable pages, including history statuses, without changing rows", async () => {
    const root = await task();
    const longer = { ...draft, endsOn: "2030-06-03" };
    const created = await createStudyScheduleAction({ taskId: root.id, ...longer });
    expect(created.success).toBe(true);
    if (!created.success) throw new Error(created.message);
    const selectAll = () => admin.from("task_study_sessions").select("*")
      .eq("schedule_id", created.scheduleId).order("scheduled_start_at").order("id");
    const fixtures = await selectAll(); expect(fixtures.error).toBeNull();
    const states = ["completed", "missed", "skipped", "in_progress", "cancelled"];
    for (const [index, status] of states.entries()) {
      const updated = await admin.from("task_study_sessions").update({ status,
        completed_at: status === "completed" ? new Date().toISOString() : null,
        cancellation_reason: status === "cancelled" ? "fixture_cancelled" : null,
      }).eq("id", fixtures.data![index].id);
      expect(updated.error).toBeNull();
    }
    const before = await selectAll(); expect(before.error).toBeNull();
    const first = await getStudySessionsAction({ scheduleId: created.scheduleId, page: 0 });
    const second = await getStudySessionsAction({ scheduleId: created.scheduleId, page: 1 });
    expect(first.success).toBe(true); expect(second.success).toBe(true);
    if (!first.success || !second.success) throw new Error("Pagination failed");
    const expected = generateStudyOccurrences(longer);
    expect(expected.length).toBeGreaterThan(20);
    expect(first.sessions).toHaveLength(20); expect(first.hasMore).toBe(true);
    expect(first.total).toBe(expected.length); expect(second.total).toBe(expected.length);
    expect(second.sessions).toHaveLength(expected.length - 20); expect(second.hasMore).toBe(false);
    const rows = [...first.sessions, ...second.sessions];
    expect(rows.map(x => x.id)).toEqual(before.data!.map(x => x.id));
    expect(new Set(rows.map(x => x.id)).size).toBe(expected.length);
    expect(first.sessions.slice(0, 5).map(x => x.status)).toEqual(states);
    expect(first.sessions[4].cancellation_reason).toBe("fixture_cancelled");
    const after = await selectAll(); expect(after.error).toBeNull(); expect(after.data).toEqual(before.data);
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
