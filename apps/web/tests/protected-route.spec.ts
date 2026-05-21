import { test, expect } from "@playwright/test";

test("unauthenticated user cannot stay on dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).not.toHaveURL(/\/dashboard$/);
});