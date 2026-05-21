import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("dashboard renders core intelligence and retention sections", async ({
  page,
}) => {
  await loginAsTestUser(page);

  await expect(
    page.getByRole("heading", { name: /behaviour analytics dashboard/i })
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: /upcoming task risk scan/i })
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: /task status overview/i })
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: /pbi history/i })
  ).toBeVisible();
});