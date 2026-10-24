import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveFocusSessionWithTask } from "../focus-session.types";

const confirmation = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/components/ui/use-confirm-dialog", () => ({ useConfirmDialog: () => confirmation }));

const mocks = vi.hoisted(() => ({ create: vi.fn(), complete: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), success: vi.fn(), refresh: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("../focus-session.actions", () => ({
  createFocusSessionAction: mocks.create,
  completeFocusSessionAction: mocks.complete,
  pauseFocusSessionAction: mocks.pause,
  resumeFocusSessionAction: mocks.resume,
  cancelFocusSessionAction: mocks.cancel,
}));

import { ActiveFocusSessionPanel } from "./active-focus-session-panel";
import { StartFocusSessionForm } from "./start-focus-session-form";

describe("focus session UI", () => {
  let container: HTMLDivElement;
  let root: Root;
  const session: ActiveFocusSessionWithTask = {
    id: "session", planned_minutes: 25, started_at: "2026-10-12T12:00:00Z",
    total_paused_seconds: 0, paused_at: null, status: "ongoing", tasks: null,
  };

  beforeEach(() => {
    vi.clearAllMocks(); confirmation.mockResolvedValue(true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T12:02:00Z"));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  const timer = () => container.querySelector('[role="timer"]')!;
  const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

  it("counts down and exposes progress without announcing each second", () => {
    act(() => root.render(<ActiveFocusSessionPanel session={session} />));
    expect(timer().textContent).toBe("23:00");
    expect(timer().getAttribute("aria-live")).toBe("off");
    act(() => vi.advanceTimersByTime(1000));
    expect(timer().textContent).toBe("22:59");
    act(() => button("actions.expand").click());
    expect(button("actions.collapse").getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("8");
  });

  it("freezes paused sessions and disables completion while paused", () => {
    act(() => root.render(<ActiveFocusSessionPanel session={{ ...session, status: "paused", paused_at: "2026-10-12T12:01:00Z" }} />));
    expect(timer().textContent).toBe("24:00");
    act(() => vi.advanceTimersByTime(5000));
    expect(timer().textContent).toBe("24:00");
    expect(button("actions.complete").disabled).toBe(true);
    expect(button("actions.resume")).not.toBeNull();
  });

  it("clamps elapsed sessions to zero and complete progress", () => {
    act(() => root.render(<ActiveFocusSessionPanel session={{ ...session, started_at: "2026-10-12T11:30:00Z" }} />));
    expect(timer().textContent).toBe("00:00");
    act(() => button("actions.expand").click());
    expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    expect(container.textContent).toContain("durationReached");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it.each([false, true])("restores completion controls after failure (throws=%s)", async (throws) => {
    if (throws) mocks.complete.mockRejectedValue(new Error("network"));
    else mocks.complete.mockResolvedValue({ success: false, message: "Rejected" });
    act(() => root.render(<ActiveFocusSessionPanel session={session} />));
    await act(async () => button("actions.complete").click());
    expect(button("actions.complete").disabled).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith(throws ? "requestFailed" : "Rejected");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(["pause", "resume", "cancel"] as const)("handles rejected %s without success feedback", async action => {
    mocks[action].mockRejectedValue(new Error("network"));
    confirmation.mockResolvedValue(true);
    const value = action === "resume" ? { ...session, status: "paused" as const, paused_at: "2026-10-12T12:01:00Z" } : session;
    act(() => root.render(<ActiveFocusSessionPanel session={value} />));
    await act(async () => button(`actions.${action}`).click());
    expect(mocks.error).toHaveBeenCalledWith("requestFailed");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(button(`actions.${action}`).disabled).toBe(false);
  });

  it.each(["pause", "resume", "cancel", "complete"] as const)("refreshes stale %s failures without success feedback", async action => {
    mocks[action].mockResolvedValue({ success: false, message: "Session state changed. Please refresh." });
    confirmation.mockResolvedValue(true);
    const value = action === "resume" ? { ...session, status: "paused" as const, paused_at: "2026-10-12T12:01:00Z" } : session;
    act(() => root.render(<ActiveFocusSessionPanel session={value} />));
    await act(async () => button(`actions.${action}`).click());
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith("Session state changed. Please refresh.");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(button(`actions.${action}`).disabled).toBe(false);
  });

  it.each(["pause", "resume", "cancel"] as const)("does not refresh ordinary %s failures", async action => {
    mocks[action].mockResolvedValue({ success: false, message: "Rejected" });
    confirmation.mockResolvedValue(true);
    act(() => root.render(<ActiveFocusSessionPanel session={action === "resume" ? { ...session, status: "paused", paused_at: "2026-10-12T12:01:00Z" } : session} />));
    await act(async () => button(`actions.${action}`).click());
    expect(mocks.error).toHaveBeenCalledWith("Rejected");
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("uses the duration preset and preserves unlinked task semantics", async () => {
    mocks.create.mockResolvedValue({ success: true, message: "Created" });
    act(() => root.render(<StartFocusSessionForm tasks={[]} />));
    const presets = container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]');
    act(() => presets[1].click());
    expect(presets[1].getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("45");
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(mocks.create).toHaveBeenCalledWith({ taskId: "", plannedMinutes: 45 });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
