import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("signed in user can access dashboard shell", async ({ page }) => {
  await loginAsTestUser(page);

  await expect(
    page.getByRole("heading", {
      name: /behaviour analytics dashboard/i,
    })
  ).toBeVisible();

  await expect(page.getByText(/dashboard/i).first()).toBeVisible();
  await expect(page.getByText(/tasks/i).first()).toBeVisible();
  await expect(page.getByText(/rooms/i).first()).toBeVisible();
});