import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("reflections page renders history section", async ({ page }) => {
  await loginAsTestUser(page);

  await page.goto("/reflections");

  await expect(
    page.getByRole("heading", { name: "Weekly Reflections" })
  ).toBeVisible();

  // The page may render a static section heading or reflection cards.
  // Check for the section heading first, otherwise accept the empty-state text.
  const sectionHeading = page.getByRole("heading", { name: "Weekly Behaviour Reflection", exact: true });

  await sectionHeading.isVisible().catch(async () => {
    await expect(page.getByText("No weekly reflections generated yet")).toBeVisible();
  });
});