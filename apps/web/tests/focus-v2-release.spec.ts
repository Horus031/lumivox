import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

/**
 * Read-only staging smoke test. Uses existing dedicated E2E account and never
 * starts/cancels a real study session or grants notifications/audio permission.
 */
test("Focus page survives reload and exposes analytics in the enabled runtime", async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto("/en/focus");
  await expect(page.getByRole("heading", { name: "Focus Sessions", exact: true })).toBeVisible();

  // Set only when staging has intentionally enabled V2. In a rollback/drain
  // rehearsal the same runtime still shows analytics for historical sessions.
  if (process.env.FOCUS_V2_EXPECT_ENABLED === "true") {
    await expect(page.getByRole("heading", { name: "Focus analytics", exact: true })).toBeVisible();
    await expect(page.getByText(/Completion rate/i).first()).toBeVisible();
  }

  await page.reload();
  await expect(page.getByRole("heading", { name: "Focus Sessions", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/en\/focus(?:\?|$)/);
});

test("Focus analytics period switch is read-only and stable", async ({ page }) => {
  test.skip(process.env.FOCUS_V2_EXPECT_ENABLED !== "true", "Staging Focus V2 runtime not explicitly enabled");
  await loginAsTestUser(page);
  await page.goto("/en/focus?focusPeriod=7");
  await expect(page.getByRole("heading", { name: "Focus analytics", exact: true })).toBeVisible();
  const reporting = page.getByRole("navigation", { name: "Reporting period" });
  await expect(reporting.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
  await reporting.getByRole("link", { name: "30 days" }).click();
  await expect(page).toHaveURL(/focusPeriod=30/);
  await expect(reporting.getByRole("link", { name: "30 days" })).toHaveAttribute("aria-current", "page");
});
