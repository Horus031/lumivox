import { PROTOCOL_CHANNEL, PROTOCOL_VERSION } from "./shared/protocol";
import {
  isFocusResponse,
  type FocusAction,
  type FocusResponse,
  type FocusWireSnapshot,
} from "./shared/focus-protocol";
import { formatClock, projectFocus } from "./focus-clock";

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing focus UI: ${id}`);
  return node as T;
}

async function sendFocus(
  request: Record<string, unknown>,
): Promise<FocusResponse> {
  const response: unknown = await chrome.runtime.sendMessage({
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    ...request,
  });

  if (!isFocusResponse(response)) {
    throw new Error("Invalid Focus response");
  }

  return response;
}

export function initializeFocusPopup(): void {
  const panel = required("focus-panel");
  const state = required("focus-state");
  const clock = required("focus-time");
  const round = required("focus-round");
  const message = required("focus-message");
  const refreshButton = required<HTMLButtonElement>("focus-refresh");

  const buttons = Array.from(
    panel.querySelectorAll<HTMLButtonElement>("button[data-focus-action]"),
  );

  let snapshot: FocusWireSnapshot | null = null;
  let serverOffsetMs = 0;
  let busy = false;
  let connectionHealthy = false;
  let requestGeneration = 0;

  function display() {
    if (!snapshot) return;

    const projection = projectFocus(snapshot, Date.now() + serverOffsetMs);

    const current = projection.current ?? projection.next;

    const phaseName =
      current?.segment_kind === "focus"
        ? "Học tập"
        : current?.segment_kind === "long_break"
          ? "Nghỉ dài"
          : "Nghỉ ngắn";

    state.textContent =
      projection.phase === "paused"
        ? `${phaseName} · Đã tạm dừng`
        : projection.phase === "awaiting_next"
          ? "Chờ bắt đầu vòng mới"
          : projection.phase === "running"
            ? `${phaseName} · Đang chạy`
            : "Trạng thái cần đồng bộ lại";

    clock.textContent =
      projection.phase === "awaiting_next" && current
        ? formatClock(current.planned_seconds)
        : formatClock(projection.remainingSeconds);

    round.textContent = current
      ? `Vòng ${current.round_number}/${snapshot.plan.roundCount}`
      : "";

    const visible = new Set<FocusAction>();

    if (projection.phase === "running" && current) {
      if (projection.isDue) {
        visible.add("complete");
      } else {
        visible.add("pause");
      }

      if (current.segment_kind !== "focus") {
        visible.add("skip_break");
      }
    }

    if (projection.phase === "paused") {
      visible.add("resume");
    }

    if (projection.phase === "awaiting_next" && projection.next) {
      visible.add("start_next");
    }

    for (const button of buttons) {
      const action = button.dataset.focusAction as FocusAction;
      button.hidden = !visible.has(action);
      button.disabled = busy || !connectionHealthy;
    }

    refreshButton.disabled = busy;
  }

  function apply(response: FocusResponse) {
    if (response.state === "unauthorized") {
      snapshot = null;
      panel.hidden = true;
      connectionHealthy = false;
      return;
    }

    panel.hidden = false;
    message.textContent = response.message ?? "";

    if (response.state === "idle") {
      snapshot = null;
      state.textContent = "Chưa có phiên Pomodoro đang chạy";
      clock.textContent = "--:--";
      round.textContent = "";
      for (const button of buttons) button.hidden = true;
      connectionHealthy = true;
      return;
    }

    if (response.state === "active" && response.snapshot) {
      snapshot = response.snapshot;
      connectionHealthy = true;

      serverOffsetMs = Date.parse(snapshot.serverTime) - Date.now();

      display();
      return;
    }

    // We no longer know whether the snapshot is current.
    // Keep it for display only; never allow further writes.
    connectionHealthy = false;

    if (snapshot) {
      display();
    } else {
      for (const button of buttons) {
        button.hidden = true;
        button.disabled = true;
      }
      clock.textContent = "--:--";
      round.textContent = "";
    }

    state.textContent =
      response.state === "conflict"
        ? "Phiên đã thay đổi; cần đồng bộ"
        : "Mất kết nối với Focus Service";
  }

  async function refresh() {
    if (busy) return;

    const generation = ++requestGeneration;
    refreshButton.disabled = true;

    try {
      const response = await sendFocus({
        type: "FOCUS_GET",
      });

      if (generation === requestGeneration) {
        apply(response);
      }
    } catch {
      if (generation === requestGeneration) {
        apply({
          channel: PROTOCOL_CHANNEL,
          version: PROTOCOL_VERSION,
          type: "FOCUS_RESULT",
          state: "unavailable",
        });
      }
    } finally {
      refreshButton.disabled = false;
    }
  }

  async function transition(action: FocusAction) {
    if (busy || !snapshot || !connectionHealthy) return;

    const projection = projectFocus(snapshot, Date.now() + serverOffsetMs);

    const selected =
      action === "start_next" ? projection.next : projection.current;

    if (!selected) return;

    busy = true;
    ++requestGeneration;
    display();

    try {
      const result = await sendFocus({
        type: "FOCUS_TRANSITION",
        sessionId: snapshot.session.id,
        expectedSegmentId: selected.id,
        action,
      });

      apply(result);

      if (result.state === "conflict" || result.state === "unavailable") {
        busy = false;
        await refresh();
      }
    } catch {
      busy = false;
      await refresh();
    } finally {
      busy = false;
      display();
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => {
      const action = button.dataset.focusAction as FocusAction;
      void transition(action);
    });
  }

  refreshButton.addEventListener("click", () => {
    void refresh();
  });

  window.addEventListener("lumivox-auth-changed", () => {
    ++requestGeneration;
    snapshot = null;
    void refresh();
  });

  window.addEventListener("focus", () => void refresh());

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      void refresh();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  const clockInterval = window.setInterval(display, 1_000);
  const pollingInterval = window.setInterval(() => void refresh(), 15_000);

  window.addEventListener("pagehide", () => {
    window.clearInterval(clockInterval);
    window.clearInterval(pollingInterval);
    document.removeEventListener("visibilitychange", onVisibility);
  });

  void refresh();
}
