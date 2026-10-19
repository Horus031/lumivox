import { describe, expect, it } from "vitest";
import { getFocusV2TransitionCue, type FocusV2AudioPhase } from "./focus-v2-audio.cues";
const runningFocus: FocusV2AudioPhase = { phase: "running", segmentId: "focus-1", segmentKind: "focus" };
const waitingBreak: FocusV2AudioPhase = { phase: "awaiting_next", segmentId: null, segmentKind: null };
const runningBreak: FocusV2AudioPhase = { phase: "running", segmentId: "break-1", segmentKind: "short_break" };

describe("Focus V2 transition sound cues", () => {
  it("announces the end of study without double-cueing unchanged snapshots", () => {
    expect(getFocusV2TransitionCue(runningFocus, waitingBreak)).toBe("focus_end");
    expect(getFocusV2TransitionCue(runningFocus, runningFocus)).toBeNull();
  });
  it("announces break start and resuming study as separate events", () => {
    expect(getFocusV2TransitionCue(waitingBreak, runningBreak)).toBe("break_start");
    expect(getFocusV2TransitionCue(runningBreak, { ...runningFocus, segmentId: "focus-2" })).toBe("focus_start");
  });
  it("does not announce pause, cancellation or initial state", () => {
    expect(getFocusV2TransitionCue(runningFocus, { ...runningFocus, phase: "paused" })).toBeNull();
    expect(getFocusV2TransitionCue(runningFocus, { ...runningFocus, phase: "cancelled" })).toBeNull();
  });
  it("announces one final completion event", () => {
    expect(getFocusV2TransitionCue(runningFocus, { phase: "completed", segmentId: null, segmentKind: null })).toBe("session_complete");
    expect(getFocusV2TransitionCue({ phase: "completed", segmentId: null, segmentKind: null },
      { phase: "completed", segmentId: null, segmentKind: null })).toBeNull();
  });
});
