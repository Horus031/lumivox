// @vitest-environment node
// LOCAL ONLY. Admin credentials are used solely to create/delete isolated test
// users. The production read action receives each user's authenticated client.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { generateStudyOccurrences } from "./schedule-engine";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
import { getAttendanceSummaryAction } from "./attendance-analytics.queries.actions";

const url = process.env.LEARNING_SCHEDULE_TEST_URL;
const publicKey = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
const serviceKey = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const enabled = Boolean(url && publicKey && serviceKey);
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const draft = {
  startsOn: "2030-01-07",
  endsOn: "2030-01-21",
  timezone: "UTC",
  slots: [{ weekday: 1, startTime: "19:00", endTime: "20:00" }],
};

describe.skipIf(!enabled)("local analytics projection with real Auth/RLS/RPC history", () => {
  let admin: SupabaseClient<Database>;
  const fixtures: { client: SupabaseClient<Database>; user: User }[] = [];
  beforeAll(async () => {
    const endpoint = new URL(url!);
    expect(["localhost", "127.0.0.1"]).toContain(endpoint.hostname);
    expect(endpoint.protocol).toBe("http:");
    expect(endpoint.port).toBe("55321");
    admin = createClient<Database>(url!, serviceKey!, options);
    for (let i = 0; i < 2; i++) {
      const email = `analytics-integration-${randomUUID()}@example.invalid`;
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
  beforeEach(() =>
    auth.requireUser.mockResolvedValue({ supabase: fixtures[0].client, user: fixtures[0].user }),
  );
  afterAll(async () => {
    const failures: string[] = [];
    for (const { client, user } of fixtures) {
      await client.auth.signOut();
      const deleted = await admin.auth.admin.deleteUser(user.id);
      if (deleted.error) failures.push(`user cleanup: ${deleted.error.code}`);
      for (const table of [
        "tasks",
        "task_study_schedules",
        "task_study_sessions",
        "task_study_session_events",
      ] as const) {
        const remaining = await admin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (remaining.error || remaining.count !== 0) failures.push(`${table}: cleanup incomplete`);
      }
    }
    expect(failures).toEqual([]);
  }, 30000);
  async function fixture() {
    const { client, user } = fixtures[0];
    const task = await client
      .from("tasks")
      .insert({ title: "Analytics local integration", user_id: user.id, status: "todo" })
      .select("id")
      .single();
    expect(task.error).toBeNull();
    const created = await client.rpc("ls_create_schedule", {
      p_task_id: task.data!.id,
      p_starts_on: draft.startsOn,
      p_ends_on: draft.endsOn,
      p_timezone: draft.timezone,
      p_slots: draft.slots,
      p_occurrences: generateStudyOccurrences(draft),
    });
    expect(created.error).toBeNull();
    return { client, taskId: task.data!.id, scheduleId: created.data! };
  }
  it("maps preserved reschedule identity, all revision history and Task-close cancellation audits", async () => {
    const { client, taskId, scheduleId } = await fixture();
    const before = await client
      .from("task_study_sessions")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("scheduled_start_at");
    expect(before.error).toBeNull();
    expect(before.data).toHaveLength(3);
    const chosen = before.data![0];
    const rescheduled = await client.rpc("ls_reschedule_session", {
      p_session_id: chosen.id,
      p_expected_updated_at: chosen.updated_at,
      p_new_local_date: "2030-01-08",
      p_new_start_time: "18:00",
      p_new_end_time: "19:00",
      p_new_start_at: "2030-01-08T18:00:00Z",
      p_new_end_at: "2030-01-08T19:00:00Z",
      p_event_key: randomUUID(),
    });
    expect(rescheduled.error).toBeNull();
    expect(rescheduled.data).toBe(chosen.id);
    expect(await getAttendanceSummaryAction({ scheduleId })).toMatchObject({
      success: true,
      summary: { eligiblePlanned: 3, eligibleDue: 0, plannedCoverage: 0, attendanceRate: null },
    });
    const next = { ...draft, slots: [{ weekday: 1, startTime: "20:00", endTime: "21:00" }] };
    const revised = await client.rpc("ls_revise_schedule", {
      p_schedule_id: scheduleId,
      p_expected_revision: 1,
      p_starts_on: next.startsOn,
      p_ends_on: next.endsOn,
      p_timezone: next.timezone,
      p_slots: next.slots,
      p_occurrences: generateStudyOccurrences(next),
    });
    expect(revised.error).toBeNull();
    expect(revised.data).toBe(2);
    const history = await client
      .from("task_study_sessions")
      .select("*")
      .eq("schedule_id", scheduleId);
    expect(history.error).toBeNull();
    expect(history.data).toHaveLength(6);
    expect(history.data!.find((r) => r.id === chosen.id)).toMatchObject({
      logical_occurrence_key: chosen.logical_occurrence_key,
      status: "cancelled",
      source_slot_id: null,
    });
    expect(
      history.data!.filter((r) => r.schedule_revision === 1 && r.status === "cancelled"),
    ).toHaveLength(3);
    expect(await getAttendanceSummaryAction({ scheduleId })).toMatchObject({
      success: true,
      summary: { eligiblePlanned: 3, eligibleDue: 0, plannedCoverage: 0 },
    });
    const closed = await client
      .from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", taskId)
      .select("id")
      .single();
    expect(closed.error).toBeNull();
    const audits = await client
      .from("task_study_session_events")
      .select("*")
      .in(
        "session_id",
        history.data!.map((r) => r.id),
      );
    expect(audits.error).toBeNull();
    expect(audits.data!.filter((e) => e.event_type === "rescheduled")).toHaveLength(1);
    expect(audits.data!.filter((e) => e.event_type === "cancelled")).toHaveLength(6);
    expect(
      audits.data!.filter(
        (e) =>
          e.event_type === "cancelled" &&
          (e.payload as { reason?: string }).reason === "task_closed",
      ),
    ).toHaveLength(3);
    expect(await getAttendanceSummaryAction({ scheduleId })).toMatchObject({
      success: true,
      summary: { eligiblePlanned: 0, eligibleDue: 0, attendanceRate: null, plannedCoverage: null },
    });
  }, 30000);
  it("denies another authenticated owner through actual RLS", async () => {
    const { scheduleId } = await fixture();
    const { client, user } = fixtures[1];
    auth.requireUser.mockResolvedValue({ supabase: client, user });
    expect(await getAttendanceSummaryAction({ scheduleId })).toEqual({
      success: false,
      code: "notAuthorized",
    });
    const direct = await client
      .from("task_study_sessions")
      .select("id")
      .eq("schedule_id", scheduleId);
    expect(direct.error).toBeNull();
    expect(direct.data).toEqual([]);
  });
});
