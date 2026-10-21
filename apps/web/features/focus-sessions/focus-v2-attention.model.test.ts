import { describe, expect, it } from "vitest";
import { classifyFocusV2Notification, getFocusV2AwayCandidate } from "./focus-v2-attention.model";

type Phase = Parameters<typeof classifyFocusV2Notification>[0];
const p = (phase: Phase["phase"], segmentId: string | null, segmentKind: Phase["segmentKind"]): Phase => ({ phase, segmentId, segmentKind });

describe("Focus V2 attention model", () => {
  it("classifies a focus-to-break boundary", () => {
    expect(classifyFocusV2Notification(p("running", "f1", "focus"), p("awaiting_next", null, null))).toBe("focusFinished");
    expect(classifyFocusV2Notification(p("awaiting_next", null, null), p("running", "b1", "short_break"))).toBe("breakStarted");
  });
  it("does not notify for timer ticks or pause/resume in the same segment", () => {
    expect(classifyFocusV2Notification(p("running", "f1", "focus"), p("running", "f1", "focus"))).toBeNull();
    expect(classifyFocusV2Notification(p("paused", "f1", "focus"), p("running", "f1", "focus"))).toBeNull();
  });
  it("notifies completion once and never cancellation", () => {
    expect(classifyFocusV2Notification(p("running", "f2", "focus"), p("completed", null, null))).toBe("sessionCompleted");
    expect(classifyFocusV2Notification(p("completed", null, null), p("completed", null, null))).toBeNull();
    expect(classifyFocusV2Notification(p("running", "f2", "focus"), p("cancelled", null, null))).toBeNull();
  });
  it("only suggests time away with explicit matching focus segment", () => {
    expect(getFocusV2AwayCandidate(1000, 32_000, "f1", true, 30)).toEqual({ segmentId: "f1", durationSeconds: 31 });
    expect(getFocusV2AwayCandidate(1000, 32_000, "f1", false, 30)).toBeNull();
    expect(getFocusV2AwayCandidate(1000, 15_000, "f1", true, 30)).toBeNull();
  });
  it("limits suggested duration to existing DB maximum", () => {
    expect(getFocusV2AwayCandidate(0, 30_000_000, "f1", true, 30)?.durationSeconds).toBe(7200);
  });
});
