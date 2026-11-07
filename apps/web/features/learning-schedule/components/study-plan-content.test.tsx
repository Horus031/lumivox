import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
const mocks = vi.hoisted(() => ({ action: vi.fn(), effort: vi.fn(), locale: "en" as "en" | "vi" }));
vi.mock("../study-plan.queries.actions", () => ({ getStudyPlanAction: mocks.action }));
vi.mock("../study-focus-effort.queries.actions", () => ({ getStudyFocusEffortAction: mocks.effort }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => createTranslator({ locale: mocks.locale,
  messages: mocks.locale === "en" ? en : viMessages, namespace: "studyPlan" }) }));
vi.mock("@/i18n/navigation", () => ({ Link: (props: ComponentProps<"a">) => <a {...props} /> }));
import { StudyPlanContent } from "./study-plan-content";

describe("Study Planner action-boundary failure UI", () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => { vi.clearAllMocks(); mocks.effort.mockResolvedValue({ success: true, efforts: [] }); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  it.each(["en", "vi"] as const)("SP-07 query failure displays %s error and no partial KPI/Calendar", async locale => {
    mocks.locale = locale; mocks.action.mockResolvedValue({ success: false, code: "loadFailed" });
    await act(async () => root.render(await StudyPlanContent({ month: "2026-11" })));
    const messages = locale === "en" ? en : viMessages;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(messages.studyPlan.error.loadFailed);
    expect(host.querySelector("dl")).toBeNull(); expect(host.querySelector("table")).toBeNull();
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/study-plan");
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith({ month: "2026-11" });
  });
  it.each(["en", "vi"] as const)("SP-08 incomplete data displays %s error and no partial views", async locale => {
    mocks.locale = locale; mocks.action.mockResolvedValue({ success: false, code: "incompleteData" });
    await act(async () => root.render(await StudyPlanContent({ month: "2026-11" })));
    const messages = locale === "en" ? en : viMessages;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(messages.studyPlan.error.incompleteData);
    expect(host.querySelector("dl")).toBeNull(); expect(host.querySelector("[data-study-session]")).toBeNull(); expect(host.querySelector("table")).toBeNull();
  });
  it("SP-11 empty action output renders real N/A and empty views without an error", async () => {
    mocks.locale = "en";
    mocks.action.mockResolvedValue({ success: true, source: "application-server", asOf: "2026-11-03T05:00:00Z", today: [], calendar: [],
      summary: { eligibleDue: 0, completedDue: 0, onTimeDue: 0, eligiblePlanned: 0, completedPlanned: 0, attendanceRate: null, onTimeRate: null, plannedCoverage: null } });
    const content = await StudyPlanContent({ month: "2026-11" });
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{content}</NextIntlClientProvider>));
    expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelectorAll("dl > div")).toHaveLength(3);
    expect(host.textContent).toContain(en.studyPlan.todayEmpty); expect(host.textContent).toContain(en.studyPlan.monthEmpty);
    expect(host.querySelectorAll("dd")[0].textContent).toBe("N/A");
  });
  it("keeps Attendance visible and never renders a partial effort total", async () => {
    mocks.locale = "en";
    const row = { id: "session", taskId: "task", taskTitle: "Test Task", status: "scheduled",
      localDate: "2026-11-03", localStartTime: "10:00", localEndTime: "11:00", timezone: "UTC" };
    mocks.action.mockResolvedValue({ success: true, asOf: "2026-11-03T05:00:00Z", today: [row],
      calendar: [{ localDate: row.localDate, sessions: [row] }], summary: {
        eligibleDue: 0, completedDue: 0, onTimeDue: 0, eligiblePlanned: 1, completedPlanned: 0,
        attendanceRate: null, onTimeRate: null, plannedCoverage: 0,
      } });
    mocks.effort.mockResolvedValue({ success: false, code: "incompleteData" });
    const content = await StudyPlanContent({ month: "2026-11" });
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC">{content}</NextIntlClientProvider>));
    expect(mocks.effort).toHaveBeenCalledExactlyOnceWith({ studySessionIds: [row.id] });
    expect(host.textContent).toContain(en.studyPlan.focusEffort.unavailable);
    expect(host.querySelector("details")).toBeNull();
    expect(host.querySelectorAll("dl > div")).toHaveLength(3);
    expect(host.querySelectorAll("[data-study-session]")).toHaveLength(2);
  });
});
