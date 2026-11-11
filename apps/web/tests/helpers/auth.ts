import type { Page } from "@playwright/test";

export async function submitLoginForm(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
}

export async function loginAsTestUser(page: Page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Missing E2E_TEST_EMAIL or E2E_TEST_PASSWORD."
    );
  }

  await page.goto("/en/auth/login");

  const [authResponse] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "POST" &&
        url.pathname === "/auth/v1/token" &&
        url.searchParams.get("grant_type") === "password";
    }, { timeout: 15_000 }).catch((cause: unknown) => {
      throw new Error("The login form did not receive a Supabase password sign-in response.", { cause });
    }),
    submitLoginForm(page, email, password),
  ]);

  if (!authResponse.ok()) {
    const body = await authResponse.json().catch(() => null);
    const code = body?.error_code;
    const status = `HTTP ${authResponse.status()}`;
    if (code === "invalid_credentials" || code === "email_not_confirmed") {
      throw new Error(
        `E2E login rejected (${status}, ${code}). Verify E2E_TEST_EMAIL and E2E_TEST_PASSWORD and confirm the account in the target Supabase project.`
      );
    }
    throw new Error(`Supabase password sign-in failed (${status}).`);
  }

  await page.waitForURL(
    (url) => ["/en/dashboard", "/onboarding", "/en/onboarding"].includes(url.pathname),
    { waitUntil: "commit", timeout: 15_000 }
  ).catch((cause: unknown) => {
    throw new Error("Supabase accepted the E2E login, but the app did not reach dashboard or onboarding.", { cause });
  });
  if (new URL(page.url()).pathname.endsWith("/onboarding")) {
    throw new Error("The E2E account must complete onboarding before running dashboard tests.");
  }
}
