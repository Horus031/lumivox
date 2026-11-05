import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudyNotificationPreferences } from "../notification-preferences.schemas";

const mocks = vi.hoisted(() => ({ save: vi.fn(), read: vi.fn(), taskRead: vi.fn(), taskSave: vi.fn(), success: vi.fn(), locale: "en" }));
vi.mock("../notification-preferences.actions", () => ({ saveStudyNotificationPreferencesAction: mocks.save, getStudyNotificationPreferencesAction: mocks.read,
  getStudyNotificationTaskOverrideAction: mocks.taskRead, saveStudyNotificationTaskOverrideAction: mocks.taskSave }));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("next-intl", async original => {
  const actual = await original<typeof import("next-intl")>();
  const en = (await import("@/messages/en.json")).studyNotifications, viCatalog = (await import("@/messages/vi.json")).studyNotifications;
  const english = actual.createTranslator({ locale: "en", messages: { studyNotifications: en }, namespace: "studyNotifications" });
  const vietnamese = actual.createTranslator({ locale: "vi", messages: { studyNotifications: viCatalog }, namespace: "studyNotifications" });
  return { ...actual, useTranslations: () => mocks.locale === "vi" ? vietnamese : english };
});
import { StudyNotificationSettings } from "./study-notification-settings";
import { StudyTaskReminderToggle } from "./study-task-reminder-toggle";
const off: StudyNotificationPreferences = { studyEmailEnabled: false, leadMinutes: 15, quietHoursEnabled: false,
  quietStartLocal: null, quietEndLocal: null, timezone: null, consentedAt: null, updatedAt: null };
const on = { ...off, studyEmailEnabled: true, consentedAt: "2026-11-05T00:00Z", updatedAt: "2026-11-05T00:00Z" };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("Reminder settings UI", () => {
  let host: HTMLDivElement, root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); mocks.locale = "en"; Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    mocks.save.mockResolvedValue({ success: true, preferences: on }); mocks.read.mockResolvedValue({ success: true, preferences: off });
    mocks.taskRead.mockResolvedValue({ success: true, override: { taskId: "a", enabled: true }, globalEnabled: false });
    mocks.taskSave.mockResolvedValue({ success: true, override: { taskId: "a", enabled: false } });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render(node: ReactNode) { await act(async () => { root.render(node); }); }
  async function click(element: HTMLElement) { await act(async () => element.click()); }
  const checkbox = () => host.querySelector<HTMLInputElement>('[name="studyEmailEnabled"]')!;
  const button = (text: string) => [...host.querySelectorAll("button")].find(b => b.textContent === text)!;
  async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
  function enter(label: string, value: string) {
    const input = [...host.querySelectorAll("label")].find(l => l.querySelector("span")?.textContent === label)!.querySelector("input")!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  it("renders missing-row OFF without read/write on mount", async () => {
    await render(<StudyNotificationSettings initialPreferences={off} allowOptIn />);
    expect(checkbox().checked).toBe(false); expect(button("Save reminder settings").disabled).toBe(true);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain("no reminders are sent");
  });
  it("independent UI flag disables opt-in by default but allows existing opt-out", async () => {
    await render(<StudyNotificationSettings initialPreferences={off} />); expect(checkbox().disabled).toBe(true);
    await render(<StudyNotificationSettings key="on" initialPreferences={on} />); expect(checkbox().disabled).toBe(false);
    await click(checkbox()); await submit(); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ studyEmailEnabled: false }));
  });
  it("toggling is only a draft; save sends exactly seven input fields", async () => {
    await render(<StudyNotificationSettings initialPreferences={off} allowOptIn />); await click(checkbox());
    expect(mocks.save).not.toHaveBeenCalled(); await submit();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith({ studyEmailEnabled: true, leadMinutes: 15, quietHoursEnabled: false,
      quietStartLocal: null, quietEndLocal: null, timezone: null }); expect(mocks.success).toHaveBeenCalledTimes(1);
  });
  it("uses a single immutable command, disables in flight and never optimistic success", async () => {
    const wait = deferred<unknown>(); mocks.save.mockReturnValue(wait.promise);
    await render(<StudyNotificationSettings initialPreferences={off} allowOptIn />); await click(checkbox());
    await submit(); await submit(); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(host.querySelector("form")?.getAttribute("aria-busy")).toBe("true"); expect(mocks.success).not.toHaveBeenCalled();
    await act(async () => wait.resolve({ success: false, code: "saveFailed" }));
    expect(checkbox().checked).toBe(true); expect(host.querySelector('[role="alert"]')?.textContent).toContain("could not confirm");
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("keeps draft on retryable conflict and checks persisted latest only explicitly", async () => {
    mocks.save.mockResolvedValue({ success: false, code: "conflictRetryable" });
    await render(<StudyNotificationSettings initialPreferences={off} allowOptIn />); await click(checkbox()); await submit();
    expect(checkbox().checked).toBe(true); expect(host.textContent).toContain("schedule changed at the same time");
    expect(mocks.read).not.toHaveBeenCalled(); await click(button("Check latest saved settings"));
    expect(checkbox().checked).toBe(false); expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("read failure is visible without a fabricated editor; Retry recovers", async () => {
    await render(<StudyNotificationSettings initialError="loadFailed" allowOptIn />);
    expect(host.querySelector("form")).toBeNull(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
    mocks.read.mockRejectedValueOnce(new Error("offline")); await click(button("Check latest saved settings")); expect(host.querySelector("form")).toBeNull();
    await click(button("Check latest saved settings")); expect(checkbox().checked).toBe(false);
  });
  it("rejects equal quiet endpoints/invalid timezone with localized validation and keeps fields", async () => {
    await render(<StudyNotificationSettings initialPreferences={on} allowOptIn />);
    await click(host.querySelector<HTMLInputElement>('[name="quietHoursEnabled"]')!);
    enter("Quiet hours end", "22:00"); await submit(); expect(mocks.save).not.toHaveBeenCalled();
    enter("Quiet hours end", "07:00"); enter("Quiet hours timezone", "Not/AZone"); await submit();
    expect(mocks.save).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
    enter("Quiet hours timezone", "America/New_York"); await submit(); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ timezone: "America/New_York", quietStartLocal: "22:00", quietEndLocal: "07:00" }));
  });
  it("opt-out does not require fixing an unrelated invalid quiet-hours draft", async () => {
    await render(<StudyNotificationSettings initialPreferences={on} allowOptIn />);
    await click(host.querySelector<HTMLInputElement>('[name="quietHoursEnabled"]')!); enter("Quiet hours timezone", "invalid");
    await click(checkbox()); await submit(); expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ studyEmailEnabled: false, quietHoursEnabled: false, timezone: null }));
  });
  it("localizes Vietnamese labels/errors and has a lead fieldset/legend", async () => {
    mocks.locale = "vi"; mocks.save.mockRejectedValue(new Error("offline"));
    await render(<StudyNotificationSettings initialPreferences={off} allowOptIn />); await click(checkbox()); await submit();
    expect(host.textContent).toContain("Nhắc lịch học"); expect(host.textContent).toContain("Bản nháp được giữ lại");
    expect(host.querySelector("legend")?.textContent).toBe("Nhắc trước buổi học"); expect(mocks.success).not.toHaveBeenCalled();
  });
  it("Task override reads its own true default even while global OFF, then saves only that Task", async () => {
    await render(<StudyTaskReminderToggle taskId="a" />); expect(host.textContent).toContain("Global reminders are off");
    const control = host.querySelector<HTMLInputElement>('input[role="switch"]')!; expect(control.checked).toBe(true);
    await click(control); await click(button("Save task reminder setting"));
    expect(mocks.taskSave).toHaveBeenCalledExactlyOnceWith({ taskId: "a", enabled: false });
  });
  it("Task read error is visible and cannot become an enabled/disabled default", async () => {
    mocks.taskRead.mockResolvedValue({ success: false, code: "loadFailed" });
    await render(<StudyTaskReminderToggle taskId="a" />); expect(host.querySelector("input")).toBeNull(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("switching keyed Tasks discards the previous request result", async () => {
    const old = deferred<unknown>(); mocks.taskRead.mockReturnValueOnce(old.promise);
    await render(<StudyTaskReminderToggle key="a" taskId="a" />);
    mocks.taskRead.mockResolvedValueOnce({ success: true, override: { taskId: "b", enabled: false }, globalEnabled: true });
    await render(<StudyTaskReminderToggle key="b" taskId="b" />);
    await act(async () => old.resolve({ success: true, override: { taskId: "a", enabled: true }, globalEnabled: true }));
    expect(host.querySelector<HTMLInputElement>("input")?.checked).toBe(false);
  });
});
