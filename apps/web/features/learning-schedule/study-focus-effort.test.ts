import { describe, expect, it } from "vitest";
import { projectStudyFocusEffort, type FocusEffortSource } from "./study-focus-effort";

const legacy: FocusEffortSource = {
  focusSessionId: "legacy", studySessionId: "study", mode: "legacy", status: "completed",
  parentActualMinutes: 5, segments: [{ kind: "focus", status: "completed", actualSeconds: 99 }],
};
const pomodoro: FocusEffortSource = {
  focusSessionId: "pomodoro", studySessionId: "study", mode: "pomodoro", status: "cancelled",
  parentActualMinutes: 99, segments: [
    { kind: "focus", status: "completed", actualSeconds: 40 },
    { kind: "short_break", status: "completed", actualSeconds: 60 },
    { kind: "focus", status: "interrupted", actualSeconds: 35 },
    { kind: "long_break", status: "pending", actualSeconds: 0 },
    { kind: "focus", status: "pending", actualSeconds: 0 },
  ],
};
const incomplete = { success: false, code: "incompleteData" };

describe("Recorded Focus projection", () => {
  it("returns zero for a fully read study with no links", () => {
    expect(projectStudyFocusEffort(["study"], [])).toEqual({ success: true, efforts: [{
      studySessionId: "study", focusSessionCount: 0, recordedSeconds: 0, recordedMinutes: 0, hasActiveFocus: false,
    }] });
  });
  it("uses only the authoritative source and floors after adding seconds across sessions", () => {
    const second = { ...pomodoro, focusSessionId: "second", status: "paused" as const,
      segments: [{ kind: "focus", status: "paused", actualSeconds: 47 }] as const };
    expect(projectStudyFocusEffort(["study"], [legacy, pomodoro, second])).toMatchObject({ success: true,
      efforts: [{ focusSessionCount: 3, recordedSeconds: 422, recordedMinutes: 7, hasActiveFocus: true }],
    });
  });
  it("rejects the same Focus twice even if the second points at a different Study", () => {
    expect(projectStudyFocusEffort(["study", "other"], [legacy, legacy])).toEqual(incomplete);
    expect(projectStudyFocusEffort(["study", "other"], [legacy, { ...legacy, studySessionId: "other" }])).toEqual(incomplete);
  });
  it.each([-1, Infinity, NaN, 0.5])("rejects invalid duration %s", actualSeconds => {
    expect(projectStudyFocusEffort(["study"], [{
      ...pomodoro, segments: [{ kind: "focus", status: "completed", actualSeconds }],
    }])).toEqual(incomplete);
  });
  it("rejects missing Pomodoro records and unstarted effort", () => {
    expect(projectStudyFocusEffort(["study"], [{ ...pomodoro, segments: [] }])).toEqual(incomplete);
    expect(projectStudyFocusEffort(["study"], [{
      ...pomodoro, segments: [{ kind: "focus", status: "pending", actualSeconds: 1 }],
    }])).toEqual(incomplete);
  });
});
