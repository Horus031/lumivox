import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string | { pathname: string; query?: Record<string, string> } }) =>
  <a {...rest} href={typeof href === "string" ? href : href.pathname + "?" + new URLSearchParams(href.query).toString()} /> }));
import { StudyPlanOverview } from "./study-plan-overview";
import { StudyCalendar } from "./study-calendar";
import { TodaysStudyPlan } from "./todays-study-plan";
import { groupStudyCalendar, type StudyPlanSession } from "../study-plan-projection";
const session: StudyPlanSession = { id: "s", taskId: "task-id", taskTitle: "Algebra", scheduleId: "sch", localDate: "2026-12-31",
  localStartTime: "19:00:00", localEndTime: "20:00:00", timezone: "Asia/Tokyo", scheduledStartAt: "2026-12-31T10:00:00Z", status: "completed" };
const summary = { eligibleDue: 12, completedDue: 8, onTimeDue: 5, eligiblePlanned: 16, completedPlanned: 12,
  attendanceRate: 800 / 12, onTimeRate: 500 / 12, plannedCoverage: 75 };
function keys(object: object, prefix = ""): string[] { return Object.entries(object).flatMap(([k, v]) => typeof v === "object" ? keys(v, `${prefix}${k}.`) : [prefix + k]); }
describe("Study Planner EN/VI accessible components", () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  it("has complete matching localized keys and navigation labels", () => {
    expect(keys(en.studyPlan).sort()).toEqual(keys(viMessages.studyPlan).sort());
    expect(en.appShell.navigation.studyPlan.label).toBe("Study Planner"); expect(viMessages.appShell.navigation.studyPlan.label).toBe("Kế hoạch học tập");
  });
  it.each(["en", "vi"] as const)("renders localized %s ratios, N/A and empty states", async locale => {
    const messages = locale === "en" ? en : viMessages;
    await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <StudyPlanOverview summary={{ ...summary, attendanceRate: null }} /><TodaysStudyPlan sessions={[]} /><StudyCalendar month="2026-12" days={[]} />
    </NextIntlClientProvider>));
    for (const key of ["attendance", "onTime", "coverage", "na", "todayEmpty", "monthEmpty", "timezoneHint", "refreshHint"] as const) expect(host.textContent).toContain(messages.studyPlan[key]);
    expect(host.querySelectorAll("dl dt")).toHaveLength(3); expect(host.textContent).toContain("75");
    expect(host.querySelector("table caption")?.textContent).toContain(messages.studyPlan.calendarTitle);
    expect(host.querySelectorAll('th[scope="col"]')).toHaveLength(7);
    expect(Array.from(host.querySelectorAll('th[scope="col"]'), th => th.textContent))
      .toEqual(Object.values(messages.studyPlan.weekdays));
  });
  it.each(["en", "vi"] as const)("renders %s persisted dates, times, zones, all text statuses and correct Task links", async locale => {
    const messages = locale === "en" ? en : viMessages;
    const sessions = (["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"] as const).map((status, i) => ({ ...session, id: String(i), status }));
    await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="America/Los_Angeles">
      <StudyCalendar month="2026-12" days={groupStudyCalendar(sessions, "2026-12")} />
    </NextIntlClientProvider>));
    expect(host.textContent).toContain("2026-12-31"); expect(host.textContent).toContain("19:00–20:00"); expect(host.textContent).toContain("Asia/Tokyo");
    for (const status of Object.values(messages.studyPlan.status)) expect(host.textContent).toContain(status);
    expect(host.querySelector('a[href="/workspace?task=task-id"]')?.textContent).toBe("Algebra");
    expect(host.querySelector('[data-calendar-date="2026-12-31"] a')?.getAttribute("href")).toBe("#study-day-2026-12-31");
    expect(host.querySelectorAll('[data-study-session]')).toHaveLength(6);
  });
  it("provides named previous/next links across December–January", async () => {
    await act(async () => root.render(<NextIntlClientProvider locale="en" messages={en} timeZone="UTC"><StudyCalendar month="2026-12" days={[]} /></NextIntlClientProvider>));
    expect(host.querySelector('a[aria-label="Previous month"]')?.getAttribute("href")).toBe("/study-plan?month=2026-11");
    expect(host.querySelector('a[aria-label="Next month"]')?.getAttribute("href")).toBe("/study-plan?month=2027-01");
  });
});
