import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("unauthenticated user cannot stay on dashboard", async ({ page }) => {
  await page.goto("/dashboard");

  await expect(page).not.toHaveURL(/\/dashboard$/);
});

test("authenticated user cannot access landing or auth entry pages", async ({
  page,
}) => {
  await loginAsTestUser(page);

  for (const pathname of ["/", "/auth/login", "/auth/sign-up"]) {
    await page.goto(pathname);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});