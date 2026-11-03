import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";
import { submitLoginForm } from "./helpers/auth";
import { generateStudyOccurrences } from "../features/learning-schedule/schedule-engine";

const url = process.env.LEARNING_SCHEDULE_TEST_URL, serviceKey = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY, publicKey = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
test.skip(!url || !serviceKey || !publicKey, "Opt-in: Supabase local credentials required");
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ timezoneId: "Europe/London" });
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const email = `planner-e2e-${randomUUID()}@example.invalid`, password = randomUUID();
let admin: SupabaseClient, owner: SupabaseClient, userId: string, otherId: string;
let rows: { id: string; taskId: string; title: string; date: string; zone: string; status: string }[] = [];
let revisedSchedule: string;
let plannerErrors: string[] = [];
const report = { baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), startedAt: new Date().toISOString(),
  runs: [] as { name: string; status: string | undefined }[], fixtureSummary: {} as Record<string, unknown> };
function sql(query: string) { return execFileSync("docker", ["exec", "supabase_db_lumivox-proj", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-c", query], { encoding: "utf8", windowsHide: true }).trim(); }
async function task(title: string, id = userId) {
  const r = await admin.from("tasks").insert({ user_id: id, title, status: "todo" }).select("id").single(); expect(r.error).toBeNull(); return r.data!.id as string;
}
async function fixture(zone: string, status: "completed" | "skipped", title: string) {
  const now = Temporal.Now.instant(), day = now.toZonedDateTimeISO(zone).toPlainDate();
  const start = day.toZonedDateTime({ timeZone: zone, plainTime: "12:00" }), end = start.add({ hours: 1 });
  const taskId = await task(title);
  const schedule = await admin.from("task_study_schedules").insert({ user_id: userId, task_id: taskId, starts_on: day.toString(), ends_on: day.toString(), timezone: zone }).select("id").single(); expect(schedule.error).toBeNull();
  const session = await admin.from("task_study_sessions").insert({ user_id: userId, task_id: taskId, schedule_id: schedule.data!.id,
    schedule_revision: 1, logical_occurrence_key: randomUUID(), local_date: day.toString(), local_start_time: "12:00", local_end_time: "13:00",
    timezone: zone, scheduled_start_at: start.toInstant().toString(), scheduled_end_at: end.toInstant().toString(), status,
    completed_at: status === "completed" ? now.toString() : null }).select("id").single(); expect(session.error).toBeNull();
  return { id: session.data!.id as string, taskId, title, date: day.toString(), zone, status };
}
test.beforeAll(async ({ baseURL }) => {
  const api = new URL(url!), web = new URL(baseURL!);
  expect(api.protocol).toBe("http:"); expect(api.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(api.port).toBe("55321");
  expect(web.protocol).toBe("http:"); expect(web.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(sql("SELECT enabled FROM public.ls_missed_sweep_control WHERE singleton=true")).toBe("f");
  admin = createClient(url!, serviceKey!, options);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true }); expect(created.error).toBeNull(); userId = created.data.user!.id;
  expect((await admin.from("profiles").upsert({ id: userId, onboarding_completed: true })).error).toBeNull();
  owner = createClient(url!, publicKey!, options); expect((await owner.auth.signInWithPassword({ email, password })).error).toBeNull();
  const other = await admin.auth.admin.createUser({ email: `planner-other-${randomUUID()}@example.invalid`, password: randomUUID(), email_confirm: true }); expect(other.error).toBeNull(); otherId = other.data.user!.id;
  expect((await admin.from("profiles").upsert({ id: otherId, onboarding_completed: true })).error).toBeNull();
  await task("PRIVATE OTHER OWNER PLANNER", otherId);
  const privateTask = await admin.from("tasks").select("id").eq("user_id", otherId).single(); expect(privateTask.error).toBeNull();
  const privateDay = Temporal.Now.plainDateISO("UTC").toString();
  const privateSchedule = await admin.from("task_study_schedules").insert({ user_id: otherId, task_id: privateTask.data!.id, starts_on: privateDay, ends_on: privateDay, timezone: "UTC" }).select("id").single(); expect(privateSchedule.error).toBeNull();
  expect((await admin.from("task_study_sessions").insert({ user_id: otherId, task_id: privateTask.data!.id, schedule_id: privateSchedule.data!.id,
    schedule_revision: 1, logical_occurrence_key: randomUUID(), local_date: privateDay, local_start_time: "12:00", local_end_time: "13:00", timezone: "UTC",
    scheduled_start_at: `${privateDay}T12:00:00Z`, scheduled_end_at: `${privateDay}T13:00:00Z`, status: "scheduled" })).error).toBeNull();
  // These two IANA zones are 26 hours apart, so their local dates differ at every instant.
  rows = [await fixture("Pacific/Kiritimati", "completed", "Planner Algebra Completed"), await fixture("Etc/GMT+12", "skipped", "Planner Languages Skipped")];
  expect(rows[0].date).not.toBe(rows[1].date);
  // Real authenticated generation/revision RPC produces the historical audit.
  const taskId = await task("Planner Revision History");
  const draft = { startsOn: "2030-12-30", endsOn: "2031-01-06", timezone: "UTC", slots: [{ weekday: 1, startTime: "19:00", endTime: "20:00" }] };
  const createdSchedule = await owner.rpc("ls_create_schedule", { p_task_id: taskId, p_starts_on: draft.startsOn, p_ends_on: draft.endsOn, p_timezone: draft.timezone, p_slots: draft.slots, p_occurrences: generateStudyOccurrences(draft) });
  expect(createdSchedule.error).toBeNull(); revisedSchedule = createdSchedule.data!;
  const next = { ...draft, slots: [{ weekday: 1, startTime: "20:00", endTime: "21:00" }] };
  const revised = await owner.rpc("ls_revise_schedule", { p_schedule_id: revisedSchedule, p_expected_revision: 1, p_starts_on: next.startsOn, p_ends_on: next.endsOn, p_timezone: next.timezone, p_slots: next.slots, p_occurrences: generateStudyOccurrences(next) });
  expect(revised.error).toBeNull(); expect(revised.data).toBe(2);
  report.fixtureSummary = { sessions: rows, revision: 2, scheduleId: revisedSchedule, browserTimezone: "Europe/London", baseURL: web.origin, apiOrigin: api.origin };
});
test.beforeEach(async ({ page }) => {
  plannerErrors = [];
  const collect = (message: string) => {
    if (page.url().includes("/study-plan")) plannerErrors.push(message.replaceAll(password, "[redacted]").replaceAll(serviceKey!, "[redacted]"));
  };
  page.on("pageerror", error => collect(error.message));
  page.on("console", message => { if (message.type() === "error") collect(message.text()); });
  await page.goto("/en/auth/login"); await submitLoginForm(page, email, password); await page.waitForURL("**/en/dashboard");
});
test.afterEach(async ({ page }, info) => {
  const run = { name: info.title, status: info.status };
  try {
    await expect(page.getByText("PRIVATE OTHER OWNER PLANNER", { exact: true })).toHaveCount(0);
    expect(plannerErrors).toEqual([]);
  } catch (error) { run.status = "failed"; throw error; }
  finally { report.runs.push(run); }
});
test.afterAll(async () => {
  const failures: string[] = [];
  if (owner) await owner.auth.signOut();
  for (const id of [userId, otherId].filter(Boolean)) {
    const deleted = await admin.auth.admin.deleteUser(id); if (deleted.error) failures.push("Auth cleanup failed");
    for (const table of ["tasks", "task_study_schedules", "task_study_sessions", "task_study_session_events"]) {
      const r = await admin.from(table).select("id", { count: "exact", head: true }).eq("user_id", id);
      if (r.error || r.count !== 0) failures.push(`${table} cleanup incomplete`);
    }
  }
  expect(failures).toEqual([]);
  const gate = sql("SELECT enabled FROM public.ls_missed_sweep_control WHERE singleton=true"); expect(gate).toBe("f");
  writeFileSync(resolve("../../docs/learning-schedule/phase-06-study-plan-browser.json"), JSON.stringify({ ...report, finishedAt: new Date().toISOString(), cleanup: "PASS", sweepGateAfter: false }, null, 2) + "\n");
});
test("SP-01 real Today across two Tasks/zones; Completed/Skipped and existing Task deep link", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/en/study-plan"); await expect(page.getByRole("heading", { name: "Study Planner", exact: true })).toBeVisible();
  const today = page.getByTestId("todays-study-plan");
  for (const row of rows) {
    const item = today.locator(`[data-study-session="${row.id}"]`); await expect(item).toContainText(row.title); await expect(item).toContainText(row.date);
    await expect(item).toContainText(row.zone); await expect(item).toContainText(row.status === "completed" ? "Completed" : "Skipped");
    await expect(item.getByRole("link")).toHaveAttribute("href", `/en/workspace?task=${row.taskId}`);
  }
  await expect(today.locator("[data-study-session]")).toHaveCount(2);
  await today.getByRole("link", { name: rows[0].title }).click();
  await page.waitForURL(`**/en/workspace?task=${rows[0].taskId}`);
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 30_000 }); await expect(page.getByRole("dialog")).toContainText(rows[0].title);
  expect(errors).toEqual([]);
});
test("SP-02 real revision/cancellation history and keyboard month rollover", async ({ page }) => {
  await page.goto("/en/study-plan?month=2030-12");
  const calendar = page.getByTestId("study-calendar"); await expect(calendar.getByRole("heading", { name: "December 2030" })).toBeVisible();
  const day = calendar.locator('[data-calendar-date="2030-12-30"]'); await expect(day).toContainText("2 sessions"); await expect(day).toContainText("Cancelled"); await expect(day).toContainText("Scheduled");
  await expect(calendar.locator("[data-study-session]")).toHaveCount(2);
  const next = page.getByRole("link", { name: "Next month", exact: true }); await next.focus(); await page.keyboard.press("Enter");
  await expect(calendar.getByRole("heading", { name: "January 2031" })).toBeVisible();
  await expect(calendar.locator('[data-calendar-date="2031-01-06"]')).toContainText("2 sessions");
  await page.getByRole("link", { name: "Previous month", exact: true }).click(); await expect(calendar.getByRole("heading", { name: "December 2030" })).toBeVisible();
  const history = await owner.from("task_study_sessions").select("id,status").eq("schedule_id", revisedSchedule); expect(history.error).toBeNull(); expect(history.data).toHaveLength(4);
  const audits = await owner.from("task_study_session_events").select("id,event_type").in("session_id", history.data!.map(r => r.id)).eq("event_type", "cancelled");
  expect(audits.error).toBeNull(); expect(audits.data).toHaveLength(2);
});
test("SP-03 EN/VI mobile, empty/error states and anonymous protection", async ({ page, browser, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dir = resolve("../../docs/learning-schedule/evidence/step-6c"); mkdirSync(dir, { recursive: true });
  for (const locale of ["en", "vi"]) {
    await page.goto(`/${locale}/study-plan`); await expect(page.getByTestId("todays-study-plan").locator("[data-study-session]")).toHaveCount(2);
    await expect(page.getByRole("heading", { name: locale === "en" ? "Today's Study Plan" : "Kế hoạch học hôm nay", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(dir, `planner-${locale}-mobile.png`), fullPage: true });
  }
  await page.goto("/vi/study-plan?month=2040-02"); await expect(page.getByText("Tháng này không có buổi học nào.", { exact: true })).toBeVisible();
  await page.goto("/vi/study-plan?month=2026-13"); await expect(page.getByRole("main").getByRole("alert")).toContainText("Hãy chọn tháng hợp lệ.");
  const anonymous = await browser.newContext({ baseURL }); const other = await anonymous.newPage();
  try { await other.goto("/en/study-plan"); await expect(other).toHaveURL(/\/en\/auth\/login/); } finally { await anonymous.close(); }
});
