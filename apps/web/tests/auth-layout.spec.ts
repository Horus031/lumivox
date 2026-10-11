import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  for (const route of ["login", "sign-up", "forgot-password", "update-password", "sign-up-success", "error"] as const) {
    for (const mobile of [false, true]) {
      test(`${route} ${theme} ${mobile ? "mobile" : "desktop"}`, async ({ page }, testInfo) => {
        await page.addInitScript((theme) => localStorage.setItem("theme", theme), theme);
        await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`/${mobile ? "vi" : "en"}/auth/${route}`);
        await expect(page.locator(".auth-shell")).toHaveCount(1);
        await expect(page.locator(".auth-form-region")).toHaveCount(1);
        await expect(page.locator("h1")).toBeVisible();
        if (["login", "sign-up", "forgot-password"].includes(route)) {
          await expect(page.locator("#email")).toBeVisible();
        }
        if (route === "update-password") await expect(page.locator("#password")).toBeVisible();
        if (!["sign-up-success", "error"].includes(route)) {
          await expect(page.locator("button[type=submit]")).toBeVisible();
        }
        await expect(page.locator(".auth-form-region")).toHaveCSS("border-top-left-radius", mobile ? "24px" : "32px");
        const canvas = page.locator(".auth-watercolor");
        await expect(canvas).toHaveAttribute("data-ready", "true");
        const paint = await canvas.evaluate((element: HTMLCanvasElement) => {
          const ctx = element.getContext("2d")!;
          return [.2, .5, .8].map((x) => Array.from(ctx.getImageData(
            Math.floor(element.width * x), Math.floor(element.height / 2), 1, 1).data));
        });
        expect(paint.every((pixel) => pixel[3] > 0)).toBe(true);
        expect(new Set(paint.map((pixel) => pixel.join(","))).size).toBeGreaterThan(1);
        expect(await canvas.evaluate((element: HTMLCanvasElement) => Math.max(element.width, element.height)))
          .toBeLessThanOrEqual(mobile ? 400 : 720);
        await page.waitForTimeout(1400);
        await page.screenshot({ path: testInfo.outputPath("layout.png"), fullPage: true });
        expect(errors).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
          .toBeLessThanOrEqual(1);
      });
    }
  }
}

test("password visibility, theme, and localized navigation", async ({ page }) => {
  await page.goto("/en/auth/login");
  await page.locator("#password").fill("example-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).click();
  await expect(page.locator("#password")).toHaveAttribute("type", "password");
  const before = await page.locator("html").getAttribute("class");
  await page.getByRole("button", { name: "Switch light / dark theme" }).click();
  await expect.poll(() => page.locator("html").getAttribute("class")).not.toBe(before);
  await page.getByRole("link", { name: "Sign up", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/auth\/sign-up$/);
  await expect(page.locator("#repeat-password")).toBeVisible();
});

test("register validates passwords without a signup request", async ({ page }) => {
  let requests = 0;
  await page.route("**/auth/v1/signup*", (route) => { requests++; return route.abort(); });
  await page.goto("/en/auth/sign-up");
  await page.locator("#email").fill("test@example.com");
  await page.locator("#password").fill("password-one");
  await page.locator("#repeat-password").fill("password-two");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Passwords do not match");
  await expect(page.getByRole("button", { name: "Sign up", exact: true })).toBeEnabled();
  expect(requests).toBe(0);
});

test("reduced motion shows a static watercolor and readable form", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/vi/auth/sign-up");
  const canvas = page.locator(".auth-watercolor");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  const first = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.waitForTimeout(700);
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(first);
  await expect(page.locator("h1")).toBeVisible();
});

test("login reports a rejected request and restores the form", async ({ page }) => {
  await page.route("**/auth/v1/token*", async (route) => {
    await route.fulfill({ status: 400, contentType: "application/json",
      body: JSON.stringify({ error_code: "invalid_credentials", msg: "Invalid login credentials" }) });
  });
  await page.goto("/en/auth/login");
  await page.locator("#email").fill("test@example.com");
  await page.locator("#password").fill("example-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.locator("form [role=alert]")).toHaveText("Invalid login credentials");
  await expect(page.locator("#email")).toBeEnabled();
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeEnabled();
});

test("narrow auth layout remains usable without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false,
    viewport: { width: 320, height: 700 } });
  try {
    const page = await context.newPage();
    await page.goto("/vi/auth/sign-up");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});

test("legacy auth routes share the same shell", async ({ page }) => {
  for (const route of ["login", "sign-up", "forgot-password", "update-password", "sign-up-success", "error"]) {
    await page.goto(`/auth/${route}`);
    await expect(page.locator(".auth-shell")).toHaveCount(1);
    await expect(page.locator(".auth-form-region")).toHaveCount(1);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("password recovery reports errors and shows email confirmation", async ({ page }) => {
  let attempts = 0;
  let redirectTo: string | null = null;
  await page.route("**/auth/v1/recover*", async (route) => {
    attempts++;
    redirectTo = new URL(route.request().url()).searchParams.get("redirect_to");
    expect(route.request().postDataJSON().email).toBe("test@example.com");
    await route.fulfill({ status: attempts === 1 ? 400 : 200, contentType: "application/json",
      body: JSON.stringify(attempts === 1 ? { msg: "Reset unavailable", error_code: "unexpected_failure" } : {}) });
  });
  await page.goto("/vi/auth/forgot-password");
  await page.locator("#email").fill("test@example.com");
  await page.locator("button[type=submit]").click();
  await expect(page.locator("form [role=alert]")).toHaveText("Reset unavailable");
  await expect(page.locator("button[type=submit]")).toBeEnabled();
  await page.locator("button[type=submit]").click();
  await expect(page.getByRole("status").locator("h1")).toHaveText("Kiểm tra email của bạn");
  expect(redirectTo).toContain("/vi/auth/update-password");
  await expect(page.locator(".auth-shell")).toHaveCount(1);
  await page.getByRole("link", { name: "Quay lại đăng nhập" }).click();
  await expect(page).toHaveURL(/\/vi\/auth\/login$/);
});

test("auth navigation preserves the background and renders error details safely", async ({ page }) => {
  await page.goto("/en/auth/login");
  await page.locator(".auth-watercolor").evaluate((canvas) => canvas.setAttribute("data-test-identity", "shared"));
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/en\/auth\/forgot-password$/);
  await expect(page.locator(".auth-watercolor")).toHaveAttribute("data-test-identity", "shared");
  await page.goto("/vi/auth/error?error=" + encodeURIComponent("<script>example</script>"));
  await expect(page.locator(".auth-form-error")).toContainText("<script>example</script>");
  await page.getByRole("link", { name: "Quay lại đăng nhập" }).click();
  await expect(page).toHaveURL(/\/vi\/auth\/login$/);
});
