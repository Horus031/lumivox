import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@playwright/test";

const prototype = pathToFileURL(resolve("../../docs/workspace-redesign-prototype.html")).href;

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Workspace prototype core flows at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(prototype);

    const firstTask = page.getByRole("region", { name: "Danh sách task" }).getByRole("button").first();
    await expect(firstTask).toContainText("Ôn Application Load Balancer");
    await firstTask.click();
    const detail = page.getByRole("dialog", { name: "Ôn Application Load Balancer" });
    await expect(detail.getByRole("heading", { name: "Checklist" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(firstTask).toBeFocused();

    await page.getByRole("button", { name: "AWS Cloud Practice", exact: true }).click();
    await page.getByRole("button", { name: "Tài liệu", exact: true }).click();
    await page.getByRole("button", { name: "Ghi chú AWS Networking" }).click();
    await expect(page.getByRole("dialog", { name: "Ghi chú AWS Networking" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goBack();
    await expect(page.getByRole("button", { name: "Công việc", exact: true })).toHaveAttribute("aria-pressed", "true");

    const deadline = page.getByRole("button", { name: /Đổi deadline: Ôn Application Load Balancer/ });
    await deadline.click();
    await page.getByLabel("Ngày đến hạn").fill("2026-11-16");
    await page.getByRole("button", { name: "Lưu", exact: true }).click();
    await expect(deadline).toHaveText("16/11/2026");
    await expect(deadline).toBeFocused();
    await expect(page.getByRole("status")).toContainText("Đã lưu deadline");
    await page.getByRole("button", { name: "Tập trung", exact: true }).click();
    await expect(firstTask).toContainText("Thiết kế VPC");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflows).toBe(false);
  });
}
