import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { Temporal } from "@js-temporal/polyfill";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../types/database.types";
import { submitLoginForm } from "./helpers/auth";
import { startLocalFocusProxy } from "./helpers/local-focus-proxy";

const url = process.env.LEARNING_SCHEDULE_TEST_URL;
const service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const backend = process.env.STUDY_FOCUS_TEST_BACKEND;
const proxyPort = process.env.STUDY_FOCUS_TEST_PROXY_PORT;
const psql = ["exec", "-i", "supabase_db_lumivox-proj", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const sql = (query: string) => execFileSync("docker", [...psql, "-c", query], { encoding: "utf8", windowsHide: true }).trim();
let admin: SupabaseClient<Database>;
let userId: string | undefined;
let stopProxy: (() => Promise<void>) | undefined;

test.skip(!url || !service || !backend || !proxyPort, "Opt-in: local Next/FastAPI/Supabase stack required");
test.use({ viewport: { width: 768, height: 900 }, timezoneId: "Pacific/Kiritimati", actionTimeout: 12_000 });

test.afterEach(async () => {
  await stopProxy?.();
  if (userId) {
    expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull();
    expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.focus_sessions), (SELECT count(*) FROM public.task_study_focus_launches)")).toBe("0|0|0|0");
  }
});

test("Task and Schedule to multi-round Focus, interrupted Focus and concurrent manual Attendance", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  expect(url).toBe("http://127.0.0.1:55321");
  expect(new URL(baseURL!).origin).toBe("http://127.0.0.1:3119");
  expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT enabled FROM public.study_notification_dispatch_control), (SELECT enabled FROM public.ls_missed_sweep_control)")).toBe("0|0|f|f");
  const launches: string[] = [];
  stopProxy = await startLocalFocusProxy(backend!, proxyPort!, (_request, response) => {
    launches.push(String(response.session_id));
    return false;
  });
  const email = `study-journey-${randomUUID()}@example.invalid`, password = randomUUID();
  admin = createClient<Database>(url!, service!, { auth: { persistSession: false } });
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(user.error).toBeNull();
  userId = user.data.user!.id;
  expect((await admin.from("profiles").upsert({ id: userId, onboarding_completed: true })).error).toBeNull();
  const workspace = "/en/workspace?goal=all";
  const title = "Full learning journey";
  await page.goto("/en/auth/login");
  await submitLoginForm(page, email, password);
  await page.waitForURL("**/en/dashboard");
  await page.goto(workspace);
  const todo = page.locator('[data-status="todo"]');
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await todo.getByRole("textbox", { name: "Task title" }).fill(title);
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await expect.poll(() => sql(`SELECT count(*) FROM public.tasks WHERE user_id='${userId}' AND title='Full learning journey'`)).toBe("1");
  await page.goto(workspace);
  const openTask = async (tab: typeof page) => {
    await tab.locator("article").filter({ hasText: title }).getByRole("button").first().click();
    await tab.getByRole("tab", { name: "Overview", exact: true }).click();
    return tab.getByRole("region", { name: "Task study schedule", exact: true });
  };
  const schedule = await openTask(page);
  await schedule.getByRole("button", { name: "Add study schedule" }).click();
  const now = Temporal.Now.instant();
  const utcHour = now.toZonedDateTimeISO("UTC").hour;
  const zone = utcHour >= 2 && utcHour <= 21 ? "UTC" : "Etc/GMT+12";
  const start = now.subtract({ minutes: 5 }).toZonedDateTimeISO(zone).round({ smallestUnit: "minute", roundingMode: "floor" });
  const end = start.add({ minutes: 60 });
  const date = start.toPlainDate().toString();
  const wall = (value: typeof start) => value.toPlainTime().toString({ smallestUnit: "minute" });
  await page.getByLabel("End date", { exact: true }).fill(date);
  await page.getByLabel("Start date", { exact: true }).fill(date);
  await page.getByLabel("IANA timezone", { exact: true }).fill(zone);
  await page.getByLabel("Weekday", { exact: true }).selectOption(String(start.dayOfWeek));
  await page.getByLabel("Start", { exact: true }).fill(wall(start));
  await page.getByLabel("End", { exact: true }).fill(wall(end));
  await schedule.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(schedule.getByText("Revision: 1", { exact: true })).toBeVisible();
  const study = await admin.from("task_study_sessions").select("id,task_id").eq("user_id", userId).single();
  expect(study.error).toBeNull();
  const { id, task_id: taskId } = study.data!;
  const planner = `/en/study-plan?month=${date.slice(0, 7)}`;
  const row = page.getByTestId("todays-study-plan").locator(`[data-study-session="${id}"]`);
  const status = () => sql(`SELECT status FROM public.task_study_sessions WHERE id='${id}'`);
  const events = () => sql(`SELECT coalesce(string_agg(event_type, ',' ORDER BY created_at), '') FROM public.task_study_session_events WHERE session_id='${id}'`);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

  async function launch(rounds: number) {
    await page.goto(planner);
    const entry = row.getByRole("link", { name: "Start Focus", exact: true });
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(`Study session for ${title}`)).toBeVisible();
    await page.getByLabel("Study minutes per round", { exact: true }).fill("5");
    await page.getByLabel("Short break minutes", { exact: true }).fill("1");
    await page.getByLabel("Number of rounds", { exact: true }).fill(String(rounds));
    await page.getByRole("checkbox", { name: /Automatically start breaks/ }).check();
    await page.getByRole("checkbox", { name: /Automatically start the next study round/ }).check();
    await page.locator("form button[type=submit]").click();
    await page.waitForURL("**/en/focus");
    await expect(page.getByRole("timer")).toBeVisible();
    const focusId = launches.at(-1)!;
    expect(sql(`SELECT a.task_id || '|' || a.study_session_id || '|' || p.round_count || '|' ||
      (SELECT count(*) FROM public.focus_session_segments WHERE session_id=a.focus_session_id)
      FROM public.task_study_focus_attributions a JOIN public.task_study_focus_launches l USING(focus_session_id)
      JOIN public.focus_session_plans p ON p.session_id=a.focus_session_id WHERE a.focus_session_id='${focusId}'`))
      .toBe(`${taskId}|${id}|${rounds}|${2 * rounds - 1}`);
    return focusId;
  }
  function ageSegment(focusId: string, position: number, seconds: number) {
    expect(sql(`UPDATE public.focus_session_segments SET started_at=clock_timestamp()-interval '${seconds} seconds'
      WHERE session_id='${focusId}' AND position=${position} AND status='running' RETURNING position`)).toBe(String(position));
  }
  async function complete(focusId: string, position: number, seconds: number) {
    ageSegment(focusId, position, seconds);
    await page.reload();
    await expect.poll(() => sql(`SELECT status FROM public.focus_session_segments WHERE session_id='${focusId}' AND position=${position}`)).toBe("completed");
  }
  const first = await launch(2);
  await page.goto(planner);
  await expect(row.getByText("Recorded Focus: 0 minutes")).toBeVisible();
  await row.locator("summary").click();
  await expect(row.getByText("Focus is active. Only saved time is included.")).toBeVisible();
  await expect(row.getByText(zone, { exact: false })).toBeVisible();
  expect(await overflow()).toBe(false);
  await page.goto("/en/focus");
  await complete(first, 1, 302);
  await complete(first, 2, 62);
  await complete(first, 3, 302);
  expect(sql(`SELECT status FROM public.focus_sessions WHERE id='${first}'`)).toBe("completed");
  expect(status()).toBe("scheduled");
  expect(events()).toBe("");

  const second = await launch(1);
  ageSegment(second, 1, 91);
  await page.reload();
  await page.getByRole("button", { name: "End session early", exact: true }).click();
  await page.getByRole("alertdialog", { name: "End session early" })
    .getByRole("button", { name: "End session early", exact: true }).click();
  await expect.poll(() => sql(`SELECT status FROM public.focus_sessions WHERE id='${second}'`)).toBe("cancelled");
  const interrupted = Number(sql(`SELECT actual_seconds FROM public.focus_session_segments WHERE session_id='${second}' AND status='interrupted'`));
  expect(interrupted).toBeGreaterThanOrEqual(91);
  expect(interrupted).toBeLessThan(120);

  const third = await launch(1);
  const attendance = await context.newPage();
  await attendance.goto(workspace);
  await (await openTask(attendance)).getByRole("button", { name: "Complete", exact: true }).click();
  const confirmation = attendance.getByRole("dialog", { name: "Complete study session" }).getByRole("button", { name: "Confirm completion" });
  await expect(confirmation).toBeVisible();
  const locker = spawn("docker", psql, { windowsHide: true });
  const exited = once(locker, "exit");
  const lines = createInterface({ input: locker.stdout });
  try {
    const pidLine = once(lines, "line");
    locker.stdin.write(`BEGIN; SET LOCAL application_name='step-9d-attendance-lock';
      SELECT id FROM public.task_study_sessions WHERE id='${id}' FOR UPDATE;\n`);
    const [lockedId] = await pidLine;
    expect(lockedId).toBe(id);
    await confirmation.click();
    await expect.poll(() => Number(sql(`SELECT count(*) FROM pg_stat_activity waiting
      JOIN pg_stat_activity holder ON holder.pid=ANY(pg_blocking_pids(waiting.pid))
      WHERE holder.application_name='step-9d-attendance-lock'`))).toBeGreaterThan(0);
    await page.bringToFront();
    await complete(third, 1, 302);
    expect(status()).toBe("scheduled");
    expect(events()).toBe("");
  } finally {
    locker.stdin.end("ROLLBACK;\n");
    await exited;
    lines.close();
  }
  await expect.poll(status).toBe("completed");
  expect(events()).toBe("completed");
  const recovery = await admin.rpc("ls_learning_schedule_operational_snapshot");
  expect(recovery.error).toBeNull();
  expect(recovery.data).toMatchObject({ focus: { activeSessions: 0 }, missedSweep: { enabled: false } });
  await expect(attendance.getByRole("region", { name: "Task study schedule" }).getByText("Completed", { exact: true })).toBeVisible();
  const saved = sql(`SELECT count(DISTINCT f.id) || '|' || sum(seg.actual_seconds) FILTER (WHERE seg.segment_kind='focus') || '|' ||
    sum(seg.actual_seconds) FILTER (WHERE seg.segment_kind <> 'focus')
    FROM public.task_study_focus_attributions a JOIN public.focus_sessions f ON f.id=a.focus_session_id
    JOIN public.focus_session_segments seg ON seg.session_id=f.id WHERE a.study_session_id='${id}'`);
  expect(saved).toBe(`3|${900 + interrupted}|60`);
  await page.goto(planner);
  await expect(row.getByText("Completed", { exact: true })).toBeVisible();
  await expect(row.getByText("Recorded Focus: 16 minutes")).toBeVisible();
  expect(await overflow()).toBe(false);
  console.log(`E2E-18 blocker observed, Focus completed while Attendance waited; both committed. 3 Focus IDs, ${900 + interrupted}s focus, 60s break, one manual event.`);
});
