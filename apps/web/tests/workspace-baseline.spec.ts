import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { submitLoginForm } from "./helpers/auth";
import type { Database } from "../types/database.types";

const apiUrl = process.env.WORKSPACE_TEST_SUPABASE_URL;
const serviceKey = process.env.WORKSPACE_TEST_SERVICE_KEY;
const publicKey = process.env.WORKSPACE_TEST_ANON_KEY;
const appUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const expectPreview = process.env.WORKSPACE_BASELINE_EXPECT_PREVIEW === "1";
const loopback = /^http:\/\/(?:127\.0\.0\.1|localhost):\d+\/?$/;
const enabled =
  process.env.WORKSPACE_BASELINE === "1" &&
  !!apiUrl && loopback.test(apiUrl) &&
  !!appUrl && loopback.test(appUrl) &&
  !!serviceKey && !!publicKey;

test.skip(!enabled, "Baseline requires an explicitly configured local production build and local Supabase");
test.setTimeout(180_000);

const profiles = [
  { name: "desktop", viewport: { width: 1440, height: 900 } },
  { name: "mobile-viewport", viewport: { width: 390, height: 844 } },
];

for (const rootCount of [50, 500, 5000]) {
  test(`workspace baseline · ${rootCount} root tasks`, async ({ browser }, testInfo) => {
    const auth = { persistSession: false, autoRefreshToken: false };
    const admin = createClient<Database>(apiUrl!, serviceKey!, { auth });
    const user = createClient<Database>(apiUrl!, publicKey!, { auth });
    const email = `workspace-baseline-${randomUUID()}@example.test`;
    const password = randomUUID();
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    const userId = created.data.user.id;
    const goalCount = rootCount / 10;
    const samples = [];

    try {
      const profile = await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId);
      if (profile.error) throw profile.error;
      const login = await user.auth.signInWithPassword({ email, password });
      if (login.error) throw login.error;

      const goals = Array.from({ length: goalCount }, (_, index) => ({
        id: randomUUID(),
        user_id: userId,
        title: `Baseline goal ${index + 1}`,
        goal_type: "short_term" as const,
      }));
      const goalResult = await user.from("goals").insert(goals);
      if (goalResult.error) throw goalResult.error;

      const statuses = ["todo", "in_progress", "completed", "cancelled"] as const;
      const now = Date.now();
      const roots = Array.from({ length: rootCount }, (_, index) => ({
        id: randomUUID(),
        user_id: userId,
        goal_id: index % 10 === 0 ? null : goals[index % goalCount].id,
        title: `Baseline task ${index + 1}`,
        description: "Sample description for the Workspace baseline. ".repeat(8),
        status: statuses[index % statuses.length],
        due_at: index % 4 === 1 ? null : new Date(now + (index % 21 - 10) * 86_400_000).toISOString(),
        completed_at: index % 4 === 2 ? new Date(now).toISOString() : null,
      }));
      const children = roots.flatMap((root, index) =>
        index % 4 === 0
          ? [1, 2].map((child) => ({
              user_id: userId,
              goal_id: root.goal_id,
              parent_task_id: root.id,
              title: `Baseline checklist ${child}`,
            }))
          : [],
      );

      const batches: Database["public"]["Tables"]["tasks"]["Insert"][][] = [roots, children];
      for (const rows of batches) {
        for (let offset = 0; offset < rows.length; offset += 250) {
          const result = await user.from("tasks").insert(rows.slice(offset, offset + 250));
          if (result.error) throw result.error;
        }
      }

      const loginPage = await browser.newPage();
      const session = await (async () => {
        try {
          await loginPage.goto(`${appUrl}/en/auth/login`);
          await submitLoginForm(loginPage, email, password);
          await loginPage.waitForURL("**/en/dashboard");
          return await loginPage.context().storageState();
        } finally {
          await loginPage.close();
        }
      })();

      for (const profile of profiles) {
        for (let run = 1; run <= 5; run++) {
          const page = await browser.newPage({ viewport: profile.viewport, storageState: session });
          try {
            await page.addInitScript(() => {
              const measurements = { lcpMs: 0, cls: 0 };
              Object.assign(window, { workspaceBaseline: measurements });
              new PerformanceObserver((list) => {
                measurements.lcpMs = list.getEntries().at(-1)?.startTime ?? 0;
              }).observe({ type: "largest-contentful-paint", buffered: true });
              let sessionStart = 0;
              let lastShift = 0;
              let sessionValue = 0;
              new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
                  if (shift.hadRecentInput) continue;
                  if (!sessionValue || shift.startTime - lastShift >= 1000 || shift.startTime - sessionStart >= 5000) {
                    sessionStart = shift.startTime;
                    sessionValue = 0;
                  }
                  lastShift = shift.startTime;
                  sessionValue += shift.value;
                  measurements.cls = Math.max(measurements.cls, sessionValue);
                }
              }).observe({ type: "layout-shift", buffered: true });
            });
            const response = await page.goto(`${appUrl}/en/workspace`, { waitUntil: "load" });
            await expect(page).toHaveURL(`${appUrl}/en/workspace`);
            const cards = expectPreview
              ? page.getByTestId("workspace-preview-task")
              : page.locator("[data-status] article");
            const errorState = page.locator("section[role=alert]");
            await expect(cards.first().or(errorState).first()).toBeVisible();
            if (expectPreview) {
              await expect(cards).toHaveCount(25);
              await expect(page.getByTestId("workspace-preview-total")).toHaveText(`${rootCount.toLocaleString("en")} matching tasks`);
            }
            await page.evaluate(() => document.fonts.ready.then(() => undefined));
            await page.evaluate(() => new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ));
            samples.push({
              profile: profile.name,
              run,
              httpStatus: response?.status(),
              outcome: await errorState.isVisible() ? "route-error" : expectPreview ? "preview" : "board",
              cards: await cards.count(),
              ...await page.evaluate(() => {
                const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
                const metrics = (window as unknown as { workspaceBaseline: { lcpMs: number; cls: number } }).workspaceBaseline;
                const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
                return {
                  ttfbMs: Math.round(navigation.responseStart),
                  documentEncodedBytes: navigation.encodedBodySize,
                  scriptTransferBytes: resources.filter((entry) => entry.initiatorType === "script").reduce((sum, entry) => sum + entry.transferSize, 0),
                  domNodes: document.querySelectorAll("*").length,
                  ...metrics,
                };
              }),
            });
          } finally {
            await page.close();
          }
        }
      }

      const report = JSON.stringify({ rootCount, goalCount, childCount: children.length, samples }, null, 2);
      console.log(report);
      await testInfo.attach("workspace-baseline.json", { body: report, contentType: "application/json" });

      if (expectPreview && rootCount === 500) {
        const page = await browser.newPage({ storageState: session });
        try {
          const initial = await page.goto(`${appUrl}/en/workspace`);
          const html = await initial!.text();
          expect(html).not.toContain("Sample description for the Workspace baseline.");
          expect(html).not.toContain("Baseline checklist 1");
          const taskLinks = page.getByTestId("workspace-preview-task").getByRole("link");
          await expect(taskLinks).toHaveCount(25);
          const firstTitles = await taskLinks.allTextContents();
          await page.getByRole("link", { name: "Next page" }).click();
          await expect(page).toHaveURL(/after=/);
          await expect(taskLinks).toHaveCount(25);
          expect((await taskLinks.allTextContents()).some((title) => firstTitles.includes(title))).toBe(false);

          const outsidePage = roots.find((root) => !firstTitles.includes(root.title))!;
          await page.goto(`${appUrl}/en/workspace?task=${outsidePage.id}&tab=overview&edit=1`);
          const drawer = page.getByRole("dialog");
          await expect(drawer.getByRole("heading", { name: outsidePage.title })).toBeVisible();
          await expect(drawer.getByRole("textbox", { name: "Task title" })).toHaveValue(outsidePage.title);
          await page.keyboard.press("Escape");
          await expect(page).not.toHaveURL(/task=/);

          await page.getByRole("textbox", { name: "Search task titles" }).fill("Baseline task 1");
          await page.locator('select[name="status"]').selectOption("cancelled");
          await page.getByRole("button", { name: "Apply filters" }).click();
          const matching = roots.filter((task) => task.title.includes("Baseline task 1") && task.status === "cancelled");
          await expect(page.getByTestId("workspace-preview-total")).toHaveText(`${matching.length} matching tasks`);
          await expect(taskLinks).toHaveCount(Math.min(25, matching.length));

          await page.getByRole("link", { name: "Clear filters" }).click();
          await expect(page).toHaveURL(`${appUrl}/en/workspace`);
          await expect(page.getByTestId("workspace-preview-total")).toHaveText("500 matching tasks");
          const goalPicker = page.getByLabel("Goal", { exact: true });
          await expect(goalPicker.locator("option")).toHaveCount(10);
          await page.getByRole("textbox", { name: "Search goals", exact: true }).fill("Baseline goal 50");
          await page.getByRole("button", { name: "Search", exact: true }).click();
          await expect(goalPicker.locator(`option[value="${goals[49].id}"]`)).toHaveText("Baseline goal 50");
          await goalPicker.selectOption(goals[49].id);
          await expect(goalPicker).toHaveValue(goals[49].id);
          await page.getByRole("button", { name: "Apply filters" }).click();
          await expect(page).toHaveURL(new RegExp(`[?&]goal=${goals[49].id}(?:&|$)`));
          const goalTasks = roots.filter((task) => task.goal_id === goals[49].id);
          await expect(page.getByTestId("workspace-preview-total")).toHaveText(`${goalTasks.length} matching tasks`);
          await expect(taskLinks).toHaveCount(goalTasks.length);
          const anonymous = createClient<Database>(apiUrl!, publicKey!, { auth });
          const anonymousPage = await anonymous.rpc("get_workspace_task_page");
          expect(anonymousPage.error).not.toBeNull();

          const other = await admin.auth.admin.createUser({
            email: `workspace-other-${randomUUID()}@example.test`,
            password: randomUUID(),
            email_confirm: true,
          });
          if (other.error) throw other.error;
          try {
            const foreignTaskId = randomUUID();
            const foreignTask = await admin.from("tasks").insert({
              id: foreignTaskId,
              user_id: other.data.user.id,
              title: "Foreign private task",
            });
            if (foreignTask.error) throw foreignTask.error;
            await page.goto(`${appUrl}/en/workspace?task=${foreignTaskId}&q=Foreign+private+task`);
            await expect(page.getByText("This task is unavailable.")).toBeVisible();
            await expect(page.getByTestId("workspace-preview-total")).toHaveText("0 matching tasks");
            await expect(page.getByRole("dialog")).toHaveCount(0);
          } finally {
            const removed = await admin.auth.admin.deleteUser(other.data.user.id);
            if (removed.error) throw removed.error;
          }
        } finally {
          await page.close();
        }
      }
    } finally {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) throw removed.error;
    }
  });
}
