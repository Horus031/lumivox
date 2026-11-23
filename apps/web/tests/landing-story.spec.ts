import { expect, test, type Page } from "@playwright/test";

const routes = ["/en", "/vi"] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
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

  await expect(page.locator("#faq details").first()).toHaveAttribute("open", "");
});

test("critical landing content remains visible without JS", async ({ baseURL, browser }) => {
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
    await expect(page.locator("[data-landing-scene='convergence'] h2")).toBeVisible();
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
  const currentSrc = await video.evaluate((element: HTMLVideoElement) => element.currentSrc);

  expect(currentSrc).toBe("");
});

test("landing logos follow the selected theme and navbar size", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");

  const header = page.locator(".marketing-navbar");
  const brand = header.getByRole("link", { name: "Lumivox", exact: true });
  const navbarLogo = brand.locator("img:visible");
  const footerLogo = page.locator("footer").getByRole("img", { name: "Lumivox", exact: true });
  const featureLogo = page.locator(".intelligence-core__center img:visible");

  await expect(navbarLogo).toHaveAttribute("src", /logo-text\.webp/);
  await expect(footerLogo).toHaveAttribute("src", /logo-text\.webp/);
  await expect(featureLogo).toHaveAttribute("src", /logo-new\.webp/);

  await header.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(navbarLogo).toHaveAttribute("src", /logo-text-white\.webp/);
  await expect(footerLogo).toHaveAttribute("src", /logo-text-white\.webp/);
  await expect(featureLogo).toHaveAttribute("src", /logo-new-white\.webp/);

  await page.setViewportSize({ width: 320, height: 844 });
  await expect(navbarLogo).toHaveAttribute("src", /logo-new-white\.webp/);
  await expect.poll(() => navbarLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expectNoHorizontalOverflow(page);
});

test("landing advertises the new favicon and organization logo", async ({ page, request }) => {
  for (const route of routes) {
    await page.goto(route);

    const icon = page.locator('link[rel="icon"]');
    await expect(icon).toHaveAttribute("href", /^\/favicon\.ico(?:\?|$)/);
    const favicon = await request.get((await icon.getAttribute("href"))!);
    expect(favicon.ok()).toBe(true);
    const ico = await favicon.body();
    expect(ico.readUInt16LE(2)).toBe(1);
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ({
      width: ico[6 + 16 * i],
      height: ico[7 + 16 * i],
    }));
    expect(sizes).toContainEqual({ width: 96, height: 96 });

    if (process.env.SEO_INDEXING_ENABLED === "true") {
      const markup = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
      expect(markup["@graph"]).toContainEqual(
        expect.objectContaining({ "@type": "Organization", logo: expect.stringMatching(/^https?:\/\/.+\/logo-new\.webp$/) }),
      );
    }
  }
  const logo = await request.get("/logo-new.webp");
  expect(logo.ok()).toBe(true);
  expect(logo.headers()["content-type"]).toBe("image/webp");
});
