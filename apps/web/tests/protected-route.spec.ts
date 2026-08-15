import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("unauthenticated user cannot stay on dashboard", async ({ page }) => {
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/login$/);
});

test("authenticated user cannot access landing or auth entry pages", async ({
  page,
}) => {
  await loginAsTestUser(page);

  for (const pathname of ["/en", "/en/auth/login", "/en/auth/sign-up"]) {
    await page.goto(pathname);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
  }
});
