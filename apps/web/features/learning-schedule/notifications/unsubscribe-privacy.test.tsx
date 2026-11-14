import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ path: "/en/study-reminders/unsubscribe" }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.path }));
vi.mock("@next/third-parties/google", () => ({
  GoogleAnalytics: () => <div data-testid="analytics" />,
}));
import { PrivacyAwareAnalytics } from "@/components/privacy-aware-analytics";
it.each(["/en/study-reminders/unsubscribe", "/vi/study-reminders/unsubscribe/", ""])(
  "never mounts analytics on capability landing %s",
  (path) => {
    mocks.path = path;
    expect(renderToStaticMarkup(<PrivacyAwareAnalytics gaId="G-TESTPRIVACY" />)).toBe("");
  },
);
it("retains analytics on ordinary application pages", () => {
  mocks.path = "/en/settings";
  expect(renderToStaticMarkup(<PrivacyAwareAnalytics gaId="G-TESTPRIVACY" />)).toContain(
    'data-testid="analytics"',
  );
});
