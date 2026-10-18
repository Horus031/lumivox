import { describe, expect, it } from "vitest";
import {
  buildFocusV2Schedule,
  DEFAULT_FOCUS_V2_CONFIG,
  focusV2ConfigSchema,
} from "./focus-v2-config.schemas";

describe("Focus V2 configuration and immutable schedule", () => {
  it("generates classic 25/5 × 4 as 100 focus + 15 break minutes", () => {
    const schedule = buildFocusV2Schedule(DEFAULT_FOCUS_V2_CONFIG);
    expect(schedule.plannedFocusMinutes).toBe(100);
    expect(schedule.plannedBreakMinutes).toBe(15);
    expect(schedule.plannedTotalMinutes).toBe(115);
    expect(schedule.segments).toHaveLength(7);
    expect(schedule.segments.map((segment) => segment.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(schedule.segments[6]).toMatchObject({
      segmentKind: "focus", roundNumber: 4, plannedSeconds: 1500,
    });
  });

  it("inserts a long break only between rounds, at configured cadence", () => {
    const schedule = buildFocusV2Schedule({
      ...DEFAULT_FOCUS_V2_CONFIG,
      roundCount: 6,
      longBreakEvery: 4,
    });
    expect(schedule.segments[7]).toMatchObject({
      position: 8, segmentKind: "long_break", roundNumber: 4, plannedSeconds: 900,
    });
    expect(schedule.plannedBreakMinutes).toBe(35);
    expect(schedule.segments.at(-1)?.segmentKind).toBe("focus");
  });

  it("does not schedule a break when there is one round", () => {
    const schedule = buildFocusV2Schedule({ ...DEFAULT_FOCUS_V2_CONFIG, roundCount: 1 });
    expect(schedule.segments).toHaveLength(1);
    expect(schedule.plannedBreakMinutes).toBe(0);
    expect(schedule.plannedTotalMinutes).toBe(25);
  });

  it.each([
    { focusMinutes: 0 },
    { shortBreakMinutes: 31 },
    { longBreakMinutes: 4 },
    { roundCount: 9 },
    { longBreakEvery: 1 },
    { focusMinutes: 25.5 },
  ])("rejects invalid configuration %j", (patch) => {
    expect(focusV2ConfigSchema.safeParse({ ...DEFAULT_FOCUS_V2_CONFIG, ...patch }).success).toBe(false);
  });

  it("rejects unexpected inputs and invalid linked task IDs", () => {
    expect(focusV2ConfigSchema.safeParse({ ...DEFAULT_FOCUS_V2_CONFIG, unknown: "x" }).success).toBe(false);
    expect(focusV2ConfigSchema.safeParse({ ...DEFAULT_FOCUS_V2_CONFIG, taskId: "not-a-uuid" }).success).toBe(false);
  });
});
