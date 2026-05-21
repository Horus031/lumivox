import type { Page } from "@playwright/test";

export async function loginAsTestUser(page: Page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;


  if (!email || !password) {
    throw new Error(
      "Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD."
    );
  }

  await page.goto("/auth/login");

  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);

  await page.getByRole("button", { name: /login/i }).click();

  await page.waitForURL("**/dashboard");
}