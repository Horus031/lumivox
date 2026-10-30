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
import { rescheduleStudySessionAction } from "./session-reschedule.actions";
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
  async function sessionFixture(input = draft) {
    const root = await task();
    const created = await createStudyScheduleAction({ taskId: root.id, ...input });
    if (!created.success) throw new Error(created.message);
    const rows = await fixtures[0].client.from("task_study_sessions").select("*")
      .eq("schedule_id", created.scheduleId).order("scheduled_start_at").order("id");
    expect(rows.error).toBeNull();
    return { scheduleId: created.scheduleId, rows: rows.data!, root };
  }
  async function sessionSnapshot(scheduleId: string) {
    const rows = await admin.from("task_study_sessions").select("*").eq("schedule_id", scheduleId).order("id");
    expect(rows.error).toBeNull(); return rows.data!;
  }
  async function eventsFor(sessionId: string) {
    const events = await admin.from("task_study_session_events").select("*").eq("session_id", sessionId).order("id");
    expect(events.error).toBeNull(); return events.data!;
  }
  it("reschedules one ID only, retains logical identity, retries once and rejects changed same-key payload", async () => {
    const fixture = await sessionFixture(); const chosen = fixture.rows[0];
    const before = await sessionSnapshot(fixture.scheduleId);
    const command = { sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate: "2030-01-08", startTime: "18:00", endTime: "19:00", eventKey: randomUUID() };
    expect(await rescheduleStudySessionAction(command)).toEqual({ success: true, sessionId: chosen.id });
    const after = await sessionSnapshot(fixture.scheduleId);
    expect(after.filter(x => x.id !== chosen.id)).toEqual(before.filter(x => x.id !== chosen.id));
    expect(after.find(x => x.id === chosen.id)).toMatchObject({ id: chosen.id, logical_occurrence_key: chosen.logical_occurrence_key,
      schedule_revision: 1, source_slot_id: null, local_date: command.localDate, local_start_time: "18:00:00", local_end_time: "19:00:00" });
    const events = await eventsFor(chosen.id); expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: "rescheduled", event_key: command.eventKey, actor_id: fixtures[0].user.id });
    expect(await rescheduleStudySessionAction(command)).toEqual({ success: true, sessionId: chosen.id });
    expect(await eventsFor(chosen.id)).toEqual(events); expect(await sessionSnapshot(fixture.scheduleId)).toEqual(after);
    expect(await rescheduleStudySessionAction({ ...command, startTime: "17:00" })).toMatchObject({ success: false });
    const mismatch = await fixtures[0].client.rpc("ls_reschedule_session", { p_session_id: chosen.id,
      p_expected_updated_at: chosen.updated_at, p_new_local_date: command.localDate, p_new_start_time: "17:00", p_new_end_time: "19:00",
      p_new_start_at: "2030-01-08T10:00:00Z", p_new_end_at: "2030-01-08T12:00:00Z", p_event_key: command.eventKey }).abortSignal(AbortSignal.timeout(5000));
    expect(mismatch.error).toMatchObject({ code: "22023", message: "Event key reused with different request" });
    expect(await eventsFor(chosen.id)).toEqual(events); expect(await sessionSnapshot(fixture.scheduleId)).toEqual(after);
    const read = await getStudySessionsAction({ scheduleId: fixture.scheduleId, page: 0 });
    if (!read.success) throw new Error(read.message);
    expect(read.sessions.find(x => x.id === chosen.id)?.updated_at).toBe(after.find(x => x.id === chosen.id)?.updated_at);
  });
  it("stale session version shows conflict/unknown outcome without overwriting winning change", async () => {
    const fixture = await sessionFixture(); const chosen = fixture.rows[0];
    const command = { sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate: "2030-01-08", startTime: "18:00", endTime: "19:00", eventKey: randomUUID() };
    expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: true });
    const before = await sessionSnapshot(fixture.scheduleId); const events = await eventsFor(chosen.id);
    expect(await rescheduleStudySessionAction({ ...command, localDate: "2030-01-09", eventKey: randomUUID() })).toMatchObject({ success: false, conflict: true });
    expect(await sessionSnapshot(fixture.scheduleId)).toEqual(before); expect(await eventsFor(chosen.id)).toEqual(events);
  }, 15000);
  it("overlap is rejected with unchanged rows/audit; adjacent move is allowed", async () => {
    const fixture = await sessionFixture(); const [chosen, other] = fixture.rows;
    const before = await sessionSnapshot(fixture.scheduleId);
    const command = { sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate: other.local_date, startTime: "19:00", endTime: "20:00", eventKey: randomUUID() };
    expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false });
    const overlap = await fixtures[0].client.rpc("ls_reschedule_session", { p_session_id: chosen.id, p_expected_updated_at: chosen.updated_at,
      p_new_local_date: other.local_date, p_new_start_time: "19:00", p_new_end_time: "20:00", p_new_start_at: other.scheduled_start_at,
      p_new_end_at: `${other.local_date}T13:00:00Z`, p_event_key: randomUUID() });
    expect(overlap.error?.code).toBe("23P01");
    expect(await sessionSnapshot(fixture.scheduleId)).toEqual(before); expect(await eventsFor(chosen.id)).toHaveLength(0);
    expect(await rescheduleStudySessionAction({ ...command, startTime: "20:30", endTime: "21:30", eventKey: randomUUID() })).toMatchObject({ success: true, sessionId: chosen.id });
  });
  it("denies cross-owner reschedule and rejects completed/missed/skipped/cancelled/in-progress/past sessions", async () => {
    const fixture = await sessionFixture(); const chosen = fixture.rows[0];
    const command = { sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate: "2030-01-08", startTime: "18:00", endTime: "19:00", eventKey: randomUUID() };
    auth.requireUser.mockResolvedValue({ supabase: fixtures[1].client, user: fixtures[1].user });
    expect(await rescheduleStudySessionAction(command)).toMatchObject({ success: false, message: "Study session not found." });
    auth.requireUser.mockResolvedValue({ supabase: fixtures[0].client, user: fixtures[0].user });
    for (const status of ["completed", "missed", "skipped", "cancelled", "in_progress", "scheduled"]) {
      const updated = await admin.from("task_study_sessions").update({ status,
        completed_at: status === "completed" ? "2026-10-28T01:00:00Z" : null,
        ...(status === "scheduled" ? { local_date: "2020-01-06", scheduled_start_at: "2020-01-06T12:00:00Z", scheduled_end_at: "2020-01-06T13:30:00Z" } : {}),
      }).eq("id", chosen.id).select("updated_at").single();
      expect(updated.error).toBeNull();
      const before = await sessionSnapshot(fixture.scheduleId);
      expect(await rescheduleStudySessionAction({ ...command, expectedUpdatedAt: updated.data!.updated_at, eventKey: randomUUID() })).toMatchObject({ success: false });
      expect(await sessionSnapshot(fixture.scheduleId)).toEqual(before);
    }
    expect(await eventsFor(chosen.id)).toHaveLength(0);
  });
  it("DST gap and later fold are rejected by DB; action rejects gap and chooses earlier fold", async () => {
    for (const localDate of ["2030-03-10", "2030-11-03"]) {
      const fixture = await sessionFixture({ startsOn: localDate, endsOn: localDate, timezone: "America/New_York", slots: [{ weekday: 7, startTime: "12:00", endTime: "13:00" }] });
      const chosen = fixture.rows[0]; const gap = localDate === "2030-03-10";
      const before = await sessionSnapshot(fixture.scheduleId);
      const invalid = await fixtures[0].client.rpc("ls_reschedule_session", { p_session_id: chosen.id, p_expected_updated_at: chosen.updated_at,
        p_new_local_date: localDate, p_new_start_time: gap ? "02:30" : "01:30", p_new_end_time: gap ? "04:00" : "01:45",
        p_new_start_at: gap ? `${localDate}T07:30:00Z` : `${localDate}T06:30:00Z`,
        p_new_end_at: gap ? `${localDate}T08:00:00Z` : `${localDate}T06:45:00Z`, p_event_key: randomUUID() });
      expect(invalid.error?.code).toBe("22023"); expect(await sessionSnapshot(fixture.scheduleId)).toEqual(before);
      expect(await eventsFor(chosen.id)).toHaveLength(0);
      const result = await rescheduleStudySessionAction({ sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate,
        startTime: gap ? "02:30" : "01:30", endTime: gap ? "04:00" : "01:45", eventKey: randomUUID() });
      expect(result.success).toBe(!gap);
      const after = await sessionSnapshot(fixture.scheduleId);
      if (gap) expect(after).toEqual(before);
      else expect(new Date(after[0].scheduled_start_at).toISOString()).toBe(`${localDate}T05:30:00.000Z`);
    }
  });
  it("individual override then whole revision retains reschedule audit and adds cancellation history", async () => {
    const fixture = await sessionFixture(); const chosen = fixture.rows[0]; const key = randomUUID();
    expect(await rescheduleStudySessionAction({ sessionId: chosen.id, expectedUpdatedAt: chosen.updated_at, localDate: "2030-01-08", startTime: "18:00", endTime: "19:00", eventKey: key })).toMatchObject({ success: true, sessionId: chosen.id });
    const prior = (await eventsFor(chosen.id))[0];
    expect(await reviseStudyScheduleAction({ scheduleId: fixture.scheduleId, expectedRevision: 1, ...draft,
      slots: [{ weekday: 2, startTime: "20:00", endTime: "21:00" }] })).toMatchObject({ success: true, revision: 2 });
    const rows = await getStudySessionsAction({ scheduleId: fixture.scheduleId, page: 0 }); if (!rows.success) throw new Error(rows.message);
    expect(rows.sessions.find(x => x.id === chosen.id)).toMatchObject({ status: "cancelled", cancellation_reason: "schedule_changed", local_date: "2030-01-08" });
    const events = await eventsFor(chosen.id); expect(events).toHaveLength(2); expect(events).toContainEqual(prior);
    expect(events.find(x => x.event_type === "cancelled")).toMatchObject({ from_status: "scheduled", to_status: "cancelled", payload: { reason: "schedule_changed" } });
  });
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
      .toMatchObject({ success: false, message: "Task is not eligible for scheduling." });
    expect(await getTaskStudyScheduleAction(root.id)).toMatchObject({ success: true, schedule: null });
  });
  it("rejects subtask scheduling", async () => {
    const parent = await task(); const child = await task("todo", parent.id);
    expect(await createStudyScheduleAction({ taskId: child.id, ...draft }))
      .toMatchObject({ success: false, message: "Task is not eligible for scheduling." });
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
