import { describe, expect, it } from "vitest";
import { formatFocusV2Clock, getFocusV2LifecycleStats } from "./focus-v2-lifecycle.model";
import { projectFocusV2Timer } from "./focus-v2.timer";
import type { FocusV2Segment, FocusV2Snapshot } from "./focus-v2.types";

const t0 = "2026-10-18T10:00:00.000Z";
const base = {
  id: "one", session_id: "session", position: 1, round_number: 1, segment_kind: "focus",
  planned_seconds: 300, status: "running", started_at: t0, paused_at: null,
  ended_at: null, total_paused_seconds: 0, actual_seconds: 0, created_at: t0, updated_at: t0,
} as FocusV2Segment;
const rest = {
  ...base, id: "two", position: 2, round_number: 1, segment_kind: "short_break",
  planned_seconds: 60, status: "pending", started_at: null,
} as FocusV2Segment;
const last = { ...base, id: "three", position: 3, round_number: 2, status: "pending", started_at: null } as FocusV2Segment;
const snapshot = {
  session: { id: "session", user_id: "user", task_id: null, session_mode: "pomodoro",
    status: "ongoing", planned_minutes: 10, actual_focus_minutes: 0, started_at: t0, ended_at: null },
  plan: { session_id: "session", focus_minutes: 5, short_break_minutes: 1,
    long_break_minutes: 15, round_count: 2, long_break_every: 4,
    auto_start_breaks: false, auto_start_focus: false, config_version: 1, created_at: t0 },
  segments: [base, rest, last], serverObservedAt: t0,
} as FocusV2Snapshot;

const at = (time: string) => Date.parse(`2026-10-18T${time}Z`);

describe("Focus V2 lifecycle view model", () => {
  it("keeps focus and break totals separate during study", () => {
    const projection = projectFocusV2Timer(snapshot, at("10:03:00"));
    const result = getFocusV2LifecycleStats(snapshot, projection);
    expect(result).toMatchObject({ completedRounds: 0, roundCount: 2,
      currentRound: 1, plannedFocusSeconds: 600, plannedBreakSeconds: 60,
      displayedFocusSeconds: 180, displayedBreakSeconds: 0 });
  });
  it("counts a completed round and a running break separately", () => {
    const changed = { ...snapshot, segments: [
      { ...base, status: "completed", ended_at: "2026-10-18T10:05:00Z", actual_seconds: 300 },
      { ...rest, status: "running", started_at: "2026-10-18T10:05:00Z" }, last,
    ] } as FocusV2Snapshot;
    const view = getFocusV2LifecycleStats(changed, projectFocusV2Timer(changed, at("10:05:30")));
    expect(view).toMatchObject({ completedRounds: 1, displayedFocusSeconds: 300,
      displayedBreakSeconds: 30, completedBreaks: 0 });
  });
  it("does not add pending break time while awaiting next", () => {
    const changed = { ...snapshot, segments: [
      { ...base, status: "completed", ended_at: "2026-10-18T10:05:00Z", actual_seconds: 300 }, rest, last,
    ] } as FocusV2Snapshot;
    const view = getFocusV2LifecycleStats(changed, projectFocusV2Timer(changed, at("11:00:00")));
    expect(view.displayedBreakSeconds).toBe(0);
    expect(view.currentRound).toBe(1);
  });
  it("does not count paused time", () => {
    const changed = { ...snapshot,
      session: { ...snapshot.session, status: "paused" },
      segments: [{ ...base, status: "paused", paused_at: "2026-10-18T10:02:00Z" }, rest, last],
    } as FocusV2Snapshot;
    const view = getFocusV2LifecycleStats(changed, projectFocusV2Timer(changed, at("15:00:00")));
    expect(view.displayedFocusSeconds).toBe(120);
  });
  it("formats short and long clocks without negative values", () => {
    expect(formatFocusV2Clock(0)).toBe("00:00");
    expect(formatFocusV2Clock(125)).toBe("02:05");
    expect(formatFocusV2Clock(3725)).toBe("01:02:05");
    expect(formatFocusV2Clock(-200)).toBe("00:00");
  });
});
