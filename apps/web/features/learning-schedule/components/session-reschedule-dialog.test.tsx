import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ action: vi.fn(), saved: vi.fn(), close: vi.fn(), reload: vi.fn(), toast: vi.fn() }));
vi.mock("../session-reschedule.actions", () => ({ rescheduleStudySessionAction: mocks.action }));
vi.mock("sonner", () => ({ toast: { success: mocks.toast } }));
import { SessionRescheduleDialog } from "./session-reschedule-dialog";
const session = { id: "session-A", local_date: "2030-01-07", local_start_time: "19:00:00", local_end_time: "20:30:00", timezone: "Asia/Ho_Chi_Minh", updated_at: "2026-10-28T01:00:00Z" };
function deferred<T>() { let resolve!: (x: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
describe("single session reschedule dialog", () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(() => {
    vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    mocks.action.mockResolvedValue({ success: true, sessionId: session.id });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render(current = session, open = true) { await act(async () => { root.render(<SessionRescheduleDialog session={current} open={open} onOpenChange={mocks.close} onSaved={mocks.saved} onReload={mocks.reload} />); }); }
  function button(label: string) { const b = [...document.querySelectorAll("button")].find(x => x.textContent?.trim() === label); expect(b, label).toBeDefined(); return b!; }
  async function click(label: string) { await act(async () => { button(label).click(); }); }
  function input(label: string) { return [...document.querySelectorAll("label")].find(x => x.querySelector("span")?.textContent === label)!.querySelector("input")!; }
  function enter(label: string, value: string) { act(() => { const el = input(label); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); }); }
  it("prefills stored local time/timezone, edits three fields and confirms with DB version", async () => {
    await render(); expect(input("Start time").value).toBe("19:00"); expect(document.body.textContent).toContain(session.timezone);
    enter("New date", "2030-01-08"); enter("Start time", "18:00"); enter("End time", "19:00");
    expect(mocks.action).not.toHaveBeenCalled(); await click("Confirm reschedule");
    expect(mocks.action).toHaveBeenCalledWith({ sessionId: session.id, expectedUpdatedAt: session.updated_at, localDate: "2030-01-08", startTime: "18:00", endTime: "19:00", eventKey: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    expect(mocks.saved).toHaveBeenCalledOnce(); expect(mocks.close).toHaveBeenCalledWith(false);
  });
  it.each(["19:00", "18:00", ""])("disables confirmation when end time %s is invalid", async end => {
    await render(); enter("End time", end); expect(button("Confirm reschedule").disabled).toBe(true); expect(mocks.action).not.toHaveBeenCalled();
  });
  it("Cancel makes no mutation", async () => { await render(); await click("Cancel"); expect(mocks.close).toHaveBeenCalledWith(false); expect(mocks.action).not.toHaveBeenCalled(); });
  it("guards duplicate confirmation and disables editing/cancel while saving", async () => {
    const request = deferred<{ success: true; sessionId: string }>(); mocks.action.mockReturnValue(request.promise); await render();
    await act(async () => { const save = button("Confirm reschedule"); save.click(); save.click(); });
    expect(mocks.action).toHaveBeenCalledOnce(); expect(input("New date").closest("fieldset")!.disabled).toBe(true); expect(button("Cancel").disabled).toBe(true);
    await act(async () => { request.resolve({ success: true, sessionId: session.id }); }); expect(mocks.saved).toHaveBeenCalledOnce();
  });
  it("keeps draft after rejection, retries unchanged with same key and changes key for new payload", async () => {
    mocks.action.mockResolvedValue({ success: false, message: "Overlap rejected" }); await render(); enter("New date", "2030-01-08");
    await click("Confirm reschedule"); const first = mocks.action.mock.calls[0][0];
    expect(document.body.textContent).toContain("Overlap rejected"); expect(input("New date").value).toBe("2030-01-08"); expect(mocks.toast).not.toHaveBeenCalled();
    await click("Confirm reschedule"); expect(mocks.action.mock.calls[1][0]).toEqual(first);
    enter("Start time", "18:00"); await click("Confirm reschedule"); expect(mocks.action.mock.calls[2][0].eventKey).not.toBe(first.eventKey);
  });
  it("locks unknown outcome and retries immutable exact command without auto retry", async () => {
    mocks.action.mockResolvedValueOnce({ success: false, uncertain: true, message: "Timeout" }); await render(); enter("New date", "2030-01-08"); await click("Confirm reschedule");
    const original = mocks.action.mock.calls[0][0]; expect(Object.isFrozen(original)).toBe(true);
    expect(mocks.action).toHaveBeenCalledOnce(); expect(input("New date").closest("fieldset")!.disabled).toBe(true);
    await click("Retry exact command"); expect(mocks.action.mock.calls[1][0]).toBe(original); expect(mocks.saved).toHaveBeenCalledOnce();
  });
  it("thrown transport failure offers check latest and no false success", async () => {
    mocks.action.mockRejectedValue(new Error("network")); await render(); await click("Confirm reschedule");
    expect(mocks.toast).not.toHaveBeenCalled(); await click("Check latest session"); expect(mocks.reload).toHaveBeenCalledOnce();
  });
  it("conflict locks edits, keeps draft and offers explicit latest version reload", async () => {
    mocks.action.mockResolvedValue({ success: false, conflict: true, message: "Stale version" }); await render(); enter("Start time", "18:00"); await click("Confirm reschedule");
    expect(input("Start time").value).toBe("18:00"); expect(button("Confirm reschedule").disabled).toBe(true);
    await click("Check latest session"); expect(mocks.reload).toHaveBeenCalledOnce(); expect(mocks.toast).not.toHaveBeenCalled();
  });
  it("new session ignores previous session's late mutation result", async () => {
    const old = deferred<{ success: true; sessionId: string }>(); mocks.action.mockReturnValueOnce(old.promise); await render(); await click("Confirm reschedule");
    await render({ ...session, id: "session-B", local_date: "2030-01-14" });
    await act(async () => { old.resolve({ success: true, sessionId: session.id }); });
    expect(input("New date").value).toBe("2030-01-14"); expect(mocks.saved).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });
});
