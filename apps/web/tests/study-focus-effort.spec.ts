import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../types/database.types";
import { generateStudyOccurrences } from "../features/learning-schedule/schedule-engine";
import { submitLoginForm } from "./helpers/auth";

const url = process.env.LEARNING_SCHEDULE_TEST_URL;
const secret = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const key = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const email = `focus-effort-${randomUUID()}@example.invalid`;
const password = randomUUID();
const sql = (statement: string) => execFileSync("docker", [
  "exec", "supabase_db_lumivox-proj", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-c", statement,
], { encoding: "utf8", windowsHide: true }).trim();
let admin: SupabaseClient<Database>;
const users: string[] = [];

test.skip(!url || !secret || !key, "Opt-in: isolated Supabase local required");
test.use({ viewport: { width: 390, height: 844 }, timezoneId: "Pacific/Kiritimati" });

test.afterEach(async () => {
  for (const id of users) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  if (users.length) {
    expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.focus_sessions), (SELECT count(*) FROM public.task_study_focus_attributions)")).toBe("0|0|0|0");
  }
});

test("projects real V2 completion and interruption, reschedule and revision in EN/VI", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  expect(url).toBe("http://127.0.0.1:55321");
  expect(new URL(baseURL!).origin).toBe("http://127.0.0.1:3119");
  expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT enabled FROM public.study_notification_dispatch_control), (SELECT enabled FROM public.ls_missed_sweep_control)")).toBe("0|0|f|f");
  admin = createClient<Database>(url!, secret!, options);
  async function createUser(address: string) {
    const response = await admin.auth.admin.createUser({ email: address, password, email_confirm: true });
    expect(response.error).toBeNull();
    const id = response.data.user!.id;
    users.push(id);
    expect((await admin.from("profiles").upsert({ id, onboarding_completed: true })).error).toBeNull();
    const client = createClient<Database>(url!, key!, options);
    expect((await client.auth.signInWithPassword({ email: address, password })).error).toBeNull();
    return { id, client };
  }
  const owner = await createUser(email);
  const stranger = await createUser(`other-${email}`);
  const task = await admin.from("tasks").insert({ user_id: owner.id, title: "Recorded Focus QA", status: "todo" }).select("id").single();
  expect(task.error).toBeNull();
  const taskId = task.data!.id;
  const day = Temporal.Now.plainDateISO("UTC").add({ days: 1 });
  const date = day.toString();
  const draft = { startsOn: date, endsOn: date, timezone: "UTC", slots: [{ weekday: day.dayOfWeek, startTime: "10:00", endTime: "11:00" }] };
  const schedule = await owner.client.rpc("ls_create_schedule", { p_task_id: taskId,
    p_starts_on: date, p_ends_on: date, p_timezone: "UTC", p_slots: draft.slots, p_occurrences: generateStudyOccurrences(draft) });
  expect(schedule.error).toBeNull();
  const before = await owner.client.from("task_study_sessions").select("id,updated_at").eq("schedule_id", schedule.data!).single();
  expect(before.error).toBeNull();
  const studyId = before.data!.id;

  async function link(focusId: string) {
    expect((await owner.client.rpc("ls_link_study_focus", { p_study_session_id: studyId, p_focus_session_id: focusId })).error).toBeNull();
  }
  async function v2(roundCount: number) {
    const result = await admin.rpc("focus_v2_create_session", {
      p_user_id: owner.id, p_task_id: taskId, p_focus_minutes: 5, p_short_break_minutes: 1, p_long_break_minutes: 5,
      p_round_count: roundCount, p_long_break_every: 4, p_auto_start_breaks: true, p_auto_start_focus: true,
    });
    expect(result.error).toBeNull();
    await link(result.data!);
    return result.data!;
  }
  async function finishSegment(focusId: string, position: number, elapsed: number, action: "complete" | "cancel") {
    const segmentId = sql(`UPDATE public.focus_session_segments SET started_at=clock_timestamp()-interval '${elapsed} seconds'
      WHERE session_id='${focusId}' AND position=${position} AND status='running' RETURNING id`);
    expect(segmentId).toMatch(/^[a-f0-9-]{36}$/);
    const result = await admin.rpc("focus_v2_transition", { p_user_id: owner.id, p_session_id: focusId, p_action: action, p_expected_segment_id: segmentId });
    expect(result.error).toBeNull();
  }
  const completedId = await v2(2);
  await finishSegment(completedId, 1, 302, "complete");
  await finishSegment(completedId, 2, 62, "complete");
  await finishSegment(completedId, 3, 302, "complete");
  const interruptedId = await v2(2);
  await finishSegment(interruptedId, 1, 91, "cancel");

  const persisted = await owner.client.from("focus_session_segments").select("segment_kind,status,actual_seconds").in("session_id", [completedId, interruptedId]);
  expect(persisted.error).toBeNull();
  expect(persisted.data).toContainEqual({ segment_kind: "short_break", status: "completed", actual_seconds: 60 });
  expect(persisted.data?.filter(row => row.segment_kind === "focus" && row.status === "completed")
    .map(row => row.actual_seconds)).toEqual([300, 300]);
  const interrupted = persisted.data?.find(row => row.segment_kind === "focus" && row.status === "interrupted");
  expect(interrupted?.actual_seconds).toBeGreaterThanOrEqual(91);
  expect(interrupted?.actual_seconds).toBeLessThan(120);
  const legacy = await admin.from("focus_sessions").insert({ user_id: owner.id, task_id: taskId, planned_minutes: 10 })
    .select("id").single();
  expect(legacy.error).toBeNull();
  await link(legacy.data!.id);
  expect((await admin.from("focus_sessions").update({ status: "completed", ended_at: new Date().toISOString(), actual_focus_minutes: 7 })
    .eq("id", legacy.data!.id)).error).toBeNull();

  const hidden = await stranger.client.from("focus_sessions").select("id,focus_session_plans(focus_session_segments(id))").in("id", [completedId, interruptedId]);
  expect(hidden.error).toBeNull();
  expect(hidden.data).toEqual([]);
  expect((await stranger.client.from("task_study_focus_attributions").select("id").eq("study_session_id", studyId)).data).toEqual([]);
  expect((await stranger.client.from("task_study_sessions").select("id").eq("id", studyId)).data).toEqual([]);
  expect(sql(`SELECT status || '|' || (SELECT count(*) FROM public.task_study_session_events WHERE session_id = '${studyId}') FROM public.task_study_sessions WHERE id = '${studyId}'`)).toBe("scheduled|0");

  const moved = await owner.client.rpc("ls_reschedule_session", { p_session_id: studyId, p_expected_updated_at: before.data!.updated_at,
    p_new_local_date: date, p_new_start_time: "12:00", p_new_end_time: "13:00",
    p_new_start_at: `${date}T12:00:00Z`, p_new_end_at: `${date}T13:00:00Z`, p_event_key: randomUUID() });
  expect(moved.error).toBeNull();
  expect(moved.data).toBe(studyId);

  await page.goto("/en/auth/login");
  await submitLoginForm(page, email, password);
  await page.waitForURL("**/en/dashboard");
  const month = date.slice(0, 7);
  const oldRow = page.locator(`[data-study-session="${studyId}"]`);
  await page.goto(`/en/study-plan?month=${month}`);
  await expect(oldRow.getByText("Recorded Focus: 18 minutes")).toBeVisible();
  await oldRow.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(oldRow.getByText("Planned study time: 60 minutes")).toBeVisible();
  await expect(oldRow.getByText(/12:00–13:00/)).toBeVisible();
  // 12:00 UTC is 02:00 on the following day in this browser's timezone.
  await expect(oldRow.locator("time")).toHaveAttribute("datetime", date);
  await expect(oldRow.getByText(/12:00–13:00 · UTC/)).toBeVisible();

  const next = { ...draft, slots: [{ weekday: day.dayOfWeek, startTime: "14:00", endTime: "15:00" }] };
  const revised = await owner.client.rpc("ls_revise_schedule", { p_schedule_id: schedule.data!, p_expected_revision: 1,
    p_starts_on: date, p_ends_on: date, p_timezone: "UTC", p_slots: next.slots, p_occurrences: generateStudyOccurrences(next) });
  expect(revised.error).toBeNull();
  const replacement = await owner.client.from("task_study_sessions").select("id").eq("schedule_id", schedule.data!).eq("schedule_revision", 2).single();
  expect(replacement.error).toBeNull();
  for (const locale of ["en", "vi"]) {
    await page.goto(`/${locale}/study-plan?month=${month}`);
    await expect(oldRow.getByText(locale === "en" ? "Recorded Focus: 18 minutes" : "Focus đã ghi nhận: 18 phút")).toBeVisible();
    await expect(oldRow.getByText(locale === "en" ? "Cancelled" : "Đã hủy", { exact: true })).toBeVisible();
    await expect(page.locator(`[data-study-session="${replacement.data!.id}"]`)
      .getByText(locale === "en" ? "Recorded Focus: 0 minutes" : "Focus đã ghi nhận: 0 phút")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  // Populate historical Legacy rows directly on the isolated test DB to exercise real PostgREST paging.
  sql(`WITH parents AS (
    INSERT INTO public.focus_sessions (user_id, task_id, planned_minutes, status, ended_at, actual_focus_minutes)
    SELECT '${owner.id}', '${taskId}', 5, 'completed', clock_timestamp(), 1 FROM generate_series(1, 201)
    RETURNING id
  )
  INSERT INTO public.task_study_focus_attributions (user_id, task_id, study_session_id, focus_session_id)
  SELECT '${owner.id}', '${taskId}', '${replacement.data!.id}', id FROM parents`);
  await page.goto(`/en/study-plan?month=${month}`);
  await expect(page.locator(`[data-study-session="${replacement.data!.id}"]`)
    .getByText("Recorded Focus: 201 minutes")).toBeVisible();

  sql(`DELETE FROM public.focus_session_segments WHERE session_id='${interruptedId}' AND position=3 AND status='pending'`);
  await page.reload();
  await expect(page.getByText("Recorded Focus could not be loaded.")).toBeVisible();
  await expect(oldRow.getByText("Recorded Focus: 18 minutes")).toHaveCount(0);
  await expect(page.getByText("Attendance", { exact: true })).toBeVisible();
  console.log(`Recorded seconds: Legacy 420 + completed V2 600 + interrupted V2 ${interrupted!.actual_seconds}. Break 60 excluded.`);
});
