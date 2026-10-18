import { describe, expect, it } from "vitest";
import { calculateFocusV2ElapsedSeconds, projectFocusV2Timer, shouldAutoCompleteFocusV2 } from "./focus-v2.timer";
import type { FocusV2Segment, FocusV2Snapshot } from "./focus-v2.types";

const startedAt = "2026-10-18T10:00:00.000Z";
const segment = {
  id: "seg1", session_id: "sid", position: 1, round_number: 1,
  segment_kind: "focus", planned_seconds: 1500, status: "running",
  started_at: startedAt, paused_at: null, ended_at: null,
  actual_seconds: 0, total_paused_seconds: 0,
  created_at: startedAt, updated_at: startedAt,
} as FocusV2Segment;
const snapshot = {
  session: { id: "sid", user_id: "u", task_id: null, session_mode: "pomodoro",
    status: "ongoing", planned_minutes: 50, actual_focus_minutes: 0,
    started_at: startedAt, ended_at: null },
  plan: { session_id: "sid", focus_minutes: 25, short_break_minutes: 5,
    long_break_minutes: 15, round_count: 2, long_break_every: 4,
    auto_start_breaks: false, auto_start_focus: false, config_version: 1,
    created_at: startedAt },
  segments: [segment], serverObservedAt: startedAt,
} as FocusV2Snapshot;
const at = (time: string) => Date.parse(`2026-10-18T${time}Z`);

describe("Focus V2 pure timer", () => {
  it("projects from absolute timestamps, not interval increments", () => {
    const result = projectFocusV2Timer(snapshot, at("10:05:00"));
    expect(result.remainingSeconds).toBe(1200);
    expect(result.elapsedSeconds).toBe(300);
    expect(result.progressPercent).toBe(20);
  });
  it("freezes time throughout an open pause", () => {
    const paused = { ...segment, status: "paused", paused_at: "2026-10-18T10:05:00Z" } as FocusV2Segment;
    const input = { ...snapshot, session: { ...snapshot.session, status: "paused" }, segments: [paused] } as FocusV2Snapshot;
    expect(projectFocusV2Timer(input, at("17:00:00")).remainingSeconds).toBe(1200);
  });
  it("excludes cumulative closed pauses", () => {
    const resumed = { ...segment, total_paused_seconds: 120 } as FocusV2Segment;
    expect(calculateFocusV2ElapsedSeconds(resumed, at("10:07:00"))).toBe(300);
  });
  it("clamps long sleep and future start safely", () => {
    expect(projectFocusV2Timer(snapshot, at("19:00:00")).remainingSeconds).toBe(0);
    expect(projectFocusV2Timer(snapshot, at("09:00:00")).elapsedSeconds).toBe(0);
  });
  it("does not auto-complete in a hidden/offline/paused tab", () => {
    const due = projectFocusV2Timer(snapshot, at("10:26:00"));
    expect(shouldAutoCompleteFocusV2(due, true, true)).toBe(true);
    expect(shouldAutoCompleteFocusV2(due, false, true)).toBe(false);
    expect(shouldAutoCompleteFocusV2(due, true, false)).toBe(false);
    const paused = { ...snapshot, session: { ...snapshot.session, status: "paused" }, segments: [{ ...segment, status: "paused", paused_at: startedAt }] } as FocusV2Snapshot;
    expect(shouldAutoCompleteFocusV2(projectFocusV2Timer(paused, at("19:00:00")), true, true)).toBe(false);
  });
  it("detects awaiting-next without treating it as a running break", () => {
    const pending = { ...segment, id: "seg2", position: 2, round_number: 1, segment_kind: "short_break", planned_seconds: 300, started_at: null, status: "pending" } as FocusV2Segment;
    const input = { ...snapshot, segments: [{ ...segment, status: "completed", ended_at: "2026-10-18T10:25:00Z", actual_seconds: 1500 }, pending] } as FocusV2Snapshot;
    expect(projectFocusV2Timer(input, at("19:00:00"))).toMatchObject({ phase: "awaiting_next", current: null, next: { id: "seg2" }, isDue: false });
  });
  it("does not restart a terminal parent", () => {
    const terminal = { ...snapshot, session: { ...snapshot.session, status: "completed" } } as FocusV2Snapshot;
    expect(projectFocusV2Timer(terminal, at("19:00:00")).phase).toBe("completed");
  });
});
