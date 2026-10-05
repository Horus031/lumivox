import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

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
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /login/i }).click();
  await page.waitForURL("**/en/dashboard");
}

async function pointerMove(
  page: Page,
  title: string,
  from: string,
  to: string,
) {
  const card = page
    .locator(`[data-status="${from}"] article`)
    .filter({ hasText: title });
  const handle = card.getByRole("button", { name: "Drag task", exact: true });
  const target = page.locator(`[data-status="${to}"]`);
  await expect(handle).toHaveAttribute("aria-describedby", /dnd/);
  await handle.scrollIntoViewIfNeeded();
  const sourceBox = await handle.boundingBox();
  if (!sourceBox) throw new Error("Missing drag handle");
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
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
  await page.mouse.up();
  await expect(
    page.locator(`[data-status="${to}"] article`).filter({ hasText: title }),
  ).toBeVisible();
}

test("pointer workflow, quick create, managed lanes, stale update and responsive translations", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto(`/en/workspace?goal=${goalId}`);
  const todo = page.locator('[data-status="todo"]');
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await todo
    .getByRole("textbox", { name: "Task title" })
    .fill("Phase 3 pointer task");
  await todo.getByRole("button", { name: "Add task", exact: true }).click();
  await expect(
    todo.locator("article").filter({ hasText: "Phase 3 pointer task" }),
  ).toBeVisible();
  const loaded = await client
    .from("tasks")
    .select("id, goal_id")
    .eq("user_id", userId)
    .eq("title", "Phase 3 pointer task")
    .single();
  expect(loaded.error).toBeNull();
  expect(loaded.data?.goal_id).toBe(goalId);
  const id = loaded.data!.id;
  const card = todo
    .locator("article")
    .filter({ hasText: "Phase 3 pointer task" });
  expect(await card.locator("button button").count()).toBe(0);
  await card.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  await pointerMove(page, "Phase 3 pointer task", "todo", "in_progress");
  await expect
    .poll(
      async () =>
        (await client.from("tasks").select("status").eq("id", id).single()).data
          ?.status,
    )
    .toBe("in_progress");
  await pointerMove(page, "Phase 3 pointer task", "in_progress", "completed");
  await expect
    .poll(
      async () =>
        (
          await client
            .from("tasks")
            .select("completed_at")
            .eq("id", id)
            .single()
        ).data?.completed_at,
    )
    .toBeTruthy();
  await pointerMove(page, "Phase 3 pointer task", "completed", "in_progress");
  await expect
    .poll(
      async () =>
        (
          await client
            .from("tasks")
            .select("completed_at")
            .eq("id", id)
            .single()
        ).data?.completed_at,
    )
    .toBeNull();
  await expect(page.locator("[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "false",
  );

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
  const oldHandle = oldCard.getByRole("button", {
    name: "Drag task",
    exact: true,
  });
  await oldHandle.scrollIntoViewIfNeeded();
  const sourceBox = await oldHandle.boundingBox();
  const completed = page.locator('[data-status="completed"]');
  const box = await completed.boundingBox();
  if (!sourceBox || !box) throw new Error("Missing drag geometry");
  await page.mouse.move(sourceBox.x + 15, sourceBox.y + 15);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 25, sourceBox.y + 15, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + 55, { steps: 20 });
  await page.mouse.up();
  await expect(
    page.getByText("Task changed somewhere else. Refresh and try again."),
  ).toBeVisible();
  await expect(
    page
      .locator('[data-status="in_progress"] article')
      .filter({ hasText: "Phase 3 concurrent task" }),
  ).toBeVisible();
  expect(
    (await client.from("tasks").select("status").eq("id", id).single()).data
      ?.status,
  ).toBe("in_progress");
  await expect(page.getByText("AI-managed stage")).toBeVisible();
  await expect(
    page.getByText("Automatically determined by deadline"),
  ).toBeVisible();
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
    page
      .locator('[data-status="todo"]')
      .getByRole("button", { name: "Thêm nhiệm vụ", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/workspace-mobile.png",
    fullPage: true,
  });
});

test("keyboard sensor moves through the drag handle", async ({ page }) => {
  test.setTimeout(90_000);
  const inserted = await client
    .from("tasks")
    .insert({ user_id: userId, title: "Phase 3 keyboard task" });
  expect(inserted.error).toBeNull();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await login(page);
  await page.goto("/en/workspace?goal=unassigned");
  const handle = page
    .locator('[data-status="todo"] article')
    .filter({ hasText: "Phase 3 keyboard task" })
    .getByRole("button", { name: "Drag task", exact: true });
  await expect(handle).toHaveAttribute("aria-describedby", /dnd/);
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(handle).toHaveAttribute("aria-grabbed", "true");
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Space");
  await expect(
    page
      .locator('[data-status="in_progress"] article')
      .filter({ hasText: "Phase 3 keyboard task" }),
  ).toBeVisible();
});

test("cancel/restore, deadline precedence, reschedule and legacy pages", async ({
  page,
}) => {
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
  await page.goto("/en/workspace?goal=all");
  await expect(
    page
      .locator('[data-status="overdue"] article')
      .filter({ hasText: "Phase 3 past task" }),
  ).toHaveCount(1);
  const review = page
    .locator('[data-status="in_review"] article')
    .filter({ hasText: "Phase 3 review task" });
  await expect(
    review.getByRole("button", { name: "Drag task", exact: true }),
  ).toBeDisabled();
  await pointerMove(page, "Phase 3 restore task", "todo", "cancelled");
  await expect(page.locator("[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await pointerMove(page, "Phase 3 restore task", "cancelled", "todo");
  await expect(page.locator("[aria-busy]")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  const overdueId = fixtures.data!.find(
    (task) => task.title === "Phase 3 past task",
  )!.id;
  const rescheduled = await client
    .from("tasks")
    .update({ due_at: "2099-01-01T00:00:00Z" })
    .eq("id", overdueId);
  expect(rescheduled.error).toBeNull();
  await page.reload();
  await expect(
    page
      .locator('[data-status="in_progress"] article')
      .filter({ hasText: "Phase 3 past task" }),
  ).toBeVisible();
  await page.goto("/en/goals");
  await expect(page.getByText("Phase 3 test goal").first()).toBeVisible();
  await page.goto("/en/tasks");
  const row = page.getByRole("row").filter({ hasText: "Phase 3 review task" });
  await row.getByRole("button", { name: /edit/i }).click();
  const editor = page.locator("tr").filter({ has: page.locator("form") });
  // Title, Goal, Priority and Status are the existing row editor controls.
  await editor.getByRole("combobox").nth(2).click();
  await expect(
    page.getByRole("option", { name: "In review", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("option", { name: "Overdue", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
});
