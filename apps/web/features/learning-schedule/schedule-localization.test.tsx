import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider, createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import viMessages from "@/messages/vi.json";
import { formatStudyDate } from "./schedule-presentation";
vi.mock("./session-reschedule.actions", () => ({ rescheduleStudySessionAction: vi.fn() }));
vi.mock("./schedule.actions", () => ({ createStudyScheduleAction: vi.fn() }));
vi.mock("./schedule.queries.actions", () => ({ getTaskStudyScheduleAction: async () => ({ success: false, code: "loadFailed", message: "PRIVATE ENGLISH MESSAGE" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { ScheduleDraftEditor } from "./components/schedule-draft-editor";
import { SessionRescheduleDialog } from "./components/session-reschedule-dialog";
import { TaskStudyScheduleSection } from "./components/task-study-schedule-section";
const draft = { startsOn: "2030-01-07", endsOn: "2030-01-21", timezone: "Asia/Ho_Chi_Minh", slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }] };
function keys(value: object, prefix = ""): string[] { return Object.entries(value).flatMap(([key, child]) => typeof child === "object" ? keys(child, prefix + key + ".") : [prefix + key]); }
describe("Learning Schedule real EN/VI catalogs", () => {
  let root: Root; let host: HTMLDivElement;
  beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  it("has identical complete EN/VI keys, ICU session counts and all statuses", () => {
    expect(keys(en.learningSchedule).sort()).toEqual(keys(viMessages.learningSchedule).sort());
    for (const [locale, messages] of [["en", en], ["vi", viMessages]] as const) {
      const t = createTranslator({ locale, messages, namespace: "learningSchedule" });
      expect(t("sessionCount", { count: 1 })).toBe(locale === "vi" ? "1 buổi học" : "1 session");
      expect(t("sessionCount", { count: 2 })).toBe(locale === "vi" ? "2 buổi học" : "2 sessions");
      for (const status of ["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"] as const) expect(t(`status.${status}`)).not.toContain("status.");
    }
  });
  it.each(["en", "vi"] as const)("renders actual %s editor labels, weekdays, timezone suggestions and wall-clock preview", async locale => {
    const messages = locale === "vi" ? viMessages : en;
    await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><ScheduleDraftEditor initialValue={draft} onContinue={() => {}} /></NextIntlClientProvider>));
    expect(host.textContent).toContain(messages.learningSchedule.startDate); expect(host.textContent).toContain(messages.learningSchedule.weekdayName["1"]);
    expect(host.textContent).toContain(`${formatStudyDate("2030-01-07", locale)} · 19:00–20:30`);
    expect(host.querySelector('input[list]')?.getAttribute("list")).toBe(host.querySelector("datalist")?.id);
    expect(host.querySelector('option[value="Asia/Tokyo"]')).not.toBeNull();
  });
  it.each(["en", "vi"] as const)("announces DST gap and action error codes in %s without raw server messages", async locale => {
    const messages = locale === "vi" ? viMessages : en;
    const provider = (child: React.ReactNode) => <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">{child}</NextIntlClientProvider>;
    await act(async () => root.render(provider(<ScheduleDraftEditor initialValue={{ startsOn: "2030-03-10", endsOn: "2030-03-10", timezone: "America/New_York", slots: [{ weekday: 7, startTime: "02:30", endTime: "04:00" }] }} onContinue={() => {}} />)));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(messages.learningSchedule.errors.dstGap);
    await act(async () => root.render(provider(<TaskStudyScheduleSection taskId="task" eligible />)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(messages.learningSchedule.errors.loadFailed); expect(host.textContent).not.toContain("PRIVATE ENGLISH MESSAGE");
  });
  it.each(["en", "vi"] as const)("reschedule dialog in %s preserves schedule local time and timezone", async locale => {
    const messages = locale === "vi" ? viMessages : en;
    await act(async () => root.render(<NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Tokyo"><SessionRescheduleDialog session={{ id: "session", local_date: "2030-01-07", local_start_time: "19:00:00", local_end_time: "20:30:00", timezone: "Asia/Ho_Chi_Minh", updated_at: "2026-10-29T00:00:00Z" }} open onOpenChange={() => {}} onSaved={() => {}} onReload={() => {}} /></NextIntlClientProvider>));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(messages.learningSchedule.rescheduleTitle);
    expect(document.querySelector<HTMLInputElement>('input[type="time"]')?.value).toBe("19:00");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Asia/Ho_Chi_Minh");
  });
});
