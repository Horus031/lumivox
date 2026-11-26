import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RagRecoveryReference } from "../lib/rag-recovery-journal";
import { readRecoveryReference } from "../lib/rag-recovery-journal";
import { useRagOperationRecovery } from "./use-rag-operation-recovery";

const mocked = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("../rag-chat.actions", () => ({ reconcileRagOperationAction: mocked.status }));

const focus = "f6100000-0000-4000-8000-000000000011";
const request = "f6110000-0000-4000-8000-000000000001";
const reference: RagRecoveryReference = {
  version: 1, protocol: "rag-v2", operation: "ask", clientRequestId: request,
  focusSessionId: focus, sessionId: null, createdAt: 0,
};
const active = {
  enabled: true, recovery_enabled: true, session_id: null, completed_turn_count: 0,
  selected_document_ids: [], messages: [], top_k: 5, prompt_variant: "grounded_rule",
};

describe("RAG operation recovery", () => {
  let root: Root;
  let element: HTMLDivElement;
  let hook: ReturnType<typeof useRagOperationRecovery>;
  let epoch: { current: number };
  const restore = vi.fn();
  const onTerminal = vi.fn();
  let visibility: DocumentVisibilityState;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    visibility = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    sessionStorage.clear();
    mocked.status.mockReset();
    restore.mockReset().mockResolvedValue(active);
    onTerminal.mockReset();
    epoch = { current: 0 };
    element = document.createElement("div");
    document.body.append(element);
    root = createRoot(element);
    function Harness() {
      hook = useRagOperationRecovery({ accountScope: "test-user", epoch, restore, onTerminal });
      return null;
    }
    await act(async () => root.render(createElement(Harness)));
  });

  afterEach(() => {
    act(() => root.unmount());
    element.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  async function start() {
    await act(async () => { await hook.check(hook.track(reference)); });
  }

  async function tick(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  }

  it("backs off repeated processing checks and stops within 60 seconds", async () => {
    mocked.status.mockResolvedValue({ success: true, data: { operation: "ask", status: "processing" } });
    await start();
    expect(mocked.status).toHaveBeenCalledTimes(1);
    await tick(2999);
    expect(mocked.status).toHaveBeenCalledTimes(1);
    await tick(1);
    await tick(6000);
    for (let i = 0; i < 6; i++) await tick(10_000);
    expect(mocked.status).toHaveBeenCalledTimes(8);
    expect(hook.state).toBe("processing");
    expect(restore).not.toHaveBeenCalled();
  });

  it("pauses polling when hidden and cleans up when the epoch changes", async () => {
    mocked.status.mockResolvedValue({ success: true, data: { operation: "ask", status: "processing" } });
    await start();
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    await tick(15_000);
    expect(mocked.status).toHaveBeenCalledTimes(1);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    await tick(3000);
    expect(mocked.status).toHaveBeenCalledTimes(2);
    epoch.current += 1;
    await tick(6000);
    expect(mocked.status).toHaveBeenCalledTimes(2);
  });

  it("explicitly recovers an expired lease and clears the reference after canonical restore", async () => {
    mocked.status.mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "expired" } })
      .mockResolvedValueOnce({ success: true, data: { operation: "ask", status: "failed" } });
    await start();
    expect(mocked.status.mock.calls[1][0]).toMatchObject({ clientRequestId: request, recoverExpired: true });
    expect(restore).toHaveBeenCalledWith(focus, 0);
    expect(onTerminal).toHaveBeenCalledWith(reference, "failed");
    expect(readRecoveryReference("test-user", focus)).toBeNull();
  });

  it.each(["status", "restore"])("retains the reference on %s failure", async (failedAt) => {
    if (failedAt === "status") mocked.status.mockRejectedValue(Error("timeout"));
    else {
      mocked.status.mockResolvedValue({ success: true, data: { operation: "ask", status: "completed" } });
      restore.mockResolvedValue(null);
    }
    await start();
    expect(hook.state).toBe("unavailable");
    expect(readRecoveryReference("test-user", focus)).toEqual(reference);
    expect(onTerminal).not.toHaveBeenCalled();
  });

  it("ignores a response after focus invalidation", async () => {
    let resolve!: (value: unknown) => void;
    mocked.status.mockReturnValue(new Promise((settle) => { resolve = settle; }));
    await act(async () => { void hook.check(hook.track(reference)); });
    epoch.current += 1;
    await act(async () => resolve({ success: true, data: { operation: "ask", status: "completed" } }));
    expect(restore).not.toHaveBeenCalled();
    expect(onTerminal).not.toHaveBeenCalled();
  });
});
