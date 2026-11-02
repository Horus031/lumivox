
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
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
const anonKey = process.env.LEARNING_SCHEDULE_TEST_ANON_KEY;

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
  caseDetails: {} as Record<string, unknown>,
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
    snapshots.push({ taskId: fixture.taskId, scheduleId: fixture.scheduleId, sessionId: fixture.sessionId, session: await readSession(fixture), events: await readEvents(fixture), taskStatus: task.data?.status });
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



test("ATE-04 lost response preserves exact completion", async ({
  page,
}) => {
  const fixture = await createFixture("scheduled");
  const section = await openFixture(page, fixture);

  const actionUrl = "**/en/workspace**";

  let intercepted = 0;
  const sentBodies: string[] = [];

  await page.route(actionUrl, async route => {
    const request = route.request();

    if (
      request.method() !== "POST" ||
      !request.headers()["next-action"]
    ) {
      await route.continue();
      return;
    }

    // Workspace also dispatches read/refetch actions. Inject loss and count
    // only this Session's real Complete command, never unrelated actions.
    let command: unknown;
    try {
      const decoded: unknown = JSON.parse(request.postData() ?? "");
      command = Array.isArray(decoded) ? decoded[0] : null;
    } catch {
      await route.continue();
      return;
    }
    if (!command || typeof command !== "object" ||
      !("command" in command) || command.command !== "complete" ||
      !("sessionId" in command) || command.sessionId !== fixture.sessionId) {
      await route.continue();
      return;
    }

    intercepted += 1;
    sentBodies.push(request.postData() ?? "");

    if (intercepted === 1) {
      // Execute the REAL request against Next.js.
      // route.fetch waits for the upstream response.
      const upstream = await route.fetch({
        timeout: 30_000,
      });

      expect(upstream.ok()).toBe(true);

      const committed = await readSession(fixture);
      const committedEvents = await readEvents(fixture);
      expect(committed.status).toBe("completed");
      expect(committedEvents.map(event => event.event_type)).toEqual(["completed"]);
      browserReport.caseDetails["ATE-04"] = {
        upstreamHttpStatus: upstream.status(),
        committedObservedAt: new Date().toISOString(),
        beforeResponseLoss: committed,
        eventCountBeforeResponseLoss: committedEvents.length,
      };

      // The server has responded, but the client
      // deliberately loses the response.
      await route.abort("failed");
      return;
    }

    // Retry must reach the real Server Action too.
    await route.continue();
  });

  try {
    await section.getByRole("button", {
      name: "Complete",
      exact: true,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: "Complete study session",
      exact: true,
    });

    await dialog.getByRole("button", {
      name: "Confirm completion",
      exact: true,
    }).click();

    // Backend completion must already be persisted,
    // regardless of the browser receiving an error.
    await expect.poll(async () =>
      (await readSession(fixture)).status,
    ).toBe("completed");

    const beforeRetry = await readSession(fixture);
    const eventsBefore = await readEvents(fixture);

    expect(eventsBefore.map(event => event.event_type))
      .toEqual(["completed"]);

    // An interrupted transport must not be interpreted
    // as a verified failure of the database transaction.
    await expect(dialog.getByRole("alert"))
      .toBeVisible();

    await expect(dialog.getByRole("button", {
      name: "Retry exact command",
      exact: true,
    })).toBeVisible();

    await dialog.getByRole("button", {
      name: "Retry exact command",
      exact: true,
    }).click();

    await expect(dialog).not.toBeVisible();

    await expect(
      section.getByText("Completed", { exact: true }),
    ).toBeVisible();

    const afterRetry = await readSession(fixture);
    const eventsAfter = await readEvents(fixture);

    // Full persisted data remains unchanged.
    expect(afterRetry).toEqual(beforeRetry);
    expect(eventsAfter).toEqual(eventsBefore);

    expect(eventsAfter).toHaveLength(1);
    expect(eventsAfter[0].event_type).toBe("completed");
    expect(eventsAfter[0].actor_id).toBe(userId);

    expect(intercepted).toBe(2);

    // Both Server Action requests should serialize
    // exactly the same frozen client command.
    expect(sentBodies[0]).toBeTruthy();
    expect(sentBodies[1]).toBe(sentBodies[0]);
    const original = JSON.parse(sentBodies[0])[0];
    const retry = JSON.parse(sentBodies[1])[0];
    expect(original.command).toBe("complete");
    expect(original.sessionId).toBe(fixture.sessionId);
    expect(original.expectedUpdatedAt).toEqual(expect.any(String));
    expect(original.eventKey).toMatch(/^[0-9a-f-]{36}$/);
    const identity = (command: typeof original) => ({
      command: command.command,
      sessionId: command.sessionId,
      expectedUpdatedAt: command.expectedUpdatedAt,
      eventKey: command.eventKey,
    });
    expect(identity(retry)).toEqual(identity(original));
    browserReport.caseDetails["ATE-04"] = {
      ...(browserReport.caseDetails["ATE-04"] as Record<string, unknown>),
      originalCommand: identity(original),
      retryCommand: identity(retry),
      requestBodiesIdentical: true,
      eventCountBeforeRetry: eventsBefore.length,
      eventCountAfterRetry: eventsAfter.length,
      sessionUnchangedOnReplay: true,
      auditUnchangedOnReplay: true,
      interceptedRequests: intercepted,
      retryVerifiedAt: new Date().toISOString(),
    };
  } finally {
    await page.unroute(actionUrl);
  }
});



test("ATE-05 Attendance dialog supports keyboard and restores focus", async ({
  page,
}) => {
  const fixture = await createFixture("scheduled");
  const section = await openFixture(page, fixture);

  const opener = section.getByRole("button", {
    name: "Skip",
    exact: true,
  });

  await expect(opener).toBeEnabled();

  // Focus the actual opener, then activate with keyboard.
  await opener.focus();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog", {
    name: "Skip study session",
    exact: true,
  });

  await expect(dialog).toBeVisible();

  await expect(dialog).toHaveAttribute(
    "aria-labelledby",
    /.+/,
  );

  await expect(dialog).toHaveAttribute(
    "aria-describedby",
    /.+/,
  );

  const input = dialog.getByRole("textbox", {
    name: /Reason/,
  });

  await expect(input).toBeVisible();

  const cancel = dialog.getByRole("button", {
    name: "Cancel",
    exact: true,
  });

  const confirm = dialog.getByRole("button", {
    name: "Confirm skip",
    exact: true,
  });

  await expect(cancel).toBeEnabled();
  await expect(confirm).toBeEnabled();

  // Keyboard Tab must reach the input and actions.
  const visited = new Set<string>();

  for (let step = 0; step < 15; step++) {
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    const current = await page.evaluate(() => {
      const element = document.activeElement;

      if (!(element instanceof HTMLElement)) {
        return "";
      }

      if (element instanceof HTMLTextAreaElement) {
        return "reason";
      }

      return element.textContent?.trim() ?? "";
    });

    visited.add(current);
    await page.keyboard.press("Tab");
  }

  expect(visited.has("reason")).toBe(true);
  expect(visited.has("Cancel")).toBe(true);
  expect(visited.has("Confirm skip")).toBe(true);

  // Escape should close without saving.
  await page.keyboard.press("Escape");

  await expect(dialog).not.toBeVisible();

  // Focus returns to the opener if still mounted.
  await expect(opener).toBeFocused();

  const saved = await readSession(fixture);
  expect(saved.status).toBe("scheduled");

  expect(await readEvents(fixture)).toHaveLength(0);
  browserReport.caseDetails["ATE-05"] = {
    visited: [...visited], focusRestored: true, focusStayedInDialog: true,
    escapeClosedWithoutMutation: true, eventCount: 0,
  };
});



test("ATE-06 mobile Attendance works in EN and VI", async ({
  page,
}, testInfo) => {
  const fixture = await createFixture("scheduled");
  const mobileResults: unknown[] = [];

  await page.setViewportSize({
    width: 390,
    height: 844,
  });

  const cases = [
    {
      locale: "en",
      sectionName: "Task study schedule",
      action: "Skip",
      dialogName: "Skip study session",
      reasonLabel: /Reason/,
      cancel: "Cancel",
    },
    {
      locale: "vi",
      sectionName: "Lịch học của công việc",
      action: "Bỏ qua",
      dialogName: "Bỏ qua buổi học",
      reasonLabel: /Lý do/,
      cancel: "Hủy",
    },
  ] as const;

  for (const item of cases) {
    await page.goto(
      `/${item.locale}/workspace?goal=${goalId}`,
    );

    const card = page
      .locator("article")
      .filter({ hasText: fixture.title });

    await expect(card).toBeVisible();

    await card.getByRole("button").first().click();

    await page.getByRole("tab", {
      name: item.locale === "en" ? "Overview" : "Tổng quan",
      exact: true,
    }).click();

    const section = page.getByRole("region", {
      name: item.sectionName,
      exact: true,
    });

    await expect(section).toBeVisible();

    await section.getByRole("button", {
      name: item.action,
      exact: true,
    }).click();

    const dialog = page.getByRole("dialog", {
      name: item.dialogName,
      exact: true,
    });

    await expect(dialog).toBeVisible();

    await expect(
      dialog.getByRole("textbox", {
        name: item.reasonLabel,
      }),
    ).toBeVisible();

    const dimensions = await dialog.evaluate(element => ({
      contentWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      renderedWidth:
        element.getBoundingClientRect().width,
      viewportWidth: window.innerWidth,
      documentWidth:
        document.documentElement.scrollWidth,
    }));

    expect(dimensions.contentWidth)
      .toBeLessThanOrEqual(dimensions.clientWidth);

    expect(dimensions.renderedWidth)
      .toBeLessThanOrEqual(dimensions.viewportWidth);

    expect(dimensions.documentWidth)
      .toBeLessThanOrEqual(dimensions.viewportWidth);

    const screenshotPath = testInfo.outputPath(`attendance-${item.locale}-mobile.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    await dialog.getByRole("button", {
      name: item.cancel,
      exact: true,
    }).click();

    await expect(dialog).not.toBeVisible();
    mobileResults.push({ locale: item.locale, viewport: { width: 390, height: 844 }, ...dimensions,
      screenshot: relative(process.cwd(), screenshotPath).replaceAll("\\", "/"), cancelled: true });
  }

  // Merely opening/cancelling dialogs must not mutate.
  const saved = await readSession(fixture);
  expect(saved.status).toBe("scheduled");

  expect(await readEvents(fixture)).toHaveLength(0);
  browserReport.caseDetails["ATE-06"] = { locales: mobileResults, eventCount: 0, sessionUnchanged: true };
});



test("ATE-07 cross-owner cannot read or mutate Attendance", async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(
    !anonKey,
    "Requires the local anon key for real user-scoped RPC checks",
  );

  const fixture = await createFixture("scheduled");
  await openFixture(page, fixture);

  const otherEmail =
    `attendance-other-${randomUUID()}@example.invalid`;
  const otherPassword = randomUUID();

  let otherUserId: string | null = null;
  let otherClient: SupabaseClient | undefined;
  let otherPage: Page | undefined;
  const denials: { rpc: string; sqlstate: string | undefined; httpStatus: number }[] = [];
  const otherContext = await browser.newContext({ baseURL, timezoneId: "Asia/Tokyo" });

  try {
    const created = await admin.auth.admin.createUser({
      email: otherEmail,
      password: otherPassword,
      email_confirm: true,
    });

    expect(created.error).toBeNull();
    otherUserId = created.data.user!.id;

    const profile = await admin
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", otherUserId);

    expect(profile.error).toBeNull();

    otherPage = await otherContext.newPage();
    otherPage.on("pageerror", error => pageErrors.push(
      error.message.replaceAll(otherPassword, "[redacted]").replaceAll(serviceKey!, "[redacted]"),
    ));

    await otherPage.goto("/en/auth/login");

    await submitLoginForm(
      otherPage,
      otherEmail,
      otherPassword,
    );

    await otherPage.waitForURL("**/en/dashboard");

    // User B must not see User A's Task in the workspace.
    await otherPage.goto("/en/workspace?goal=all");

    await expect(
      otherPage.locator("article").filter({
        hasText: fixture.title,
      }),
    ).toHaveCount(0);

    // Create an authenticated API client for User B,
    // explicitly using the ANON key, never service_role.
    otherClient = createClient(
      localUrl!,
      anonKey!,
      options,
    );

    const login = await otherClient.auth.signInWithPassword({
      email: otherEmail,
      password: otherPassword,
    });

    expect(login.error).toBeNull();

    const read = await otherClient
      .from("task_study_sessions")
      .select("id")
      .eq("id", fixture.sessionId);

    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const current = await readSession(fixture);

    const commandNames = [
      "ls_start_study_session",
      "ls_complete_study_session",
      "ls_skip_study_session",
      "ls_recover_study_session",
    ] as const;

    for (const rpcName of commandNames) {
      const args = {
        p_session_id: fixture.sessionId,
        p_expected_updated_at: current.updated_at,
        p_event_key: randomUUID(),
      };

      const payload = rpcName === "ls_skip_study_session"
        ? { ...args, p_reason: null }
        : args;

      const result = await otherClient.rpc(
        rpcName,
        payload,
      );

      expect(result.error?.code).toBe("42501");
      expect(result.data).toBeNull();
      denials.push({ rpc: rpcName, sqlstate: result.error?.code, httpStatus: result.status });
    }

    // Cross-owner requests must not change the real row.
    expect(await readSession(fixture)).toEqual(current);
    expect(await readEvents(fixture)).toEqual([]);

    browserReport.caseDetails["ATE-07"] = {
      otherUserId, browserTaskVisible: false, rlsRowsReturned: read.data?.length,
      denials, sessionUnchanged: true, eventCount: 0,
    };
  } finally {
    if (otherClient) {
      const signedOut = await otherClient.auth.signOut();
      expect(signedOut.error).toBeNull();
    }
    if (otherPage && !otherPage.isClosed()) {
      const signedOut = await otherPage.request.post("/auth/signout", { maxRedirects: 0 });
      expect(signedOut.status()).toBe(303);
    }
    await otherContext.close();

    if (otherUserId) {
      const deleted = await admin.auth.admin.deleteUser(
        otherUserId,
      );

      expect(deleted.error).toBeNull();
      browserReport.caseDetails["ATE-07"] = {
        ...(browserReport.caseDetails["ATE-07"] as Record<string, unknown> | undefined),
        otherUserId, otherUserCleanup: "PASS",
      };
    }
  }
});

