import { expect, test } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";
import messages from "../messages/en.json";

// Uses the dedicated E2E account. Never touches a pre-existing active session.
// A new test session is cancelled in finally; no study reward is completed.
test("active study workspace keeps chat visible, including fullscreen and settings", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(process.env.FOCUS_V2_EXPECT_ENABLED !== "true", "Requires the enabled Focus V2 runtime");
  await loginAsTestUser(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en/focus");
  const builder = page.getByRole("heading", { name: messages.focus.builder.title, exact: true });
  test.skip(await builder.count() === 0, "An active session already exists or creation is disabled");
  await page.getByLabel(messages.focus.builder.fields.focusMinutes, { exact: true }).fill("5");
  await page.getByLabel(messages.focus.builder.fields.roundCount, { exact: true }).fill("2");
  await page.getByRole("button", { name: messages.focus.builder.start, exact: true }).click();
  try {
    await expect(page.getByRole("timer")).toBeVisible({ timeout: 30_000 });
    const question = page.getByRole("textbox", { name: messages.rag.askPlaceholder, exact: true });
    await expect(question).toBeVisible();
    await question.fill("Keep this study question");
    const draftNode = await question.elementHandle();
    const bounds = await question.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
    await expect(page.getByRole("heading", { name: messages.focus.live.timeline, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("study-desktop.png"), fullPage: true });

    await page.getByRole("button", { name: messages.focus.live.immersive, exact: true }).click();
    await expect(question).toHaveValue("Keep this study question");
    expect(await question.evaluate((element, previous) => element === previous, draftNode)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("study-fullscreen.png"), fullPage: true });
    await page.getByRole("button", { name: messages.focus.live.settings, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: messages.focus.audio.title, exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("study-settings.png"), fullPage: true });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(question).toHaveValue("Keep this study question");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: messages.focus.live.immersive, exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(question).toBeVisible();
    const mobileBounds = await question.boundingBox();
    expect(mobileBounds!.y + mobileBounds!.height).toBeLessThanOrEqual(844 - 64);
    expect(await question.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === element;
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("study-mobile.png"), fullPage: true });
  } finally {
    const cancel = page.getByRole("button", { name: messages.focus.live.cancel, exact: true });
    if (await cancel.isVisible()) {
      page.once("dialog", dialog => dialog.accept());
      await cancel.click();
      await expect(builder).toBeVisible({ timeout: 30_000 });
    }
  }
});
