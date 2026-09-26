import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("rooms page exposes room creation and join-by-code flows", async ({
  page,
}) => {
  await loginAsTestUser(page);

  await page.goto("/rooms");

  await expect(
    page.getByRole("heading", { name: "Study Rooms", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Create Rooms" }).click();

  await expect(
    page.getByRole("heading", { name: "Create a study room" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: "Join With Code" }).click();

  await expect(
    page.getByRole("heading", { name: "Join a private room", exact: true })
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Join with code", exact: true })
  ).toBeVisible();
});
