import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

/**
 * Read-only staging smoke test. Uses existing dedicated E2E account and never
 * starts/cancels a real study session or grants notifications/audio permission.
 */
test("Focus page survives reload and keeps reporting on the dashboard", async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto("/en/focus");
  await expect(page.getByRole("heading", { name: "Focus Sessions", exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Focus analytics", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Recent focus sessions", exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Focus Sessions", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/focus(?:\?|$)/);
});

test("Focus analytics period switch is read-only and stable", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(process.env.FOCUS_V2_EXPECT_ENABLED !== "true", "Staging Focus V2 runtime not explicitly enabled");
  await loginAsTestUser(page);
  await page.goto("/en/dashboard?focusPeriod=7");
  await expect(page.getByRole("heading", { name: "Focus analytics", exact: true })).toBeVisible();
  const reporting = page.getByRole("navigation", { name: "Reporting period" });
  await expect(reporting.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => { document.body.dataset.navigationSentinel = "preserved"; });
  await reporting.getByRole("button", { name: "30 days" }).click();
  await expect(page).toHaveURL(/focusPeriod=30/, { timeout: 30_000 });
  await expect(page.locator("body")).toHaveAttribute("data-navigation-sentinel", "preserved");
  await expect(reporting.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
  await expect(reporting.getByRole("button", { name: "30 days" })).toBeEnabled();
  await expect(page.getByText("Detailed statistics", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dashboard-desktop.png"), fullPage: true });
});

test("Focus builder keeps the schedule beside settings on desktop", async ({ page }, testInfo) => {
  await loginAsTestUser(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/en/focus");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: /save.*default/i }) });
  test.skip(await form.count() === 0, "Builder unavailable while a session is active or V2 creation is disabled");
  const settings = await form.locator(":scope > div").first().boundingBox();
  const schedule = await form.locator(":scope > div").nth(1).boundingBox();
  expect(settings).not.toBeNull();
  expect(schedule).not.toBeNull();
  expect(Math.abs(settings!.y - schedule!.y)).toBeLessThan(2);
  expect(schedule!.x).toBeGreaterThan(settings!.x);
  await page.screenshot({ path: testInfo.outputPath("focus-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("focus-mobile.png"), fullPage: true });
});
