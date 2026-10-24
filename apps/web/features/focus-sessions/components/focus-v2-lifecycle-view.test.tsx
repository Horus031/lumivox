import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusV2Snapshot } from "../focus-v2.types";

const confirmation = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/components/ui/use-confirm-dialog", () => ({ useConfirmDialog: () => confirmation }));

const mocks = vi.hoisted(() => ({
  refreshRoute: vi.fn(), refresh: vi.fn(), transition: vi.fn(),
  timer: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refreshRoute }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key }));
vi.mock("../use-focus-v2-timer", () => ({ useFocusV2Timer: mocks.timer }));

import { FocusV2LifecycleView } from "./focus-v2-lifecycle-view";

const id = "11111111-1111-4111-8111-111111111111";
const at = "2026-10-18T10:00:00Z";
const baseSegment = { id, session_id: id, position: 1, round_number: 1, segment_kind: "focus",
  planned_seconds: 300, status: "running", started_at: at, paused_at: null, ended_at: null,
  total_paused_seconds: 0, actual_seconds: 0, created_at: at, updated_at: at };
const breakSegment = { ...baseSegment, id: "22222222-2222-4222-8222-222222222222",
  position: 2, segment_kind: "short_break", planned_seconds: 60, round_number: 1,
  status: "pending", started_at: null };
const finalSegment = { ...baseSegment, id: "33333333-3333-4333-8333-333333333333",
  position: 3, round_number: 2, status: "pending", started_at: null };
const snapshot = {
  session: { id, user_id: id, task_id: null, session_mode: "pomodoro", status: "ongoing",
    planned_minutes: 10, actual_focus_minutes: 0, started_at: at, ended_at: null },
  plan: { session_id: id, focus_minutes: 5, short_break_minutes: 1,
    long_break_minutes: 15, round_count: 2, long_break_every: 4,
    auto_start_breaks: false, auto_start_focus: false, config_version: 1, created_at: at },
  segments: [baseSegment, breakSegment, finalSegment], serverObservedAt: at,
} as FocusV2Snapshot;

function setTimer(phase: "running" | "paused" | "awaiting_next" | "completed", kind = "focus") {
  const current = phase === "running" || phase === "paused"
    ? { ...baseSegment, segment_kind: kind, status: phase } : null;
  const next = phase === "awaiting_next" ? breakSegment : null;
  const s = phase === "completed"
    ? { ...snapshot, session: { ...snapshot.session, status: "completed", actual_focus_minutes: 10 } }
    : snapshot;
  mocks.timer.mockReturnValue({ snapshot: s, projection: { phase, current, next,
    remainingSeconds: 240, elapsedSeconds: 60, progressPercent: 20, isDue: false },
  isPending: false, error: null, visible: true, online: true,
  refresh: mocks.refresh, transition: mocks.transition });
}

describe("Focus V2 production lifecycle UI", () => {
  let node: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.clearAllMocks(); confirmation.mockResolvedValue(true);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    mocks.transition.mockResolvedValue(true);
    setTimer("running");
  });
  afterEach(() => { act(() => root.unmount()); node.remove(); });
  function mount() { act(() => root.render(<FocusV2LifecycleView initialSnapshot={snapshot} taskTitle="React Hooks" />)); }
  function button(label: string) {
    const found = [...node.querySelectorAll("button")].find(b => b.textContent?.includes(label));
    if (!found) throw new Error(`Missing ${label}`);
    return found;
  }
  it("shows study status, accessible timer, timeline and progress", () => {
    mount();
    expect(node.textContent).toContain("React Hooks");
    expect(node.querySelector('[role="timer"]')?.textContent).toBe("04:00");
    expect(node.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("20");
    expect(node.querySelectorAll("ol li")).toHaveLength(3);
    expect(button("pause")).toBeTruthy();
  });
  it("awaiting break offers explicit start but never timer pause", async () => {
    setTimer("awaiting_next"); mount();
    expect(node.querySelector('[role="timer"]')).toBeNull();
    await act(async () => button("startNext").click());
    expect(mocks.transition).toHaveBeenCalledWith("start_next", breakSegment.id);
  });
  it("paused round resumes using the current segment id", async () => {
    setTimer("paused"); mount();
    await act(async () => button("resume").click());
    expect(mocks.transition).toHaveBeenCalledWith("resume", id);
  });
  it("only shows skip break on a running break", async () => {
    setTimer("running", "short_break"); mount();
    await act(async () => button("skipBreak").click());
    expect(mocks.transition).toHaveBeenCalledWith("skip_break", id);
  });
  it("cancellation requires confirmation", async () => {
    const confirm = confirmation.mockResolvedValue(false);
    mount(); await act(async () => button("cancel").click());
    expect(mocks.transition).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
  it("terminal session shows summary and routes back to builder", async () => {
    setTimer("completed"); mount();
    expect(node.querySelector('[role="timer"]')).toBeNull();
    await act(async () => button("newSession").click());
    expect(mocks.refreshRoute).toHaveBeenCalledOnce();
  });
  it("allows an immersive view and Escape exits", () => {
    mount();
    act(() => node.querySelector<HTMLButtonElement>('[aria-label="immersive"]')!.click());
    expect(node.querySelector('[aria-pressed="true"]')).not.toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(node.querySelector('[aria-pressed="true"]')).toBeNull();
  });
  it("keeps the chat and its draft mounted across fullscreen and settings", () => {
    act(() => root.render(<FocusV2LifecycleView initialSnapshot={snapshot} taskTitle="Study">
      <input aria-label="Chat draft" defaultValue="Keep this question" />
    </FocusV2LifecycleView>));
    const draft = node.querySelector("input");
    expect(document.querySelector('[aria-label="title"]')).toBeNull();
    act(() => node.querySelector<HTMLButtonElement>('[aria-label="immersive"]')!.click());
    expect(node.querySelector("input")).toBe(draft);
    expect(document.body.style.overflow).toBe("hidden");
    act(() => node.querySelector<HTMLButtonElement>('[aria-label="settings"]')!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(node.querySelector("input")).toBe(draft);
    // Escape belongs to the settings dialog while it is open.
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(node.querySelector('[aria-label="exitImmersive"]')).not.toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!.click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(node.querySelector('[aria-label="immersive"]')).not.toBeNull();
    expect(node.querySelector("input")).toBe(draft);
    expect(draft?.value).toBe("Keep this question");
    expect(document.body.style.overflow).not.toBe("hidden");
  });

});
