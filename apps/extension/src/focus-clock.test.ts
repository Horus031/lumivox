import { describe, expect, it } from "vitest";
import { formatClock, projectFocus } from "./focus-clock";
import type { FocusWireSnapshot } from "./shared/focus-protocol";

const start = Date.parse("2026-10-20T10:00:00Z");

function snapshot(
  status: "running" | "paused" | "completed" = "running",
): FocusWireSnapshot {
  return {
    session: {
      id: "11111111-1111-4111-8111-111111111111",
      status: status === "paused" ? "paused" : "ongoing",
    },
    plan: { roundCount: 2 },
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        position: 1,
        round_number: 1,
        segment_kind: "focus",
        status,
        planned_seconds: 300,
        actual_seconds: status === "completed" ? 300 : 0,
        started_at: "2026-10-20T10:00:00Z",
        paused_at: status === "paused" ? "2026-10-20T10:02:00Z" : null,
        total_paused_seconds: 0,
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        position: 2,
        round_number: 1,
        segment_kind: "short_break",
        status: "pending",
        planned_seconds: 60,
        actual_seconds: 0,
        started_at: null,
        paused_at: null,
        total_paused_seconds: 0,
      },
    ],
    serverTime: "2026-10-20T10:00:00Z",
  };
}

describe("Extension Focus timer", () => {
  it("derives elapsed time from timestamps", () => {
    const result = projectFocus(snapshot(), start + 120_000);

    expect(result.phase).toBe("running");
    expect(result.remainingSeconds).toBe(180);
  });

  it("does not advance during pause", () => {
    const result = projectFocus(snapshot("paused"), start + 900_000);

    expect(result.phase).toBe("paused");
    expect(result.remainingSeconds).toBe(180);
  });

  it("detects a phase reaching its deadline", () => {
    const result = projectFocus(snapshot(), start + 301_000);

    expect(result.remainingSeconds).toBe(0);
    expect(result.isDue).toBe(true);
  });

  it("handles an awaiting-next phase", () => {
    const result = projectFocus(snapshot("completed"), start + 900_000);

    expect(result.phase).toBe("awaiting_next");
    expect(result.next?.segment_kind).toBe("short_break");
  });

  it("formats both short and long sessions", () => {
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(3661)).toBe("01:01:01");
    expect(formatClock(-10)).toBe("00:00");
  });
});
