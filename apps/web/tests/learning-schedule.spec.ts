import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { submitLoginForm } from "./helpers/auth";

const url = process.env.LEARNING_SCHEDULE_TEST_URL;
const key = process.env.LEARNING_SCHEDULE_TEST_SERVICE_KEY;
test.skip(!url || !key, "Opt-in: requires Supabase local credentials");
test.describe.configure({ mode: "serial", timeout: 120_000 });
test.use({ timezoneId: "Asia/Tokyo", actionTimeout: 15_000 });
let admin: SupabaseClient; let userId: string; let goalId: string; let taskId: string; let scheduleId: string;
const email = `schedule-browser-${randomUUID()}@example.invalid`;
const password = randomUUID();
const title = "Schedule browser fixture";
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let pageErrors: string[] = [];

test.beforeAll(async ({ baseURL }) => {
  expect(new URL(url!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/); expect(new URL(url!).port).toBe("55321");
  expect(new URL(baseURL!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  admin = createClient(url!, key!, options);
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error; userId = created.data.user.id;
  const profile = await admin.from("profiles").update({ onboarding_completed: true }).eq("id", userId); expect(profile.error).toBeNull();
  const goal = await admin.from("goals").insert({ user_id: userId, title: "Schedule browser goal", goal_type: "short_term" }).select("id").single();
  expect(goal.error).toBeNull(); goalId = goal.data!.id;
});
test.afterAll(async () => {
  if (!userId) return;
  const deleted = await admin.auth.admin.deleteUser(userId); expect(deleted.error).toBeNull();
  const tasks = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", userId);
  expect(tasks.error).toBeNull(); expect(tasks.count).toBe(0);
});
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto("/en/auth/login"); await submitLoginForm(page, email, password); await page.waitForURL("**/en/dashboard");
});
test.afterEach(() => { expect(pageErrors).toEqual([]); });
async function openTask(page: Page, locale = "en", taskTitle = title) {
  await page.goto(`/${locale}/workspace?goal=${goalId}`);
  await page.locator("article").filter({ hasText: taskTitle }).getByRole("button").first().click();
  await page.getByRole("tab", { name: locale === "en" ? "Overview" : "Tổng quan", exact: true }).click();
}
const section = (page: Page) => page.getByRole("region", { name: "Task study schedule", exact: true });
async function rows() { const r = await admin.from("task_study_sessions").select("*").eq("schedule_id", scheduleId).order("id"); expect(r.error).toBeNull(); return r.data!; }
async function quickCreate(page: Page, name: string) {
  const todo = page.locator('[data-status="todo"]');
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await todo.getByRole("textbox", { name: "Task title" }).fill(name);
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(todo.locator("article").filter({ hasText: name })).toBeVisible();
}

test("E2E-01 authenticated browser creates Task and Schedule via real Server Actions", async ({ page }) => {
  await page.goto(`/en/workspace?goal=${goalId}`); await quickCreate(page, title); await openTask(page);
  await section(page).getByRole("button", { name: "Add study schedule", exact: true }).click();
  await page.getByLabel("End date", { exact: true }).fill("2030-01-21");
  await page.getByLabel("Start date", { exact: true }).fill("2030-01-07");
  await page.getByLabel("IANA timezone", { exact: true }).fill("Asia/Ho_Chi_Minh");
  await page.getByLabel("Weekday", { exact: true }).selectOption("1");
  await page.getByLabel("Start", { exact: true }).fill("19:00"); await page.getByLabel("End", { exact: true }).fill("20:30");
  await section(page).getByRole("button", { name: "Continue", exact: true }).click();
  await expect(section(page).getByText("Revision: 1", { exact: true })).toBeVisible();
  const task = await admin.from("tasks").select("id").eq("user_id", userId).eq("title", title).single(); expect(task.error).toBeNull(); taskId = task.data!.id;
  const schedule = await admin.from("task_study_schedules").select("id").eq("task_id", taskId).single(); expect(schedule.error).toBeNull(); scheduleId = schedule.data!.id;
  expect(await rows()).toHaveLength(3);
});
test("E2E-02 browser reload retains persisted Schedule and local wall-clock times", async ({ page }) => {
  await openTask(page); await page.reload(); await page.locator("article").filter({ hasText: title }).getByRole("button").first().click();
  await expect(section(page).getByText("Revision: 1", { exact: true })).toBeVisible();
  await expect(section(page).getByRole("listitem")).toHaveCount(3); await expect(section(page).getByText(/19:00 – 20:30/).first()).toBeVisible();
});
test("E2E-03 whole revision requires impact confirmation before saving", async ({ page }) => {
  await openTask(page); await section(page).getByRole("button", { name: "Edit recurring schedule", exact: true }).click();
  await page.getByLabel("Start", { exact: true }).fill("20:00"); await page.getByLabel("End", { exact: true }).fill("21:00");
  await section(page).getByRole("button", { name: "Continue", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm recurring schedule revision", exact: true });
  await expect(confirm.getByText(/Future scheduled sessions will be cancelled/)).toBeVisible();
  expect((await admin.from("task_study_schedules").select("revision").eq("id", scheduleId).single()).data?.revision).toBe(1);
  await confirm.getByRole("button", { name: "Back to draft" }).click(); await expect(section(page).getByRole("button", { name: "Continue" })).toBeFocused();
  await section(page).getByRole("button", { name: "Continue", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm revision", exact: true }).click();
  await expect(section(page).getByText("Revision: 2", { exact: true })).toBeVisible();
});
test("E2E-04 revised schedule preserves cancellation history and audit", async ({ page }) => {
  await openTask(page); const all = await rows(); expect(all).toHaveLength(6); expect(all.filter(x => x.status === "cancelled")).toHaveLength(3);
  const cancelled = all.filter(x => x.status === "cancelled").map(x => x.id);
  const events = await admin.from("task_study_session_events").select("id").in("session_id", cancelled).eq("event_type", "cancelled");
  expect(events.error).toBeNull(); expect(events.data).toHaveLength(3);
  await expect(section(page).getByText("Cancelled", { exact: true })).toHaveCount(3);
});
test("E2E-05 reschedules selected ID only and reloads updated time", async ({ page }) => {
  await openTask(page); const before = await rows();
  await section(page).getByRole("button", { name: "Reschedule", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Reschedule study session", exact: true });
  await dialog.getByLabel("New date", { exact: true }).fill("2030-01-08"); await dialog.getByLabel("Start time", { exact: true }).fill("18:00"); await dialog.getByLabel("End time", { exact: true }).fill("19:00");
  // Delay transport, then continue the real request; never replace the action/RPC response.
  let release!: () => void; let held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/en/workspace**", async route => {
    if (!held && route.request().method() === "POST" && route.request().headers()["next-action"]) { held = true; await gate; }
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Confirm reschedule", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  } finally { release(); }
  await expect(dialog).not.toBeVisible(); await page.unroute("**/en/workspace**");
  await expect(section(page).getByText(/18:00 – 19:00/)).toBeVisible();
  const after = await rows(); const moved = after.filter(x => x.local_date === "2030-01-08"); expect(moved).toHaveLength(1);
  expect(before.map(x => x.id)).toEqual(after.map(x => x.id)); expect(after.filter(x => x.id !== moved[0].id)).toEqual(before.filter(x => x.id !== moved[0].id));
  const event = await admin.from("task_study_session_events").select("id").eq("session_id", moved[0].id).eq("event_type", "rescheduled"); expect(event.data).toHaveLength(1);
});
test("E2E-06 two browser tabs reject a stale revision without overwrite", async ({ page, context }) => {
  await openTask(page); const other = await context.newPage();
  try {
    await openTask(other); for (const p of [page, other]) { await section(p).getByRole("button", { name: "Edit recurring schedule", exact: true }).click(); await expect(p.getByLabel("Start", { exact: true })).toBeVisible(); }
    await page.getByLabel("Start", { exact: true }).fill("21:00"); await page.getByLabel("End", { exact: true }).fill("22:00");
    await section(page).getByRole("button", { name: "Continue" }).click(); await page.getByRole("button", { name: "Confirm revision", exact: true }).click(); await expect(section(page).getByText("Revision: 3", { exact: true })).toBeVisible();
    await section(other).getByRole("button", { name: "Continue" }).click(); await other.getByRole("button", { name: "Confirm revision", exact: true }).click();
    await expect(section(other).getByRole("alert")).toContainText("changed elsewhere"); await expect(section(other).getByRole("button", { name: "Discard draft and reload" })).toBeVisible();
    expect((await admin.from("task_study_schedules").select("revision").eq("id", scheduleId).single()).data?.revision).toBe(3);
  } finally { await other.close(); }
});
test("E2E-07 Vietnamese UI keeps schedule timezone even on a Tokyo device", async ({ page }) => {
  await openTask(page, "vi"); const vi = page.getByRole("region", { name: "Lịch học của công việc", exact: true });
  await expect(vi.getByRole("heading", { name: "Lịch học", exact: true })).toBeVisible();
  await expect(vi.getByText("Đã hủy", { exact: true }).first()).toBeVisible(); await expect(vi.getByRole("button", { name: "Dời lịch", exact: true }).first()).toBeVisible();
  await vi.getByRole("button", { name: "Dời lịch", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Dời lịch buổi học" });
  await expect(dialog.getByText("Múi giờ: Asia/Ho_Chi_Minh", { exact: true })).toBeVisible(); await expect(dialog.getByLabel("Giờ bắt đầu")).toHaveValue("21:00");
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
});
test("E2E-08 keyboard opens, traverses and closes Dialog with focus restoration", async ({ page }) => {
  await openTask(page); const opener = section(page).getByRole("button", { name: "Reschedule", exact: true }).first();
  await page.locator("[data-study-sessions-heading]").focus();
  for (let i = 0; i < 20 && !(await opener.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(opener).toBeFocused(); await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Reschedule study session", exact: true }); await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  const visited = new Set<string>();
  for (let i = 0; i < 24; i++) { visited.add(await page.evaluate(() => document.activeElement?.closest("label")?.querySelector("span")?.textContent ?? document.activeElement?.textContent ?? "")); await page.keyboard.press("Tab"); }
  for (const label of ["New date", "Start time", "End time", "Confirm reschedule"]) expect([...visited].some(x => x.trim() === label)).toBe(true);
  await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(opener).toBeFocused();
});
test("E2E-09 mobile EN/VI has no document or scheduling horizontal overflow", async ({ page }, info) => {
  await openTask(page);
  await page.screenshot({ path: info.outputPath("schedule-en-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const locale of ["en", "vi"]) {
    await openTask(page, locale); const name = locale === "en" ? "Task study schedule" : "Lịch học của công việc";
    await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.getByRole("region", { name, exact: true }).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`schedule-${locale}-mobile.png`), fullPage: true });
    const schedule = page.getByRole("region", { name, exact: true });
    await schedule.getByRole("button", { name: locale === "en" ? "Edit recurring schedule" : "Chỉnh sửa lịch học lặp lại", exact: true }).click();
    await expect(page.getByLabel(locale === "en" ? "Start date" : "Ngày bắt đầu", { exact: true })).toBeVisible();
    expect(await schedule.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`schedule-editor-${locale}-mobile.png`), fullPage: true });
    await schedule.getByRole("button", { name: locale === "en" ? "Cancel" : "Hủy", exact: true }).click();
    await schedule.getByRole("button", { name: locale === "en" ? "Reschedule" : "Dời lịch", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: locale === "en" ? "Reschedule study session" : "Dời lịch buổi học", exact: true });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().width <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`reschedule-${locale}-mobile.png`), fullPage: true });
    await dialog.getByRole("button", { name: locale === "en" ? "Cancel" : "Hủy", exact: true }).click();
  }
});
test("E2E-10 unscheduled Task retains edit, status transition and delete", async ({ page }) => {
  const name = "Unscheduled browser fixture"; await page.goto(`/en/workspace?goal=${goalId}`); await quickCreate(page, name);
  const card = page.locator('[data-status="todo"] article').filter({ hasText: name });
  const handle = card.getByRole("button", { name: "Drag task", exact: true });
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox();
  if (!source) throw new Error("Missing drag source");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down(); await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2, { steps: 5 });
  const target = page.locator('[data-status="in_progress"]'); await target.scrollIntoViewIfNeeded();
  const destination = await target.boundingBox(); if (!destination) throw new Error("Missing drop target");
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 55, { steps: 20 }); await page.mouse.up();
  await expect(page.locator('[data-status="in_progress"] article').filter({ hasText: name })).toBeVisible();
  await openTask(page, "en", name); await expect(section(page).getByRole("button", { name: "Add study schedule" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click(); await page.getByLabel("Task title", { exact: true }).fill(name + " edited"); await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: name + " edited", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete task", exact: true }).click(); await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("article").filter({ hasText: name })).toHaveCount(0);
});
