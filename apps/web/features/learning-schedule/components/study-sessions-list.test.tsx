vi.mock("next-intl", async original => {
 const actual = await original<typeof import("next-intl")>();
 const { learningSchedule } = await import("@/messages/en.json");
 const translate = actual.createTranslator({ locale: "en", messages: { learningSchedule }, namespace: "learningSchedule" });
 return { ...actual, useLocale: () => "en", useTranslations: (namespace: string) => namespace === "learningSchedule" ? translate : (key: string) => key };
});
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), reschedule: vi.fn(), attendance: vi.fn() }));
vi.mock("../session.queries.actions", () => ({ getStudySessionsAction: mocks.query }));
vi.mock("../session-reschedule.actions", () => ({ rescheduleStudySessionAction: mocks.reschedule }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("../session-attendance.actions", () => ({ mutateStudySessionAttendanceAction: mocks.attendance }));
import { StudySessionsList } from "./study-sessions-list";

function session(index: number, status = "scheduled") {
  return { id: `session-${index}`, local_date: `2030-01-${String(index + 1).padStart(2, "0")}`,
    local_start_time: "19:00:00", local_end_time: "20:30:00", timezone: "Asia/Ho_Chi_Minh", status,
    schedule_revision: 1, scheduled_start_at: "2030-01-01T12:00:00Z", scheduled_end_at: "2030-01-01T13:30:00Z",
    cancellation_reason: status === "cancelled" ? "task_closed" : null, completed_at: null,
    updated_at: "2026-10-28T01:00:00Z" };
}
function page(rows: ReturnType<typeof session>[], total = rows.length, index = 0, hasMore = false) {
  return { success: true as const, sessions: rows, total, page: index, hasMore };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve };
}

describe("Study sessions read-only list", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.resetAllMocks(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render(scheduleId = "A", canReschedule = false, canAttend = false) { await act(async () => { root.render(<StudySessionsList scheduleId={scheduleId} canReschedule={canReschedule} canAttend={canAttend} />); }); }
  function button(label: string) { return [...host.querySelectorAll("button")].find(x => x.textContent === label)!; }
  async function click(label: string) { await act(async () => { button(label).click(); }); }

  it("shows three actual local dates/times/statuses on the first page", async () => {
    mocks.query.mockResolvedValue(page([session(0), session(1, "completed"), session(2, "in_progress")]));
    await render();
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith({ scheduleId: "A", page: 0 });
    expect(host.querySelectorAll("li")).toHaveLength(3);
    expect(host.textContent).toContain("3 of 3");
    for (const label of ["2030-01-01", "2030-01-02", "2030-01-03", "19:00 – 20:30", "Asia/Ho_Chi_Minh",
      "Scheduled", "Completed", "In progress"]) expect(host.textContent).toContain(label);
  });
  it("loads only page zero, guards rapid Load more, and deduplicates appended IDs", async () => {
    const next = deferred<ReturnType<typeof page>>();
    mocks.query.mockResolvedValueOnce(page(Array.from({ length: 20 }, (_, i) => session(i)), 23, 0, true))
      .mockReturnValueOnce(next.promise);
    await render(); expect(host.querySelectorAll("li")).toHaveLength(20);
    expect(mocks.query).toHaveBeenCalledOnce();
    await act(async () => { const more = button("Load more"); more.click(); more.click(); });
    expect(mocks.query).toHaveBeenCalledTimes(2); expect(button("Load more").disabled).toBe(true);
    await act(async () => { next.resolve(page([session(19), session(20), session(21), session(22)], 23, 1)); });
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 1 });
    expect(host.querySelectorAll("li")).toHaveLength(23); expect(host.textContent).toContain("23 of 23");
    expect(button("Load more")).toBeUndefined();
  });
  it("shows initial API errors and retries page zero", async () => {
    mocks.query.mockResolvedValueOnce({ success: false, message: "Read denied" }).mockResolvedValueOnce(page([session(0)]));
    await render(); expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not load study schedule.");
    await click("Retry"); expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 });
  });
  it("retains loaded rows on a next-page failure and retries that same page", async () => {
    mocks.query.mockResolvedValueOnce(page([session(0)], 2, 0, true))
      .mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce(page([session(1)], 2, 1));
    await render(); await click("Load more");
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Could not load study schedule.");
    await click("Retry"); expect(host.querySelectorAll("li")).toHaveLength(2);
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 1 });
  });
  it("clears visible A rows on switching schedule and ignores A's late page response", async () => {
    const old = deferred<ReturnType<typeof page>>(); const newer = deferred<ReturnType<typeof page>>();
    mocks.query.mockResolvedValueOnce(page([session(0)], 2, 0, true))
      .mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    await render("A"); await click("Load more"); await render("B");
    expect(host.querySelectorAll("li")).toHaveLength(0);
    await act(async () => { newer.resolve(page([session(9)])); });
    await act(async () => { old.resolve(page([session(1)], 2, 1)); });
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.textContent).toContain("2030-01-10"); expect(host.textContent).not.toContain("2030-01-02");
  });
  it("only applies the currently viewed schedule when initial requests resolve out of order", async () => {
    const a = deferred<ReturnType<typeof page>>(); const b = deferred<ReturnType<typeof page>>();
    mocks.query.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    await render("A"); await render("B");
    await act(async () => { b.resolve(page([session(7)])); });
    await act(async () => { a.resolve(page([session(0)])); });
    expect(host.textContent).toContain("2030-01-08"); expect(host.textContent).not.toContain("2030-01-01");
  });
  it("shows all six statuses and cancellation reason without attendance controls", async () => {
    const statuses = ["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"];
    mocks.query.mockResolvedValue(page(statuses.map((status, i) => session(i, status))));
    await render();
    for (const label of ["Scheduled", "In progress", "Completed", "Missed", "Skipped", "Cancelled", "Reason: Task closed"])
      expect(host.textContent).toContain(label);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(mocks.query).toHaveBeenCalledOnce();
  });
  it("shows an empty schedule without Load more", async () => {
    mocks.query.mockResolvedValue(page([])); await render();
    expect(host.textContent).toContain("No study sessions found.");
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });
  it("only exposes Reschedule for future scheduled rows and an eligible parent", async () => {
    const states = ["scheduled", "in_progress", "completed", "missed", "skipped", "cancelled"];
    const rows = states.map((status, i) => session(i, status));
    rows.push({ ...session(8), scheduled_start_at: "2020-01-01T12:00:00Z" });
    mocks.query.mockResolvedValue(page(rows)); await render("A", true);
    expect([...host.querySelectorAll("button")].filter(x => x.textContent === "Reschedule")).toHaveLength(1);
    await render("A", false); expect(host.textContent).not.toContain("Reschedule");
  });
  it("reschedules a page-1 row, discards old pages and really reloads page zero", async () => {
    mocks.query.mockResolvedValueOnce(page([session(0)], 2, 0, true))
      .mockResolvedValueOnce(page([session(1)], 2, 1)).mockResolvedValueOnce(page([session(9)]));
    mocks.reschedule.mockResolvedValue({ success: true, sessionId: "session-1" });
    await render("A", true); await click("Load more");
    await act(async () => { [...host.querySelectorAll("button")].filter(x => x.textContent === "Reschedule")[1].click(); });
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm reschedule")!.click(); });
    expect(mocks.reschedule.mock.calls[0][0]).toMatchObject({ sessionId: "session-1", expectedUpdatedAt: "2026-10-28T01:00:00Z" });
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 });
    expect(host.querySelectorAll("li")).toHaveLength(1); expect(host.textContent).toContain("2030-01-10");
    expect(host.textContent).not.toContain("2030-01-01"); expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("unknown outcome check latest closes dialog and reloads instead of replaying", async () => {
    mocks.query.mockResolvedValueOnce(page([session(0)])).mockResolvedValueOnce(page([session(9)]));
    mocks.reschedule.mockResolvedValue({ success: false, uncertain: true, message: "Unknown" });
    await render("A", true); await click("Reschedule");
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm reschedule")!.click(); });
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Check latest session")!.click(); });
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 }); expect(mocks.reschedule).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("2030-01-10");
  });
  it.each([
    ["scheduled", ["Start", "Complete", "Skip"]],
    ["in_progress", ["Complete"]],
    ["missed", ["Recover", "Skip"]],
    ["skipped", ["Recover"]],
    ["completed", []],
    ["cancelled", []],
  ] as const)("offers only the allowed Attendance buttons for %s", async (status, labels) => {
    mocks.query.mockResolvedValue(page([session(0, status)]));
    await render("A", false, true);
    expect([...host.querySelectorAll("li button")].map(x => x.textContent)).toEqual(labels);
  });

  it.each([
    ["scheduled", "Start", "Confirm start", "start"],
    ["scheduled", "Complete", "Confirm completion", "complete"],
    ["missed", "Skip", "Confirm skip", "skip"],
    ["skipped", "Recover", "Confirm recovery", "recover"],
  ])("dispatches %s / %s through the actual list and dialog", async (status, action, confirm, command) => {
    mocks.query.mockResolvedValue(page([session(0, status)]));
    mocks.attendance.mockResolvedValue({ success: true, sessionId: "session-0" });
    await render("A", false, true); await click(action);
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === confirm)!.click(); });
    expect(mocks.attendance).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ command, sessionId: "session-0", expectedUpdatedAt: session(0).updated_at }));
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 });
  });

  it("refreshes page zero after Attendance on page one and uses the new authoritative version", async () => {
    const updated = { ...session(9), updated_at: "2026-11-02T05:00:00Z" };
    mocks.query.mockResolvedValueOnce(page([session(0)], 2, 0, true))
      .mockResolvedValueOnce(page([session(1)], 2, 1)).mockResolvedValueOnce(page([updated]));
    mocks.attendance.mockResolvedValue({ success: true, sessionId: "session-1" });
    await render("A", false, true); await click("Load more");
    await act(async () => { [...host.querySelectorAll("button")].filter(x => x.textContent === "Complete")[1].click(); });
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm completion")!.click(); });
    expect(mocks.query).toHaveBeenLastCalledWith({ scheduleId: "A", page: 0 });
    expect(host.querySelectorAll("li")).toHaveLength(1);
    expect(host.textContent).not.toContain("2030-01-02");
    await click("Start");
    mocks.attendance.mockResolvedValue({ success: false, code: "notEligible" });
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm start")!.click(); });
    expect(mocks.attendance).toHaveBeenLastCalledWith(expect.objectContaining({ sessionId: updated.id, expectedUpdatedAt: updated.updated_at }));
  });

  it.each(["Attendance", "Reschedule"])("serializes same-tick modal openers when %s opens first", async first => {
    mocks.query.mockResolvedValue(page([session(0)], 2, 0, true));
    await render("A", true, true);
    await act(async () => {
      const attend = button("Complete"), reschedule = button("Reschedule");
      if (first === "Attendance") { attend.click(); reschedule.click(); }
      else { reschedule.click(); attend.click(); }
    });
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(button("Load more").disabled).toBe(true);
    expect(button("Reschedule").disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(first === "Attendance" ? "Confirm completion" : "Confirm reschedule");
  });

  it("clears an open Attendance dialog on schedule change and ignores its late mutation result", async () => {
    const oldMutation = deferred<{ success: true; sessionId: string }>();
    mocks.query.mockResolvedValueOnce(page([session(0)])).mockResolvedValueOnce(page([session(9)]));
    mocks.attendance.mockReturnValue(oldMutation.promise);
    await render("A", false, true); await click("Complete");
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm completion")!.click(); });
    await render("B", false, true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).not.toContain("2030-01-01");
    await act(async () => { oldMutation.resolve({ success: true, sessionId: "session-0" }); });
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("2030-01-10");
  });

  it("removes controls and the current dialog if canAttend is revoked", async () => {
    mocks.query.mockResolvedValue(page([session(0)]));
    await render("A", false, true); await click("Complete");
    await render("A", false, false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelectorAll("li button")).toHaveLength(0);
  });

  it("checks latest after notEligible without optimistic status or another mutation", async () => {
    mocks.query.mockResolvedValueOnce(page([session(0)])).mockResolvedValueOnce(page([session(0, "completed")]));
    mocks.attendance.mockResolvedValue({ success: false, code: "notEligible" });
    await render("A", false, true); await click("Complete");
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Confirm completion")!.click(); });
    expect(host.textContent).toContain("Scheduled");
    await act(async () => { [...document.querySelectorAll("button")].find(x => x.textContent === "Check latest session")!.click(); });
    expect(mocks.attendance).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Completed");
    expect(host.querySelectorAll("li button")).toHaveLength(0);
  });
});
