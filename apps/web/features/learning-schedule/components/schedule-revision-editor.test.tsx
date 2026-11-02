vi.mock("next-intl", async original => {
 const actual = await original<typeof import("next-intl")>();
 const { learningSchedule } = await import("@/messages/en.json");
 const translate = actual.createTranslator({ locale: "en", messages: { learningSchedule }, namespace: "learningSchedule" });
 return { ...actual, useLocale: () => "en", useTranslations: (namespace: string) => namespace === "learningSchedule" ? translate : (key: string) => key };
});
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), revise: vi.fn(), success: vi.fn(), refresh: vi.fn(), saved: vi.fn(), cancel: vi.fn(), summary: vi.fn(), sessions: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success } }));
vi.mock("../schedule-editor.queries.actions", () => ({ getStudyScheduleEditorAction: mocks.load }));
vi.mock("../schedule-revision.actions", () => ({ reviseStudyScheduleAction: mocks.revise }));
vi.mock("../schedule.queries.actions", () => ({ getTaskStudyScheduleAction: mocks.summary }));
vi.mock("../session.queries.actions", () => ({ getStudySessionsAction: mocks.sessions }));
import { ScheduleRevisionEditor } from "./schedule-revision-editor";
import { TaskStudyScheduleSection } from "./task-study-schedule-section";
const draft = { startsOn: "2030-01-07", endsOn: "2030-01-21", timezone: "UTC", slots: [{ weekday: 1, startTime: "19:00", endTime: "20:30" }] };
const summary = { id: "A", task_id: "task", status: "active", revision: 1, starts_on: draft.startsOn, ends_on: draft.endsOn, timezone: "UTC" };
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("recurring schedule revision UI", () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    mocks.load.mockResolvedValue({ success: true, revision: 1, draft }); mocks.revise.mockResolvedValue({ success: true, revision: 2, sessionCount: 3 });
    mocks.summary.mockResolvedValue({ success: true, schedule: summary }); mocks.sessions.mockResolvedValue({ success: true, sessions: [], total: 0, page: 0, hasMore: false });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render(id = "A") { await act(async () => { root.render(<ScheduleRevisionEditor scheduleId={id} onSaved={mocks.saved} onCancel={mocks.cancel} />); }); }
  function button(label: string) { const b = [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === label); expect(b, label).toBeDefined(); return b!; }
  async function click(label: string) { await act(async () => { button(label).click(); }); }
  function input(label: string) { return [...host.querySelectorAll("label")].find(x => x.querySelector("span")?.textContent === label)!.querySelector("input")!; }
  function enter(label: string, value: string) { act(() => { const el = input(label); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); }
  it("prefills saved slots and updates date/time/weekday preview using engine", async () => {
    await render(); expect(input("Start").value).toBe("19:00"); expect(input("IANA timezone").value).toBe("UTC");
    enter("Start date", "2030-01-08"); enter("End date", "2030-01-22"); enter("Start", "20:00"); enter("End", "21:30");
    act(() => { const select = host.querySelector("select")!; select.value = "2"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(host.textContent).toContain("2030-01-08 · 20:00–21:30"); expect(host.querySelectorAll("li")).toHaveLength(3); expect(mocks.revise).not.toHaveBeenCalled();
  });
  it("requires confirmation, back preserves draft, Cancel makes no mutation", async () => {
    await render(); enter("Start", "18:00"); await click("Continue");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("including individual session overrides"); expect(mocks.revise).not.toHaveBeenCalled();
    await click("Back to draft"); expect(input("Start").value).toBe("18:00"); await click("Cancel"); expect(mocks.cancel).toHaveBeenCalledOnce(); expect(mocks.revise).not.toHaveBeenCalled();
  });
  it("confirms once with expectedRevision, guards duplicate clicks and refreshes", async () => {
    const saving = deferred<{ success: true; revision: number; sessionCount: number }>(); mocks.revise.mockReturnValue(saving.promise);
    await render(); await click("Continue"); await act(async () => { button("Confirm revision").click(); button("Confirm revision").click(); });
    expect(mocks.revise).toHaveBeenCalledExactlyOnceWith({ scheduleId: "A", expectedRevision: 1, ...draft }); expect(button("Cancel").disabled).toBe(true);
    await act(async () => { saving.resolve({ success: true, revision: 2, sessionCount: 3 }); });
    expect(mocks.saved).toHaveBeenCalledOnce(); expect(mocks.refresh).toHaveBeenCalledOnce(); expect(mocks.success).toHaveBeenCalledOnce();
  });
  it("keeps draft after RPC failure and retries", async () => {
    mocks.revise.mockResolvedValueOnce({ success: false, message: "RPC failed" }); await render(); enter("Start", "18:00"); await click("Continue"); await click("Confirm revision");
    expect(host.textContent).toContain("Could not save study schedule. Check the dates and active sessions."); expect(input("Start").value).toBe("18:00"); expect(mocks.success).not.toHaveBeenCalled();
    await click("Continue"); await click("Confirm revision"); expect(mocks.saved).toHaveBeenCalledOnce();
  });
  it("preserves conflict draft, blocks save and explicitly reloads latest revision", async () => {
    mocks.revise.mockResolvedValue({ success: false, conflict: true, message: "Changed elsewhere" }); await render(); enter("Start", "18:00"); await click("Continue"); await click("Confirm revision");
    expect(input("Start").value).toBe("18:00"); expect(button("Continue").closest("fieldset")!.disabled).toBe(true);
    mocks.load.mockResolvedValue({ success: true, revision: 2, draft }); await click("Discard draft and reload"); expect(input("Start").value).toBe("19:00"); expect(host.textContent).toContain("Current revision: 2");
  });
  it("shows loading/error and retries failed editor read", async () => {
    const load = deferred<{ success: false; message: string }>(); mocks.load.mockReturnValueOnce(load.promise); await render(); expect(host.textContent).toContain("Loading schedule editor");
    await act(async () => { load.resolve({ success: false, message: "Load failed" }); }); expect(host.textContent).toContain("Could not load study schedule."); await click("Retry"); expect(input("Start").value).toBe("19:00");
  });
  it("keeps past startsOn and explains future-date policy before any RPC", async () => {
    mocks.load.mockResolvedValue({ success: true, revision: 1, draft: { ...draft, startsOn: "2020-01-06", endsOn: "2020-01-20" } }); await render(); await click("Continue");
    expect(input("Start date").value).toBe("2020-01-06"); expect(host.textContent).toContain("Choose a start date of today or later"); expect(mocks.revise).not.toHaveBeenCalled();
  });
  it("switching schedules ignores old editor reads", async () => {
    const old = deferred<{ success: true; revision: number; draft: typeof draft }>(); mocks.load.mockReturnValueOnce(old.promise); await render(); await render("B");
    await act(async () => { old.resolve({ success: true, revision: 99, draft }); }); expect(host.textContent).toContain("Current revision: 1"); expect(host.textContent).not.toContain("Current revision: 99");
  });
  it.each([["closed", true], ["paused", true], ["active", false]])("hides Edit for status %s eligible %s", async (status, eligible) => {
    mocks.summary.mockResolvedValue({ success: true, schedule: { ...summary, status } }); await act(async () => { root.render(<TaskStudyScheduleSection taskId="task" eligible={eligible} />); }); expect(host.textContent).not.toContain("Edit recurring schedule");
  });
  it("active eligible schedule reloads summary and page zero across two revisions", async () => {
    await act(async () => { root.render(<TaskStudyScheduleSection taskId="task" eligible />); });
    for (const revision of [2, 3]) {
      await click("Edit recurring schedule"); mocks.summary.mockResolvedValue({ success: true, schedule: { ...summary, revision } }); mocks.revise.mockResolvedValue({ success: true, revision, sessionCount: 3 });
      await click("Continue"); await click("Confirm revision"); expect(host.textContent).toContain(`Revision: ${revision}`); expect(mocks.sessions).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 }); mocks.load.mockResolvedValue({ success: true, revision, draft });
    }
    expect(mocks.summary).toHaveBeenCalledTimes(3); expect(mocks.sessions).toHaveBeenCalledTimes(3);
  });
});
