import { expect, test } from "@playwright/test";
import en from "../messages/en.json";
import vi from "../messages/vi.json";

for (const { locale, messages, width } of [
  { locale: "vi", messages: vi },
  { locale: "en", messages: en },
].flatMap((translation) => [390, 1440].map((width) => ({ ...translation, width })))) {
  for (const theme of ["light", "dark"] as const) {
    test(`Showcase ${locale} ${theme} images at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem("theme", value), theme);
      const imageRequests: string[] = [];
      page.on("request", (request) => {
        const url = decodeURIComponent(request.url());
        if (/landing-(analytics|focus|room)-(light|dark)/.test(url)) {
          imageRequests.push(url);
        }
      });
      await page.goto(`/${locale}`);
      const source = page.locator("[data-showcase-theme-source]").first();
      await expect(source).toHaveAttribute("media", theme === "dark" ? "all" : "not all");

      for (const product of ["analytics", "focus", "rooms"]) {
        const chapter = page.locator(`[data-product-chapter="${product}"]`);
        await chapter.scrollIntoViewIfNeeded();
        const image = width === 390
          ? chapter.locator("img")
          : page.locator(`[data-product-visual="${product}"] img`);
        const filename = product === "rooms" ? "room" : product;
        await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
          decodeURIComponent(element.currentSrc),
        )).toContain(`landing-${filename}-${theme}.`);
        await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 0,
        )).toBe(true);
        await expect(image).toHaveAttribute("alt", /\S/);
        await expect(image).toHaveAttribute("loading", "lazy");
      }

      const opposite = theme === "light" ? "dark" : "light";
      expect(imageRequests.length).toBeGreaterThan(0);
      expect(imageRequests.filter((url) => url.includes(`-${opposite}.`))).toEqual([]);

      const visibleImage = width === 390
        ? page.locator('[data-product-chapter="rooms"] img')
        : page.locator('[data-product-visual="rooms"] img');
      // Measure layout size without the existing scroll-transition transforms.
      const before = await visibleImage.evaluate((element: HTMLImageElement) => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
      }));
      await page.locator(".marketing-navbar__theme-control").getByRole("button", {
        name: messages.common.theme,
        exact: true,
      }).click();
      const targetTheme = page.getByRole("menuitemradio", {
        name: messages.settings.theme[opposite],
        exact: true,
      });
      await expect(targetTheme).toBeVisible();
      await targetTheme.click();
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${opposite}\\b`));
      await expect.poll(() => visibleImage.evaluate((element: HTMLImageElement) =>
        decodeURIComponent(element.currentSrc),
      )).toContain(`landing-room-${opposite}.`);
      expect(await visibleImage.evaluate((element: HTMLImageElement) => ({
        width: element.offsetWidth,
        height: element.offsetHeight,
      }))).toEqual(before);
    });
  }
}
