import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import { submitLoginForm } from "./helpers/auth";

// Only run these mutation tests against an explicitly configured local instance.
const localUrl = process.env.WORKSPACE_TEST_SUPABASE_URL;
test.skip(
  !localUrl || !/^http:\/\/(localhost|127\.0\.0\.1):/.test(localUrl),
  "Requires Supabase local test configuration",
);

let admin: SupabaseClient;
let client: SupabaseClient;
let userId: string;
let goalId: string;
const email = `workspace-${randomUUID()}@example.test`;
const password = randomUUID();

test.beforeAll(async () => {
  admin = createClient(localUrl!, process.env.WORKSPACE_TEST_SERVICE_KEY!, {
    auth: { persistSession: false },
  });
  client = createClient(localUrl!, process.env.WORKSPACE_TEST_ANON_KEY!, {
    auth: { persistSession: false },
  });
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
  if (profile.error) throw profile.error;
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error) throw login.error;
  const goal = await client
    .from("goals")
    .insert({
      user_id: userId,
      title: "Phase 3 test goal",
      goal_type: "short_term",
    })
    .select("id")
    .single();
  if (goal.error) throw goal.error;
  goalId = goal.data.id;
});

test.afterAll(async () => {
  if (userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) throw deleted.error;
  }
});

async function login(page: Page) {
  await page.goto("/en/auth/login");
  await submitLoginForm(page, email, password);
  await page.waitForURL("**/en/dashboard");
}

async function pointerMove(page: Page, title: string, from: string, to: string) {
  const board = page.getByRole("region", { name: "Task board" });
  await expect(board.locator("..")).toHaveAttribute("aria-busy", "false");
  const card = page.locator(`[data-status="${from}"] article`).filter({ hasText: title });
  const surface = card.getByRole("button", { name: title, exact: true });
  const target = page.locator(`[data-status="${to}"]`);
  await surface.scrollIntoViewIfNeeded();
  const sourceBox = await surface.boundingBox();
  if (!sourceBox) throw new Error("Missing card geometry");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2 + 10,
    sourceBox.y + sourceBox.height / 2,
    { steps: 5 },
  );
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error("Missing target lane");
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 55, {
    steps: 20,
  });
  await expect(target).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(`[data-status="${to}"] article`).filter({ hasText: title }),
  ).toBeVisible();
}

test("pointer workflow, scoped creation, managed lanes, stale update and responsive translations", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goalId}`);
  const todo = page.locator('[data-status="todo"]');
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await todo.getByRole("textbox", { name: "Task title" }).fill("Phase 3 pointer task");
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(todo.locator("article").filter({ hasText: "Phase 3 pointer task" })).toBeVisible();
  const loaded = await client
    .from("tasks")
    .select("id, goal_id")
    .eq("user_id", userId)
    .eq("title", "Phase 3 pointer task")
    .single();
  expect(loaded.error).toBeNull();
  expect(loaded.data?.goal_id).toBe(goalId);
  const id = loaded.data!.id;
  const card = todo.locator("article").filter({ hasText: "Phase 3 pointer task" });
  expect(await card.locator("button button").count()).toBe(0);
  await card.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close dialog", exact: true }).click();
  await pointerMove(page, "Phase 3 pointer task", "todo", "in_progress");
  await expect
    .poll(
      async () => (await client.from("tasks").select("status").eq("id", id).single()).data?.status,
    )
    .toBe("in_progress");
  await pointerMove(page, "Phase 3 pointer task", "in_progress", "completed");
  await expect
    .poll(
      async () =>
        (await client.from("tasks").select("completed_at").eq("id", id).single()).data
          ?.completed_at,
    )
    .toBeTruthy();
  await pointerMove(page, "Phase 3 pointer task", "completed", "in_progress");
  await expect
    .poll(
      async () =>
        (await client.from("tasks").select("completed_at").eq("id", id).single()).data
          ?.completed_at,
    )
    .toBeNull();
  await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");

  const change = await client
    .from("tasks")
    .update({ title: "Phase 3 concurrent task" })
    .eq("id", id);
  expect(change.error).toBeNull();
  // The browser still has the previous updated_at and must reject this move.
  const oldCard = page
    .locator('[data-status="in_progress"] article')
    .filter({ hasText: "Phase 3 pointer task" });
  await expect(oldCard).toBeVisible();
  const oldSurface = oldCard.getByRole("button", {
    name: "Phase 3 pointer task",
    exact: true,
  });
  await oldSurface.scrollIntoViewIfNeeded();
  const sourceBox = await oldSurface.boundingBox();
  const completed = page.locator('[data-status="completed"]');
  const box = await completed.boundingBox();
  if (!sourceBox || !box) throw new Error("Missing drag geometry");
  await page.mouse.move(sourceBox.x + 15, sourceBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 25, sourceBox.y + 15, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + 55, { steps: 20 });
  await expect(completed).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect(page.getByText("Task changed somewhere else. Refresh and try again.")).toBeVisible();
  await expect(
    page
      .locator('[data-status="in_progress"] article')
      .filter({ hasText: "Phase 3 concurrent task" }),
  ).toBeVisible();
  expect((await client.from("tasks").select("status").eq("id", id).single()).data?.status).toBe(
    "in_progress",
  );
  await expect(page.getByText("AI-managed stage")).toBeVisible();
  await expect(page.getByText("Automatically determined by deadline")).toBeVisible();
  await page
    .locator('[data-status="todo"]')
    .evaluate((element) => (element.parentElement!.scrollLeft = 0));
  await page.screenshot({
    path: "test-results/workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/vi/workspace?goal=${goalId}`);
  await expect(
    page.getByRole("heading", { name: "Không gian học tập", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('[data-status="todo"]').getByRole("button", { name: "Thêm nhiệm vụ", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
});

test("keyboard opens task details and moves the task through its status menu", async ({ page }) => {
  test.setTimeout(90_000);
  const inserted = await client
    .from("tasks")
    .insert({ user_id: userId, title: "Phase 3 keyboard task" });
  expect(inserted.error).toBeNull();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto("/en/workspace?goal=unassigned");
  const card = page
    .locator('[data-status="todo"] article')
    .filter({ hasText: "Phase 3 keyboard task" });
  const surface = card.getByRole("button", { name: "Phase 3 keyboard task", exact: true });
  await surface.press("Space");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(surface).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: "Move task Phase 3 keyboard task" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "In progress" })).toBeFocused();
  await expect(page.getByRole("menuitem", { name: "In review" })).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(
    page
      .locator('[data-status="in_progress"] article')
      .filter({ hasText: "Phase 3 keyboard task" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Task board" })).toBeFocused();
});

test("whole-card drag cancels cleanly and scrolls to a lane beyond the viewport", async ({ page }) => {
  test.setTimeout(90_000);
  const title = "Whole-card drag test";
  const { error } = await client.from("tasks").insert({ user_id: userId, goal_id: goalId, title });
  if (error) throw error;
  await page.setViewportSize({ width: 1400, height: 900 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goalId}`);
  const board = page.getByRole("region", { name: "Task board" });
  const surface = board.getByRole("button", { name: title, exact: true });
  const todo = board.locator('[data-status="todo"]');
  const review = board.locator('[data-status="in_review"]');
  const cancelled = board.locator('[data-status="cancelled"]');
  await surface.scrollIntoViewIfNeeded();
  const origin = await surface.boundingBox();
  const viewport = await board.boundingBox();
  const locked = await review.boundingBox();
  if (!origin || !viewport || !locked) throw new Error("Missing board geometry");

  const x = origin.x + 22;
  const y = origin.y + 20;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 2, y);
  await expect(board.locator('[data-drop-allowed="true"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  async function beginDrag() {
    await expect(page.locator("[data-dnd-dragging]")).toHaveCount(0);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 12, y, { steps: 3 });
    await expect(board.locator('[data-drop-allowed="true"]')).toHaveCount(3);
  }

  await beginDrag();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(todo.getByRole("button", { name: title, exact: true })).toBeVisible();

  await beginDrag();
  await page.mouse.move(locked.x + locked.width / 2, locked.y + 55, { steps: 20 });
  await expect(review).not.toHaveAttribute("data-drop-allowed", "true");
  await page.mouse.up();
  await expect(board.locator('[data-drop-allowed="true"]')).toHaveCount(0);
  await expect(todo.getByRole("button", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await beginDrag();
  await page.mouse.move(viewport.x + 10, viewport.y - 12, { steps: 8 });
  await expect(board.locator('[data-drop-target="true"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(todo.getByRole("button", { name: title, exact: true })).toBeVisible();

  await beginDrag();
  await page.mouse.move(viewport.x + viewport.width - 12, viewport.y + 65, { steps: 25 });
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(async () => {
    const box = await cancelled.boundingBox();
    return !!box && box.x + box.width / 2 < viewport.x + viewport.width - 24;
  }).toBe(true);
  const destination = await cancelled.boundingBox();
  if (!destination) throw new Error("Missing visible drop lane");
  await page.mouse.move(destination.x + destination.width / 2, destination.y + 55, { steps: 6 });
  await expect(cancelled).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect(cancelled.getByRole("button", { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test.describe("touch workspace", () => {
  test.use({ hasTouch: true, viewport: { width: 900, height: 900 } });

  test("tap opens details, swipe scrolls, and holding the card starts a drag", async ({ page }) => {
    test.setTimeout(90_000);
    const title = "Touch drag test";
    const { error } = await client.from("tasks").insert({ user_id: userId, goal_id: goalId, title });
    if (error) throw error;
    await login(page);
    await page.goto(`/en/workspace?goal=${goalId}`);
    const board = page.getByRole("region", { name: "Task board" });
    const surface = board.getByRole("button", { name: title, exact: true });
    const progress = board.locator('[data-status="in_progress"]');
    await surface.tap();
    const details = page.getByRole("dialog");
    await expect(details).toBeVisible();
    await details.getByRole("button", { name: "Close dialog", exact: true }).tap();
    await expect(details).toHaveCount(0);

    const box = await surface.boundingBox();
    const destination = await progress.boundingBox();
    if (!box || !destination) throw new Error("Missing touch geometry");
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove", x: number, y: number) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y }] });
    const touchEnd = () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await touch("touchStart", x, y);
    for (const delta of [25, 50, 75, 100]) await touch("touchMove", x - delta, y);
    await touchEnd();
    await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
    await expect(details).toHaveCount(0);
    await expect(board.locator('[data-drop-allowed="true"]')).toHaveCount(0);

    await surface.scrollIntoViewIfNeeded();
    await board.evaluate((el) => { el.scrollLeft = 0; });
    await touch("touchStart", x, y);
    await expect(progress).toHaveAttribute("data-drop-allowed", "true");
    await touch("touchMove", Math.round(destination.x + destination.width / 2), Math.round(destination.y + 75));
    await expect(progress).toHaveAttribute("data-drop-target", "true");
    await touchEnd();
    await expect(progress.getByRole("button", { name: title, exact: true })).toBeVisible();
    await expect(details).toHaveCount(0);
    await cdp.detach();
  });
});

test("cancel/restore, deadline precedence, reschedule and legacy pages", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const fixtures = await client
    .from("tasks")
    .insert([
      {
        user_id: userId,
        title: "Phase 3 restore task",
        status: "todo",
        due_at: null,
      },
      {
        user_id: userId,
        title: "Phase 3 past task",
        status: "in_progress",
        due_at: "2000-01-01T00:00:00Z",
      },
      {
        user_id: userId,
        title: "Phase 3 review task",
        status: "in_review",
        due_at: "2000-01-01T00:00:00Z",
      },
    ])
    .select("id, title");
  expect(fixtures.error).toBeNull();
  await login(page);
  await page.goto("/en/workspace?goal=unassigned");
  await expect(
    page.locator('[data-status="overdue"] article').filter({ hasText: "Phase 3 past task" }),
  ).toHaveCount(1);
  const review = page
    .locator('[data-status="in_review"] article')
    .filter({ hasText: "Phase 3 review task" });
  await expect(review.getByRole("button")).toHaveCount(1);
  await expect(review.getByRole("button", { name: "Phase 3 review task", exact: true })).toBeEnabled();
  await pointerMove(page, "Phase 3 restore task", "todo", "cancelled");
  await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  await pointerMove(page, "Phase 3 restore task", "cancelled", "todo");
  await expect(page.locator("[aria-busy]")).toHaveAttribute("aria-busy", "false");
  const overdueId = fixtures.data!.find((task) => task.title === "Phase 3 past task")!.id;
  const rescheduled = await client
    .from("tasks")
    .update({ due_at: "2099-01-01T00:00:00Z" })
    .eq("id", overdueId);
  expect(rescheduled.error).toBeNull();
  await page.reload();
  await expect(
    page.locator('[data-status="in_progress"] article').filter({ hasText: "Phase 3 past task" }),
  ).toBeVisible();
  await page.goto("/en/goals");
  await expect(page.getByText("Phase 3 test goal").first()).toBeVisible();
  const reviewId = fixtures.data!.find((task) => task.title === "Phase 3 review task")!.id;
  await page.goto(`/en/tasks?taskId=${reviewId}&action=edit`);
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox", { name: "Task title" })).toHaveValue("Phase 3 review task");
  await expect(editor.getByRole("combobox", { name: "Status" })).toHaveCount(0);
});

test("task details center on desktop, fit mobile, and restore focus after close or delete", async ({ page }) => {
  test.setTimeout(90_000);
  const title = "Review lecture notes and summarize the key concepts before the next study session";
  const description = "Summarize the key concepts and attach the supporting notes.";
  const { data: task, error } = await client.from("tasks").insert({
    user_id: userId,
    goal_id: goalId,
    title,
    description,
    estimated_minutes: 45,
  }).select("id").single();
  if (error) throw error;

  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goalId}`);
  const card = page.getByRole("button", { name: title, exact: true });
  await card.focus();
  await page.keyboard.press("Enter");
  const modal = page.getByRole("dialog", { name: title });
  await expect(modal).toBeVisible();
  const modalBox = (await modal.boundingBox())!;
  expect(Math.abs(modalBox.x + modalBox.width / 2 - 800)).toBeLessThan(2);
  const descriptionHeading = modal.getByRole("heading", { name: "Description" });
  const metadata = modal.getByRole("complementary", { name: "Details" });
  await expect(modal.getByText(description)).toBeVisible();
  await expect(metadata.getByText("45 minutes")).toBeVisible();
  await expect(metadata.getByRole("region", { name: "Task study schedule" })).toBeVisible();
  await expect(metadata.getByRole("button", { name: "Add study schedule" })).toBeVisible();
  expect((await metadata.boundingBox())!.x).toBeGreaterThan((await descriptionHeading.boundingBox())!.x);
  await page.screenshot({ path: "test-results/workspace-task-modal-desktop.png" });
  await page.keyboard.press("Tab");
  expect(await modal.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(card).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`/vi/workspace?goal=${goalId}&view=list&task=${task.id}&tab=documents`);
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(modal.getByRole("tab", { name: /Tài liệu/ })).toHaveAttribute("aria-selected", "true");
  await modal.getByRole("tab", { name: "Tổng quan" }).click();
  const mobileBox = (await modal.boundingBox())!;
  expect(mobileBox.width).toBeGreaterThan(350);
  expect(mobileBox.height).toBeGreaterThan(800);
  expect(await modal.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(modal.getByRole("button", { name: "Đóng hộp thoại", exact: true })).toBeVisible();
  await expect(modal.getByRole("region", { name: "Lịch học của công việc" }).getByRole("button", { name: /Thêm/ })).toBeVisible();
  await page.screenshot({ path: "test-results/workspace-task-modal-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Vùng hiển thị nhiệm vụ" })).toBeFocused();

  await page.goto(`/en/workspace?goal=${goalId}&view=list`);
  const rowLink = page.getByRole("link", { name: title });
  await rowLink.click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rowLink).toBeFocused();

  await rowLink.click();
  await expect(modal).toBeVisible();
  const actions = modal.getByRole("button", { name: "Task actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  let confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(actions).toBeFocused();
  await actions.click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  confirmation = page.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(rowLink).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Task view" })).toBeFocused();
});

test("List scopes, sorts and filters tasks, opens details, and restores the view through browser history", async ({ page }) => {
  test.setTimeout(90_000);
  const { data: goal, error: goalError } = await client.from("goals").insert({
    user_id: userId,
    title: "List test goal",
    goal_type: "short_term",
  }).select("id").single();
  if (goalError) throw goalError;
  const scope = { user_id: userId, goal_id: goal.id };
  const { data: tasks, error: taskError } = await client.from("tasks").insert([
    { ...scope, title: "Active overdue", status: "todo", due_at: "2000-01-01T00:00:00Z" },
    { ...scope, title: "Completed with an old deadline", status: "completed", due_at: "2001-01-01T00:00:00Z" },
    { ...scope, title: "Latest deadline", status: "todo", due_at: "2099-01-01T00:00:00Z" },
    ...Array.from({ length: 20 }, (_, index) => ({
      ...scope, title: `Undated item ${index + 1}`, status: "todo", due_at: null,
    })),
  ]).select("id,title,created_at,updated_at");
  if (taskError) throw taskError;
  const overdue = tasks.find((task) => task.title === "Active overdue")!;
  const { error: childError } = await client.from("tasks").insert([
    { ...scope, parent_task_id: overdue.id, title: "Done child", status: "completed" },
    { ...scope, parent_task_id: overdue.id, title: "Open child", status: "todo" },
  ]);
  if (childError) throw childError;

  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goal.id}`);
  const tabs = page.getByRole("navigation", { name: "Workspace views" });
  await expect(tabs.getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "List" }).click();
  const table = page.getByRole("table", { name: "Task list" });
  await expect(table.getByRole("row")).toHaveCount(21);
  await expect(table.getByRole("columnheader", { name: "Created at" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Updated at" })).toBeVisible();
  const overdueRow = table.getByRole("row").filter({ hasText: "Active overdue" });
  await expect(overdueRow.locator("time").nth(1)).toHaveAttribute("datetime", overdue.created_at);
  await expect(overdueRow.locator("time").nth(2)).toHaveAttribute("datetime", overdue.updated_at);
  await expect(overdueRow.getByText("Overdue", { exact: true })).toBeVisible();
  await expect(overdueRow.getByLabel("1 of 2 subtasks completed")).toBeVisible();
  await expect(table.getByText("Done child")).toHaveCount(0);
  await page.screenshot({ path: "test-results/workspace-list.png" });

  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(table.getByRole("row")).toHaveCount(4);
  await table.getByRole("link", { name: "Show latest due dates first" }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("Latest deadline");

  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Overdue", exact: true }).click();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table.getByText("Completed with an old deadline")).toHaveCount(0);
  await overdueRow.getByRole("link", { name: "Active overdue" }).click();
  const details = page.getByRole("dialog", { name: "Active overdue" });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await details.getByRole("textbox", { name: "Task title" }).fill("Renamed overdue task");
  await details.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Renamed overdue task" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/view=list&status=overdue&sort=desc$/);
  await expect(table.getByRole("link", { name: "Renamed overdue task" })).toBeVisible();
  const renamedRow = table.getByRole("row").filter({ hasText: "Renamed overdue task" });
  await expect(renamedRow.locator("time").nth(1)).toHaveAttribute("datetime", overdue.created_at);
  await expect(renamedRow.locator("time").nth(2)).not.toHaveAttribute("datetime", overdue.updated_at);

  await tabs.getByRole("link", { name: "Timeline" }).click();
  await expect(page.getByRole("heading", { name: "Timeline", exact: true })).toBeVisible();
  await expect(table).toHaveCount(0);
  await page.goBack();
  await expect(tabs.getByRole("link", { name: "List" })).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveText("Overdue");
});

test("large Board goals page each lane independently and keep a link to newly created tasks", async ({ page }) => {
  test.setTimeout(90_000);
  const { data: goal, error: goalError } = await client.from("goals").insert({
    user_id: userId,
    title: "Large Board goal",
    goal_type: "short_term",
  }).select("id").single();
  if (goalError) throw goalError;
  const { error: taskError } = await client.from("tasks").insert(
    Array.from({ length: 101 }, (_, index) => ({
      user_id: userId,
      goal_id: goal.id,
      title: `Board paging #${index + 1}`,
      status: index < 45 ? "todo" : "in_progress",
    })),
  );
  if (taskError) throw taskError;

  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goal.id}`);
  const todo = page.locator('[data-status="todo"]');
  const active = page.locator('[data-status="in_progress"]');
  const firstActiveTask = await active.locator("article h3").first().textContent();
  await expect(todo.locator("header").getByText("45", { exact: true })).toBeVisible();
  await expect(todo.locator("article")).toHaveCount(20);
  await todo.getByRole("link", { name: "Next page in Todo" }).click();
  await expect(todo.getByText("Page 2 of 3")).toBeVisible();
  await expect(active.locator("article h3").first()).toHaveText(firstActiveTask!);

  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await todo.getByRole("textbox", { name: "Task title" }).fill("Quick create on a later page");
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await page.getByRole("button", { name: "Open task", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Quick create on a later page" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(todo.getByText("Page 2 of 3")).toBeVisible();
  await expect(todo.locator("header").getByText("46", { exact: true })).toBeVisible();
});

test("goal browsing is paginated and searchable without opening the board", async ({ page }) => {
  const titles = Array.from({ length: 24 }, (_, index) => `Workspace pagination ${index + 1}`);
  const { data, error } = await client
    .from("goals")
    .insert(titles.map((title, index) => ({
      user_id: userId,
      title,
      goal_type: "short_term",
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    })))
    .select("id, title");
  if (error) throw error;
  const oldest = data.find((goal) => goal.title === titles[0])!;

  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto("/en/workspace?goal=all");
  await expect(page.getByRole("heading", { name: "Choose a goal to get started" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Task board" })).toHaveCount(0);

  const rail = page.getByRole("navigation", { name: "Goals", exact: true });
  const oldestLink = rail.getByRole("link").filter({ has: page.getByText(titles[0], { exact: true }) });
  await expect(rail.getByRole("listitem")).toHaveCount(20);
  await expect(oldestLink).toHaveCount(0);
  await rail.getByRole("button", { name: "Load more" }).click();
  await expect(oldestLink).toBeVisible();

  await page.reload();
  await rail.getByRole("searchbox", { name: "Search goals" }).fill(titles[0]);
  await expect(oldestLink).toBeVisible();
  await expect(page.getByRole("region", { name: "Task board" })).toHaveCount(0);
  await oldestLink.click();
  await expect(page).toHaveURL(new RegExp(`goal=${oldest.id}$`));
  await expect(page.getByRole("heading", { name: titles[0], exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Task board" })).toBeVisible();
});

test("recovery destinations require Save or Start before writing", async ({ page }) => {
  test.skip(process.env.FOCUS_V2_ENABLED === "true", "This case submits the legacy Focus form");
  test.setTimeout(120_000);
  const title = "Phase 4 recovery task";
  const dueAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
  dueAt.setUTCMinutes(0, 0, 0);
  const { data: task, error } = await client
    .from("tasks")
    .insert({ user_id: userId, goal_id: goalId, title, due_at: dueAt.toISOString() })
    .select("id, due_at, updated_at")
    .single();
  if (error) throw error;
  const taskId = task.id;

  async function readTask() {
    const { data, error } = await client
      .from("tasks")
      .select("id, due_at, updated_at")
      .eq("id", taskId)
      .single();
    if (error) throw error;
    return data;
  }

  async function activeSessions() {
    const { data, error } = await client
      .from("focus_sessions")
      .select("task_id")
      .eq("user_id", userId)
      .eq("status", "ongoing");
    if (error) throw error;
    return data;
  }

  await login(page);
  await page.goto(`/en/workspace?task=${taskId}&tab=overview&edit=1`);
  const drawer = page.getByRole("dialog");
  const dueTime = drawer.locator('input[type="time"]');
  await expect(dueTime).toBeVisible();
  expect(await readTask()).toEqual(task);
  const changedTime = (await dueTime.inputValue()) === "16:30" ? "17:30" : "16:30";
  await dueTime.fill(changedTime);
  expect(await readTask()).toEqual(task);
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await readTask()).due_at).not.toBe(task.due_at);

  await page.goto(`/en/focus?taskId=${taskId}`);
  await expect(page.getByRole("combobox", { name: "Linked task" })).toHaveText(title);
  expect(await activeSessions()).toEqual([]);
  await page.getByRole("button", { name: "Start focus session", exact: true }).click();
  await expect.poll(activeSessions).toEqual([{ task_id: taskId }]);
});
