import { expect, test, type Page } from "@playwright/test";

const routes = ["/en", "/vi"] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

for (const route of routes) {
  test(`${route} landing desktop`, async ({ page }) => {
    await page.setViewportSize({
      width: 1440,
      height: 900,
    });

    await page.goto(route);

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#features")).toBeVisible();
    await expect(page.locator("#how")).toBeVisible();
    await expect(page.locator("#analytics")).toBeVisible();
    await expect(page.locator("#evidence")).toBeVisible();
    await expect(page.locator("#faq")).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });

  test(`${route} landing mobile`, async ({ page }) => {
    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await page.goto(route);

    await expect(page.locator("h1")).toBeVisible();

    const currentSrc = await page
      .locator("[data-hero-video]")
      .evaluate((element: HTMLVideoElement) => element.currentSrc);

    expect(currentSrc).toBe("");

    await expectNoHorizontalOverflow(page);
  });
}

test("FAQ works with keyboard", async ({ page }) => {
  await page.goto("/en");

  const summary = page.locator("#faq summary").first();

  await summary.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#faq details").first()).toHaveAttribute(
    "open",
    "",
  );
});

test("critical landing content remains visible without JS", async ({
  baseURL,
  browser,
}) => {
  const context = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    viewport: {
      width: 1280,
      height: 900,
    },
  });

  const page = await context.newPage();

  try {
    await page.goto("/en");

    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#features h2")).toBeVisible();
    await expect(page.locator("#evidence h2")).toBeVisible();
    await expect(
      page.locator("[data-landing-scene='convergence'] h2"),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

test("reduced motion keeps landing readable", async ({ page }) => {
  await page.emulateMedia({
    reducedMotion: "reduce",
  });

  await page.goto("/en");

  await expect(page.locator("h1")).toBeVisible();

  const video = page.locator("[data-hero-video]");
  const currentSrc = await video.evaluate(
    (element: HTMLVideoElement) => element.currentSrc,
  );

  expect(currentSrc).toBe("");
});
