
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  expect,
  test,
  type Page,
} from "@playwright/test";

import { submitLoginForm } from "./helpers/auth";

const localUrl = process.env.LEARNING_SCHEDULE_TEST_URL;
const serviceKey =
  process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;

// Reuse the repository's existing local-only E2E gates.
test.skip(
  !localUrl || !serviceKey,
  "Opt-in: requires local Supabase E2E credentials",
);

test.describe.configure({
  mode: "serial",
  timeout: 120_000,
});

test.use({
  timezoneId: "Asia/Tokyo",
  actionTimeout: 15_000,
});

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
};

const email =
  `attendance-browser-${randomUUID()}@example.invalid`;
const password = randomUUID();

let admin: SupabaseClient;
let userId: string;
let goalId: string;
let pageErrors: string[] = [];
let currentFixtures: Fixture[] = [];
const browserReport = {
  baseline: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(),
  baseURL: "",
  apiOrigin: "",
  sweepGateBefore: false,
  runs: [] as Array<{ name: string; status: string; pageErrors: string[]; snapshots: unknown[] }>,
};

function localDatabase(sql: string) {
  return execFileSync("docker", ["exec", "supabase_db_lumivox-proj", "psql", "-X", "-At", "-U", "postgres", "-d", "postgres", "-c", sql], { encoding: "utf8", windowsHide: true }).trim();
}

type Status = "scheduled" | "missed" | "skipped";

type Fixture = {
  taskId: string;
  scheduleId: string;
  sessionId: string;
  title: string;
  status: Status;
};

function localClock(date: Date, zone: string) {
  // Both zones below have an exact, known offset.
  // Choose the -12 zone around UTC midnight so the
  // current attendance window never crosses local midnight.
  const shifted =
    zone === "Etc/GMT+12"
      ? new Date(date.getTime() - 12 * 3_600_000)
      : date;

  const iso = shifted.toISOString();

  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 23),
  };
}

function dateShift(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

async function createFixture(
  status: Status,
): Promise<Fixture> {
  const now = new Date();
  const zone =
    now.getUTCHours() >= 2 && now.getUTCHours() <= 21
      ? "UTC"
      : "Etc/GMT+12";

  const historical = status !== "scheduled";

  const beginsAt = historical
    ? dateShift(now, -2)
    : new Date(now.getTime() - 10 * 60_000);

  const endsAt = historical
    ? new Date(beginsAt.getTime() + 30 * 60_000)
    : new Date(now.getTime() + 20 * 60_000);

  const begins = localClock(beginsAt, zone);
  const ends = localClock(endsAt, zone);

  expect(begins.date).toBe(ends.date);
  expect(begins.time < ends.time).toBe(true);

  const title = `Attendance E2E ${status} ${randomUUID()}`;

  const task = await admin
    .from("tasks")
    .insert({
      user_id: userId,
      goal_id: goalId,
      title,
      status: "todo",
    })
    .select("id")
    .single();

  expect(task.error).toBeNull();
  const taskId = task.data!.id as string;

  const schedule = await admin
    .from("task_study_schedules")
    .insert({
      user_id: userId,
      task_id: taskId,
      starts_on: localClock(dateShift(beginsAt, -4), zone).date,
      ends_on: localClock(dateShift(now, 4), zone).date,
      timezone: zone,
      status: "active",
    })
    .select("id")
    .single();

  expect(schedule.error).toBeNull();
  const scheduleId = schedule.data!.id as string;

  const session = await admin
    .from("task_study_sessions")
    .insert({
      user_id: userId,
      task_id: taskId,
      schedule_id: scheduleId,
      schedule_revision: 1,
      logical_occurrence_key: `attendance-e2e-${randomUUID()}`,
      local_date: begins.date,
      local_start_time: begins.time,
      local_end_time: ends.time,
      timezone: zone,
      scheduled_start_at: beginsAt.toISOString(),
      scheduled_end_at: endsAt.toISOString(),
      status,
      updated_at:
        new Date(now.getTime() - 10 * 60_000).toISOString(),
    })
    .select("id")
    .single();

  expect(session.error).toBeNull();

  const fixture = {
    taskId,
    scheduleId,
    sessionId: session.data!.id as string,
    title,
    status,
  };
  currentFixtures.push(fixture);
  return fixture;
}

async function readSession(fixture: Fixture) {
  const result = await admin
    .from("task_study_sessions")
    .select(
      "id,status,completed_at,actual_study_minutes,updated_at",
    )
    .eq("id", fixture.sessionId)
    .single();

  expect(result.error).toBeNull();
  return result.data!;
}

async function readEvents(fixture: Fixture) {
  const result = await admin
    .from("task_study_session_events")
    .select(
      "id,event_type,event_key,from_status,to_status,actor_id",
    )
    .eq("session_id", fixture.sessionId)
    .order("created_at");

  expect(result.error).toBeNull();
  return result.data ?? [];
}

async function openFixture(page: Page, fixture: Fixture) {
  await page.goto(`/en/workspace?goal=${goalId}`);

  const card = page
    .locator("article")
    .filter({ hasText: fixture.title });

  await expect(card).toBeVisible();
  await card.getByRole("button").first().click();

  await page
    .getByRole("tab", { name: "Overview", exact: true })
    .click();

  const section = page.getByRole("region", {
    name: "Task study schedule",
    exact: true,
  });

  await expect(section).toBeVisible();
  await expect(section.getByRole("listitem")).toHaveCount(1);

  return section;
}

async function confirmAttendance(
  page: Page,
  action: "start" | "complete" | "skip" | "recover",
) {
  const ui = {
    start: {
      button: "Start",
      dialog: "Start study session",
      confirm: "Confirm start",
    },
    complete: {
      button: "Complete",
      dialog: "Complete study session",
      confirm: "Confirm completion",
    },
    skip: {
      button: "Skip",
      dialog: "Skip study session",
      confirm: "Confirm skip",
    },
    recover: {
      button: "Recover",
      dialog: "Recover missed study session",
      confirm: "Confirm recovery",
    },
  }[action];

  const section = page.getByRole("region", {
    name: "Task study schedule",
    exact: true,
  });

  await section
    .getByRole("button", {
      name: ui.button,
      exact: true,
    })
    .first()
    .click();

  const dialog = page.getByRole("dialog", {
    name: ui.dialog,
    exact: true,
  });

  await expect(dialog).toBeVisible();

  await dialog
    .getByRole("button", {
      name: ui.confirm,
      exact: true,
    })
    .click();

  await expect(dialog).not.toBeVisible();
}

test.beforeAll(async ({ baseURL }) => {
  const local = new URL(localUrl!);
  const web = new URL(baseURL!);

  expect(local.protocol).toBe("http:");
  expect(local.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(local.port).toBe("55321");
  expect(local.pathname).toBe("/");

  expect(web.protocol).toBe("http:");
  expect(web.hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  browserReport.baseURL = web.origin;
  browserReport.apiOrigin = local.origin;
  expect(localDatabase("SELECT enabled FROM public.ls_missed_sweep_control WHERE singleton=true;")).toBe("f");

  admin = createClient(localUrl!, serviceKey!, options);

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error) throw created.error;
  userId = created.data.user.id;

  const profile = await admin
    .from("profiles")
    .update({ onboarding_completed: true })
    .eq("id", userId);

  expect(profile.error).toBeNull();

  const goal = await admin
    .from("goals")
    .insert({
      user_id: userId,
      title: "Attendance browser goal",
      goal_type: "short_term",
    })
    .select("id")
    .single();

  expect(goal.error).toBeNull();
  goalId = goal.data!.id as string;
});

test.afterAll(async () => {
  if (!userId) return;

  const deleted = await admin.auth.admin.deleteUser(userId);
  expect(deleted.error).toBeNull();

  const sessions = await admin
    .from("task_study_sessions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  expect(sessions.error).toBeNull();
  expect(sessions.count).toBe(0);
  expect(localDatabase("SELECT enabled FROM public.ls_missed_sweep_control WHERE singleton=true;")).toBe("f");
  const tasks = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(tasks.error).toBeNull();
  expect(tasks.count).toBe(0);
  writeFileSync(resolve(process.cwd(), "../../docs/learning-schedule/phase-05-attendance-browser.json"), JSON.stringify({
    ...browserReport, sweepGateAfter: false, userCleanup: "PASS", remainingSessions: sessions.count, remainingTasks: tasks.count,
    finishedAt: new Date().toISOString(),
  }, null, 2) + "\n");
});

test.beforeEach(async ({ page, context }) => {
  pageErrors = [];
  currentFixtures = [];
  const observe = (observedPage: Page) => observedPage.on("pageerror", error => {
    pageErrors.push(error.message.replaceAll(password, "[redacted]").replaceAll(serviceKey!, "[redacted]"));
  });
  observe(page);
  context.on("page", observe);
  await page.goto("/en/auth/login");

  await submitLoginForm(page, email, password);

  await page.waitForURL("**/en/dashboard");
});

test.afterEach(async ({ page }, info) => {
  const snapshots = [];
  for (const fixture of currentFixtures) {
    const task = await admin.from("tasks").select("status").eq("id", fixture.taskId).single();
    snapshots.push({ sessionId: fixture.sessionId, session: await readSession(fixture), events: await readEvents(fixture), taskStatus: task.data?.status });
  }
  browserReport.runs.push({ name: info.title, status: info.status ?? "unknown", pageErrors: [...pageErrors], snapshots });
  // Use the app's real cookie-authenticated sign-out route before deleting Auth fixtures.
  const signedOut = await page.request.post("/auth/signout", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(303);
  expect(pageErrors).toEqual([]);
});

// ---------------------------------------------------------
// ATE-01: Start -> Complete
// ---------------------------------------------------------

test("ATE-01 browser starts then completes one session", async ({
  page,
}) => {
  const fixture = await createFixture("scheduled");
  const section = await openFixture(page, fixture);

  await confirmAttendance(page, "start");

  await expect(
    section.getByText("In progress", { exact: true }),
  ).toBeVisible();

  let saved = await readSession(fixture);
  expect(saved.status).toBe("in_progress");
  expect(saved.completed_at).toBeNull();

  await confirmAttendance(page, "complete");

  await expect(
    section.getByText("Completed", { exact: true }),
  ).toBeVisible();

  saved = await readSession(fixture);
  expect(saved.status).toBe("completed");
  expect(saved.completed_at).not.toBeNull();
  expect(saved.actual_study_minutes).toBeNull();

  const events = await readEvents(fixture);

  expect(events.map(event => event.event_type))
    .toEqual(["started", "completed"]);

  expect(events[0].from_status).toBe("scheduled");
  expect(events[0].to_status).toBe("in_progress");

  expect(events[1].from_status).toBe("in_progress");
  expect(events[1].to_status).toBe("completed");

  expect(events.every(event => event.actor_id === userId))
    .toBe(true);

  expect(new Set(events.map(event => event.event_key)).size)
    .toBe(2);

  const task = await admin
    .from("tasks")
    .select("status")
    .eq("id", fixture.taskId)
    .single();

  expect(task.data?.status).toBe("todo");
});

// ---------------------------------------------------------
// ATE-02: Skip -> Recover
// ---------------------------------------------------------

test("ATE-02 browser recovers a skipped session", async ({
  page,
}) => {
  const fixture = await createFixture("scheduled");
  const section = await openFixture(page, fixture);

  await confirmAttendance(page, "skip");

  await expect(
    section.getByText("Skipped", { exact: true }),
  ).toBeVisible();

  let saved = await readSession(fixture);
  expect(saved.status).toBe("skipped");
  expect(saved.completed_at).toBeNull();

  await confirmAttendance(page, "recover");

  await expect(
    section.getByText("Completed", { exact: true }),
  ).toBeVisible();

  saved = await readSession(fixture);
  expect(saved.status).toBe("completed");
  expect(saved.completed_at).not.toBeNull();
  expect(saved.actual_study_minutes).toBeNull();

  const events = await readEvents(fixture);

  expect(events.map(event => event.event_type))
    .toEqual(["skipped", "recovered"]);

  expect(events[1].from_status).toBe("skipped");
  expect(events[1].to_status).toBe("completed");
});

// ---------------------------------------------------------
// ATE-03: Two tabs / stale optimistic version
// ---------------------------------------------------------

test("ATE-03 two tabs reject a stale command", async ({
  page,
  context,
}) => {
  const fixture = await createFixture("scheduled");

  const first = await openFixture(page, fixture);
  const secondTab = await context.newPage();

  try {
    const second = await openFixture(secondTab, fixture);

    // Both tabs have loaded the original scheduled row.
    await expect(
      first.getByText("Scheduled", { exact: true }),
    ).toBeVisible();

    await expect(
      second.getByText("Scheduled", { exact: true }),
    ).toBeVisible();

    await confirmAttendance(page, "start");

    await expect(
      first.getByText("In progress", { exact: true }),
    ).toBeVisible();

    // The second tab still has the old updated_at.
    // Complete remains a legal transition from in_progress,
    // so the RPC must reject the stale VERSION (PT409).
    await second
      .getByRole("button", {
        name: "Complete",
        exact: true,
      })
      .click();

    const dialog = secondTab.getByRole("dialog", {
      name: "Complete study session",
      exact: true,
    });

    await dialog
      .getByRole("button", {
        name: "Confirm completion",
      })
      .click();

    await expect(dialog.getByRole("alert"))
      .toContainText("changed");

    await dialog
      .getByRole("button", {
        name: "Check latest session",
      })
      .click();

    await expect(
      second.getByText("In progress", { exact: true }),
    ).toBeVisible();

    const saved = await readSession(fixture);
    expect(saved.status).toBe("in_progress");

    const events = await readEvents(fixture);

    expect(events.map(event => event.event_type))
      .toEqual(["started"]);
  } finally {
    await secondTab.close();
  }
});

