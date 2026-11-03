// @vitest-environment node
// LOCAL ONLY: a genuine authenticated Task-close is committed after page 1's
// HTTP response and before page 2. No snapshot/clock/DB response is mocked.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/types/database.types";
import { generateStudyOccurrences } from "./schedule-engine";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: auth.requireUser }));
import { getStudyPlanAction } from "./study-plan.queries.actions";
const url = process.env.LEARNING_SCHEDULE_TEST_URL, publicKey = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY, serviceKey = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
describe.skipIf(!url || !publicKey || !serviceKey)("local Study Planner interleaved read characterization", () => {
  let admin: SupabaseClient<Database>, owner: SupabaseClient<Database>, user: User;
  beforeAll(async () => {
    const api = new URL(url!); expect(api.protocol).toBe("http:"); expect(api.hostname).toMatch(/^(localhost|127\.0\.0\.1)$/); expect(api.port).toBe("55321");
    admin = createClient<Database>(url!, serviceKey!, options); owner = createClient<Database>(url!, publicKey!, options);
    const email = `planner-read-race-${randomUUID()}@example.invalid`, password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(created.error).toBeNull(); user = created.data.user!;
    expect((await admin.from("profiles").upsert({ id: user.id })).error).toBeNull(); expect((await owner.auth.signInWithPassword({ email, password })).error).toBeNull();
  }, 30000);
  afterAll(async () => {
    if (!user) return; await owner.auth.signOut(); expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
    for (const table of ["tasks", "task_study_schedules", "task_study_sessions", "task_study_session_events"] as const) {
      const r = await admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", user.id); expect(r.error).toBeNull(); expect(r.count).toBe(0);
    }
  }, 30000);
  it("SP-09 rejects mixed scheduled/cancelled pages after a real Task-close; a fresh read succeeds", async () => {
    const task = await owner.from("tasks").insert({ user_id: user.id, title: "Planner read interleave", status: "todo" }).select("id").single(); expect(task.error).toBeNull();
    const draft = { startsOn: "2030-01-01", endsOn: "2030-12-31", timezone: "UTC",
      slots: Array.from({ length: 7 }, (_, i) => [{ weekday: i + 1, startTime: "10:00", endTime: "11:00" }, { weekday: i + 1, startTime: "14:00", endTime: "15:00" }]).flat() };
    const occurrences = generateStudyOccurrences(draft); expect(occurrences).toHaveLength(730);
    const created = await owner.rpc("ls_create_schedule", { p_task_id: task.data!.id, p_starts_on: draft.startsOn, p_ends_on: draft.endsOn,
      p_timezone: draft.timezone, p_slots: draft.slots, p_occurrences: occurrences }); expect(created.error).toBeNull();
    let closed = false; const observedPageSizes: number[] = [];
    const readClient = createClient<Database>(url!, publicKey!, { ...options, global: { fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (String(input).includes("/rest/v1/task_study_sessions?") && (init?.method ?? "GET") === "GET") {
        const page = await response.clone().json(); if (Array.isArray(page)) observedPageSizes.push(page.length);
        if (!closed && response.ok) {
          expect(page).toHaveLength(500); closed = true;
          const mutation = await owner.from("tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", task.data!.id).select("id").single();
          expect(mutation.error).toBeNull();
        }
      }
      return response;
    } } });
    const session = (await owner.auth.getSession()).data.session!;
    expect((await readClient.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })).error).toBeNull();
    auth.requireUser.mockResolvedValue({ supabase: readClient, user });
    expect(await getStudyPlanAction({ month: "2030-01" })).toEqual({ success: false, code: "incompleteData" });
    expect(closed).toBe(true); expect(observedPageSizes).toEqual([500, 230]);
    const cancelled = await owner.from("task_study_sessions").select("id", { count: "exact", head: true }).eq("schedule_id", created.data!).eq("status", "cancelled");
    expect(cancelled.error).toBeNull(); expect(cancelled.count).toBe(730);
    const audits = await owner.from("task_study_session_events").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "cancelled");
    expect(audits.error).toBeNull(); expect(audits.count).toBe(730);
    auth.requireUser.mockResolvedValue({ supabase: owner, user });
    const fresh = await getStudyPlanAction({ month: "2030-01" }); expect(fresh).toMatchObject({ success: true, today: [], summary: { eligiblePlanned: 0, plannedCoverage: null } });
    if (!fresh.success) throw new Error(fresh.code); expect(fresh.calendar.flatMap(day => day.sessions)).toHaveLength(62);
    // This detects this interleave only. It does NOT establish an atomic snapshot
    // or detection of every same-cardinality reschedule/completion.
  }, 60000);
});
