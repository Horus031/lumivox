import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("unauthenticated user cannot stay on dashboard", async ({ page }) => {
  await page.goto("/en/dashboard");

  await expect(page).toHaveURL(/\/en\/auth\/login$/);
});

test("authenticated user can view landing but cannot stay on auth entry pages", async ({
  page,
}) => {
  await loginAsTestUser(page);

  await page.goto("/en");
  await expect(page).toHaveURL(/\/en$/);
  await expect(
    page.getByRole("heading", { name: /study with calm intelligence/i })
  ).toBeVisible();

  for (const pathname of ["/en/auth/login", "/en/auth/sign-up"]) {
    await page.goto(pathname);
    await expect(page).toHaveURL(/\/en\/dashboard$/);
  }
});
