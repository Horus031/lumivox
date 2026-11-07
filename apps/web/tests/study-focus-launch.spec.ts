import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { Temporal } from "@js-temporal/polyfill";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../types/database.types";
import { submitLoginForm } from "./helpers/auth";
import { startLocalFocusProxy } from "./helpers/local-focus-proxy";

const api = process.env.LEARNING_SCHEDULE_TEST_URL;
const service = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
const anon = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;
const backend = process.env.STUDY_FOCUS_TEST_BACKEND;
const proxyPort = process.env.STUDY_FOCUS_TEST_PROXY_PORT;
const internalKey = process.env.AI_INTERNAL_API_KEY;
const path = "/api/v1/focus-v2";
const config = {
  focus_minutes: 25, short_break_minutes: 5, long_break_minutes: 15,
  round_count: 4, long_break_every: 4, auto_start_breaks: false, auto_start_focus: false,
};
const psql = ["exec", "-i", "supabase_db_lumivox-proj", "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"];
const sql = (query: string) => execFileSync("docker", [...psql, "-c", query], { encoding: "utf8", windowsHide: true }).trim();
const apiPost = (endpoint: string, body: unknown, key = internalKey!) => fetch(`${backend}${path}/${endpoint}`, {
  method: "POST", headers: { "content-type": "application/json", "x-lumivox-internal-key": key },
  body: JSON.stringify(body),
});

test.skip(!api || !service || !anon || !backend || !proxyPort || !internalKey, "Opt-in: isolated local launch stack required");
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ viewport: { width: 390, height: 844 } });

let dropNext = false;
const launches: { request: Record<string, unknown>; response: Record<string, unknown>; dropped: boolean }[] = [];
let stopProxy: (() => Promise<void>) | undefined;

let admin: SupabaseClient<Database>;
const users = [0, 1].map(() => ({ email: `focus-launch-${randomUUID()}@example.invalid`, password: randomUUID(), id: "" }));
let taskId: string, studyId: string, closeTaskId: string, closeStudyId: string;

async function fixture(title: string, status = "scheduled") {
  const user_id = users[0].id;
  const now = Temporal.Now.instant();
  const hour = now.toZonedDateTimeISO("UTC").hour;
  const timezone = hour >= 2 && hour <= 21 ? "UTC" : "Etc/GMT+12";
  const start = now.subtract({ minutes: 5 }).toZonedDateTimeISO(timezone).round({ smallestUnit: "minute", roundingMode: "floor" });
  const end = start.add({ minutes: 60 });
  const local_date = start.toPlainDate().toString();
  const task = await admin.from("tasks").insert({ user_id, title, status: "todo" }).select("id").single();
  expect(task.error).toBeNull();
  const task_id = task.data!.id;
  const schedule = await admin.from("task_study_schedules").insert({ user_id, task_id, timezone,
    starts_on: local_date, ends_on: local_date }).select("id").single();
  expect(schedule.error).toBeNull();
  const study = await admin.from("task_study_sessions").insert({ user_id, task_id, timezone, local_date, status,
    schedule_id: schedule.data!.id, schedule_revision: 1, logical_occurrence_key: randomUUID(),
    local_start_time: start.toPlainTime().toString(), local_end_time: end.toPlainTime().toString(),
    scheduled_start_at: start.toInstant().toString(), scheduled_end_at: end.toInstant().toString(),
  }).select("id").single();
  expect(study.error).toBeNull();
  return { task: task_id, study: study.data!.id };
}

test.beforeAll(async ({ baseURL }) => {
  expect(api).toBe("http://127.0.0.1:55321");
  expect(new URL(baseURL!).hostname).toBe("127.0.0.1");
  expect(new URL(backend!).hostname).toBe("127.0.0.1");
  expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT enabled FROM public.study_notification_dispatch_control), (SELECT enabled FROM public.ls_missed_sweep_control)")).toBe("0|0|f|f");
  stopProxy = await startLocalFocusProxy(backend!, proxyPort!, (request, response) => {
    const dropped = dropNext;
    dropNext = false;
    launches.push({ request, response, dropped });
    return dropped;
  });
  admin = createClient<Database>(api!, service!, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const user of users) {
    const created = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true });
    expect(created.error).toBeNull();
    user.id = created.data.user!.id;
    expect((await admin.from("profiles").upsert({ id: user.id, onboarding_completed: true })).error).toBeNull();
  }
  ({ task: taskId, study: studyId } = await fixture("Study Focus Test Task"));
  ({ task: closeTaskId, study: closeStudyId } = await fixture("Task Close Test"));
  await fixture("Skipped Study Task", "skipped");
});

test.afterAll(async () => {
  await stopProxy?.();
  for (const user of users.filter(user => user.id)) {
    expect((await admin.auth.admin.deleteUser(user.id)).error).toBeNull();
  }
  if (admin) {
    expect(sql("SELECT (SELECT count(*) FROM auth.users), (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.focus_sessions), (SELECT count(*) FROM public.task_study_focus_launches), (SELECT count(*) FROM public.task_study_focus_attributions)")).toBe("0|0|0|0|0");
  }
});

const input = (study = studyId) => ({ user_id: users[0].id, study_session_id: study, launch_request_id: randomUUID(), ...config });

async function heldTask(task: string, close = false) {
  const process = spawn("docker", psql, { windowsHide: true });
  const pid = await new Promise<number>((resolve, reject) => {
    const output = createInterface({ input: process.stdout });
    process.once("error", reject);
    process.once("exit", code => reject(new Error(`psql exited ${code} before acquiring the Task lock`)));
    output.once("line", line => { output.close(); resolve(Number(line)); });
    process.stdin.write(`BEGIN;
      UPDATE public.tasks SET status = '${close ? "completed" : "todo"}' WHERE id = '${task}';
      SELECT pg_backend_pid();
    \n`);
  });
  expect(pid).toBeGreaterThan(0);
  return {
    blockers: () => Number(sql(`SELECT count(*) FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`)),
    release: () => new Promise<void>((resolve, reject) => {
      process.once("exit", code => code === 0 ? resolve() : reject(new Error(`Task lock psql exited ${code}`)));
      process.stdin.end("COMMIT;\n");
    }),
  };
}

test("real FastAPI auth, Task-close race, concurrent launch, and ordinary Focus", async () => {
  expect((await apiPost("create-from-study-session", input(), "invalid-key")).status).toBe(401);
  expect((await apiPost("create-from-study-session", { ...input(), user_id: users[1].id })).status).toBe(403);
  expect((await apiPost("create-from-study-session", { ...input(), task_id: closeTaskId })).status).toBe(422);

  const closeLock = await heldTask(closeTaskId, true);
  const closedLaunch = apiPost("create-from-study-session", input(closeStudyId));
  try { await expect.poll(closeLock.blockers, { timeout: 3000 }).toBeGreaterThan(0); }
  finally { await closeLock.release(); }
  expect((await closedLaunch).status).toBe(410);
  expect(sql("SELECT count(*) FROM public.focus_sessions")).toBe("0");

  const raceLock = await heldTask(taskId);
  const first = input();
  const concurrent = [first, first, input()].map(body => apiPost("create-from-study-session", body));
  try { await expect.poll(raceLock.blockers, { timeout: 3000 }).toBeGreaterThan(0); }
  finally { await raceLock.release(); }
  const responses = await Promise.all(concurrent);
  // The different key can win; the two exact requests must agree either way.
  expect(responses[0].status).toBe(responses[1].status);
  expect(responses.map(response => response.status).sort()).toEqual(responses[0].ok ? [200, 200, 423] : [200, 423, 423]);
  expect(sql("SELECT count(*) FROM public.task_study_focus_launches")).toBe("1");
  const successes = await Promise.all(responses.filter(response => response.ok).map(response => response.json()));
  expect(new Set(successes.map(response => response.session_id)).size).toBe(1);
  expect(successes.filter(response => !response.replay)).toHaveLength(1);
  const session_id = successes[0].session_id;
  expect((await apiPost("create", { user_id: users[0].id, task_id: taskId, ...config })).status).toBe(409);
  expect((await apiPost("transition", { user_id: users[0].id, session_id, action: "cancel" })).status).toBe(200);

  const ordinaryLock = await heldTask(taskId);
  const blockedLaunch = apiPost("create-from-study-session", input());
  let ordinaryId: string;
  try {
    await expect.poll(ordinaryLock.blockers, { timeout: 3000 }).toBeGreaterThan(0);
    const ordinary = await apiPost("create", { user_id: users[0].id, task_id: taskId, ...config });
    expect(ordinary.status).toBe(200);
    ordinaryId = (await ordinary.json()).session_id;
  } finally { await ordinaryLock.release(); }
  expect((await blockedLaunch).status).toBe(423);
  expect(sql(`SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id = '${ordinaryId}'`)).toBe("0");
  expect((await apiPost("transition", { user_id: users[0].id, session_id: ordinaryId, action: "cancel" })).status).toBe(200);
  const legacyClient = createClient<Database>(api!, anon!, { auth: { persistSession: false } });
  expect((await legacyClient.auth.signInWithPassword(users[0])).error).toBeNull();
  const legacy = await legacyClient.from("focus_sessions")
    .insert({ user_id: users[0].id, task_id: taskId, planned_minutes: 25 }).select("id,session_mode").single();
  expect(legacy.error).toBeNull();
  expect(legacy.data?.session_mode).toBe("legacy");
  expect(sql(`SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id='${legacy.data!.id}'`)).toBe("0");
  expect((await legacyClient.from("focus_sessions").update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("id", legacy.data!.id)).error).toBeNull();
  await legacyClient.auth.signOut();
  console.log(`Task close: blocker observed, HTTP 410. Concurrent launches: blocker observed, HTTP ${responses.map(response => response.status).join("/")}. Ordinary race: blocker observed, HTTP 200/423.`);
});

test("browser EN/VI 390px, keyboard launch and recovery after a committed response is lost", async ({ page, browser, baseURL }) => {
  await page.goto("/en/auth/login");
  await submitLoginForm(page, users[0].email, users[0].password);
  await page.waitForURL("**/en/dashboard");

  for (const locale of ["vi", "en"]) {
    await page.goto(`/${locale}/study-plan`);
    const today = page.getByTestId("todays-study-plan");
    const launchLabel = locale === "vi" ? "Bắt đầu Focus" : "Start Focus";
    await expect(today.locator(`[data-study-session="${studyId}"]`).getByRole("link", { name: launchLabel })).toBeVisible();
    await expect(today.getByText("Skipped Study Task").locator("xpath=ancestor::li").getByRole("link", { name: launchLabel })).toHaveCount(0);
    await expect(page.getByTestId("study-calendar").getByRole("link", { name: launchLabel, exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const launchLink = page.getByTestId("todays-study-plan").getByRole("link", { name: "Start Focus", exact: true });
  await launchLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Study session for Study Focus Test Task")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const submit = page.locator("form button[type=submit]");
  dropNext = true;
  await submit.focus();
  await page.keyboard.press("Enter");
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("alert").filter({ hasText: "could not confirm the launch" })).toBeVisible({ timeout: 40_000 });
  expect(launches).toHaveLength(1);
  expect(launches[0].dropped).toBe(true);
  const focusId = launches[0].response.session_id;
  expect(sql(`SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id = '${focusId}'`)).toBe("1");
  const fresh = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const otherTab = await fresh.newPage();
    await otherTab.goto("/en/auth/login");
    await submitLoginForm(otherTab, users[0].email, users[0].password);
    await otherTab.waitForURL("**/en/dashboard");
    await otherTab.goto(`/en/focus?studySession=${studyId}`);
    expect(await otherTab.evaluate(key => sessionStorage.getItem(key), `study-focus:${users[0].id}:${studyId}`)).toBeNull();
    await expect(otherTab.getByText("You already have an active Focus session.")).toBeVisible();
    await expect(otherTab.getByRole("timer")).toBeVisible();
    expect(launches).toHaveLength(1);
  } finally { await fresh.close(); }
  await page.getByRole("button", { name: "Retry the same launch" }).click();
  await page.waitForURL("**/en/focus");
  await expect(page.getByRole("timer")).toBeVisible();
  expect(launches).toHaveLength(2);
  expect(launches[1].request).toEqual(launches[0].request);
  expect(launches[1].response).toEqual({ session_id: focusId, replay: true });
  expect(sql(`SELECT status FROM public.task_study_sessions WHERE id = '${studyId}'`)).toBe("scheduled");
  expect(sql(`SELECT count(*) FROM public.focus_sessions WHERE user_id = '${users[0].id}' AND status IN ('ongoing','paused')`)).toBe("1");
  await page.goto(`/en/focus?studySession=${studyId}`);
  await expect(page.getByText("You already have an active Focus session.")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry the same launch" })).toHaveCount(0);
});

test("two independent browser contexts submit Start with one active Focus", async ({ page, browser, baseURL }) => {
  const previous = launches.at(-1)!.response.session_id;
  expect((await apiPost("transition", { user_id: users[0].id, session_id: previous, action: "cancel" })).status).toBe(200);
  const second = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const pages = [page, await second.newPage()];
    await Promise.all(pages.map(async tab => {
      await tab.goto("/en/auth/login");
      await submitLoginForm(tab, users[0].email, users[0].password);
      await tab.waitForURL("**/en/dashboard");
      await tab.goto(`/en/focus?studySession=${studyId}`);
      await expect(tab.getByText("Study session for Study Focus Test Task")).toBeVisible();
    }));
    const before = launches.length;
    await Promise.all(pages.map(tab => tab.locator("form button[type=submit]").click()));
    await expect.poll(async () => {
      const timers = await Promise.all(pages.map(tab => tab.getByRole("timer").count()));
      const conflicts = await Promise.all(pages.map(tab => tab.getByRole("alert").filter({ hasText: "already have an active Focus" }).count()));
      return [timers.reduce((a, b) => a + b, 0), conflicts.reduce((a, b) => a + b, 0)];
    }).toEqual([1, 1]);
    expect(launches).toHaveLength(before + 1);
    const id = launches.at(-1)!.response.session_id;
    expect(sql(`SELECT count(*) FROM public.focus_sessions WHERE user_id='${users[0].id}' AND status IN ('ongoing','paused')`)).toBe("1");
    expect(sql(`SELECT count(*) FROM public.task_study_focus_launches WHERE focus_session_id='${id}'`)).toBe("1");
    expect(sql(`SELECT count(*) FROM public.task_study_focus_attributions WHERE focus_session_id='${id}'`)).toBe("1");
    const future = sql(`INSERT INTO public.task_study_sessions
      (user_id, task_id, schedule_id, schedule_revision, logical_occurrence_key, local_date,
       local_start_time, local_end_time, timezone, scheduled_start_at, scheduled_end_at)
      SELECT user_id, task_id, schedule_id, schedule_revision, gen_random_uuid()::text, local_date,
       local_start_time + interval '1 hour', local_end_time + interval '1 hour', timezone,
       scheduled_start_at + interval '1 hour', scheduled_end_at + interval '1 hour'
      FROM public.task_study_sessions WHERE id='${studyId}' RETURNING id`);
    const taskClose = await admin.from("tasks").update({ status: "completed" }).eq("id", taskId);
    expect(taskClose.error).toBeNull();
    expect(sql(`SELECT f.status || '|' || s.status || '|' || sc.status
      FROM public.task_study_focus_attributions a JOIN public.focus_sessions f ON f.id=a.focus_session_id
      JOIN public.task_study_sessions s ON s.id=a.study_session_id
      JOIN public.task_study_schedules sc ON sc.id=s.schedule_id WHERE f.id='${id}'`)).toBe("ongoing|scheduled|closed");
    expect(sql(`SELECT count(*) FROM public.task_study_session_events WHERE session_id='${studyId}'`)).toBe("0");
    expect(sql(`SELECT s.status || '|' || s.cancellation_reason || '|' || e.event_type
      FROM public.task_study_sessions s JOIN public.task_study_session_events e ON e.session_id=s.id
      WHERE s.id='${future}'`)).toBe("cancelled|task_closed|cancelled");
  } finally { await second.close(); }
});
