import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

test("rooms page shows room creation and private join forms", async ({
  page,
}) => {
  await loginAsTestUser(page);

  await page.goto("/rooms");

  await expect(
    page.getByRole("heading", { name: "Study Rooms", exact: true })
  ).toBeVisible();

  // Open the Create dialog, since the create form lives inside a Dialog.
  await page.getByRole("button", { name: "Create Rooms" }).click();

  await expect(
    page.getByRole("heading", { name: "Create a study room" })
  ).toBeVisible();

  // Close the create dialog so the join form is visible beneath it.
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(
    page.getByRole("heading", { name: "Join a private room" })
  ).toBeVisible();
});