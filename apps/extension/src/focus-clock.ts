import type {
  FocusWireSegment,
  FocusWireSnapshot,
} from "./shared/focus-protocol";

export type FocusProjection = {
  phase: "running" | "paused" | "awaiting_next" | "invalid";
  current: FocusWireSegment | null;
  next: FocusWireSegment | null;
  remainingSeconds: number;
  isDue: boolean;
};

function milliseconds(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function projectFocus(
  snapshot: FocusWireSnapshot,
  nowMs: number,
): FocusProjection {
  const segments = [...snapshot.segments].sort(
    (a, b) => a.position - b.position,
  );

  const live = segments.filter(
    (s) => s.status === "running" || s.status === "paused",
  );

  const current = live.length === 1 ? live[0] : null;
  const next = segments.find((s) => s.status === "pending") ?? null;

  const phase: FocusProjection["phase"] =
    live.length > 1
      ? "invalid"
      : current?.status === "paused"
        ? "paused"
        : current?.status === "running"
          ? "running"
          : next
            ? "awaiting_next"
            : "invalid";

  if (!current) {
    return {
      phase,
      current: null,
      next,
      remainingSeconds: 0,
      isDue: false,
    };
  }

  const start = milliseconds(current.started_at);

  if (start === null) {
    return {
      phase: "invalid",
      current,
      next,
      remainingSeconds: 0,
      isDue: false,
    };
  }

  const end =
    current.status === "paused" ? milliseconds(current.paused_at) : nowMs;

  if (end === null) {
    return {
      phase: "invalid",
      current,
      next,
      remainingSeconds: 0,
      isDue: false,
    };
  }

  const elapsed = Math.min(
    current.planned_seconds,
    Math.max(
      0,
      Math.floor((end - start) / 1000) - current.total_paused_seconds,
    ),
  );

  const remainingSeconds = Math.max(0, current.planned_seconds - elapsed);

  return {
    phase,
    current,
    next,
    remainingSeconds,
    isDue: phase === "running" && remainingSeconds === 0,
  };
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;

  return hours > 0
    ? `${String(hours).padStart(2, "0")}:` +
        `${String(minutes).padStart(2, "0")}:` +
        `${String(remainder).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:` +
        `${String(remainder).padStart(2, "0")}`;
}
