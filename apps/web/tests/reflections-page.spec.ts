import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("reflections page renders its current reflection state", async ({ page }) => {
  await loginAsTestUser(page);

  await page.goto("/reflections");

  await expect(
    page.getByRole("heading", { name: "Weekly Reflections", exact: true })
  ).toBeVisible();

  const reflectionSection = page.getByRole("heading", {
    name: "Weekly Behaviour Reflection",
    exact: true,
  });

  if (await reflectionSection.isVisible()) {
    await expect(reflectionSection).toBeVisible();
  } else {
    await expect(
      page.getByRole("heading", {
        name: "No weekly reflections generated yet",
        exact: true,
      })
    ).toBeVisible();
  }
});
