import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
import { buildFocusV2AnalyticsReport } from "../focus-v2-analytics.model";

const mocks = vi.hoisted(() => ({ load: vi.fn(), error: vi.fn() }));
vi.mock("../focus-v2-analytics.actions", () => ({ loadFocusAnalyticsAction: mocks.load }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));
import { FocusV2AnalyticsView } from "./focus-v2-analytics-view";

function report(days: 7 | 30) {
  return buildFocusV2AnalyticsReport({
    sessions: [], segments: [], distractions: [], rewards: [], engagement: null,
    taskNames: {}, startUtc: "2026-10-01T00:00:00.000Z", days, truncated: false,
  });
}

describe("Focus analytics period selection", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    window.history.replaceState(null, "", "/en/dashboard?other=kept");
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  function mount(locale: "en" | "vi" = "en") {
    act(() => root.render(
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : viMessages} timeZone="UTC">
        <FocusV2AnalyticsView initialReport={report(30)} recentSessions={<p>Session history</p>} />
      </NextIntlClientProvider>,
    ));
  }
  function sevenDays() { return container.querySelector<HTMLButtonElement>("nav button")!; }

  it.each(["en", "vi"] as const)("resolves the details and loading messages for %s", locale => {
    mount(locale);
    const messages = locale === "en" ? en : viMessages;
    expect(container.querySelector("summary")?.textContent).toBe(messages.focus.analytics.details);
    expect(messages.focus.analytics.loading).toBeTruthy();
    expect(container.textContent).not.toContain("focus.analytics.details");
  });

  it("shows a local skeleton while loading and updates without navigating the document", async () => {
    let resolve!: (value: { success: true; report: ReturnType<typeof report> }) => void;
    mocks.load.mockReturnValue(new Promise(done => { resolve = done; }));
    mount();
    const header = container.querySelector("h2");
    await act(async () => sevenDays().click());
    expect(mocks.load).toHaveBeenCalledWith(7);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector("h2")).toBe(header);
    expect(sevenDays().disabled).toBe(true);
    await act(async () => resolve({ success: true, report: report(7) }));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("h2")).toBe(header);
    expect(container.textContent).toContain("Last 7 calendar days");
    expect(container.textContent).toContain("Session history");
    expect(window.location.search).toBe("?other=kept&focusPeriod=7");
    expect(sevenDays().getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the current report and URL when loading fails, then allows retry", async () => {
    mocks.load.mockResolvedValue({ success: false });
    mount();
    await act(async () => sevenDays().click());
    expect(mocks.error).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Last 30 calendar days");
    expect(window.location.search).toBe("?other=kept");
    expect(sevenDays().disabled).toBe(false);
    expect(sevenDays().getAttribute("aria-pressed")).toBe("false");
    mocks.load.mockResolvedValue({ success: true, report: report(7) });
    await act(async () => sevenDays().click());
    expect(container.textContent).toContain("Last 7 calendar days");
  });
});
