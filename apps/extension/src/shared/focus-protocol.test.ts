import { describe, expect, it } from "vitest";
import { focusResult, isFocusRequest, isFocusResponse } from "./focus-protocol";

const envelope = {
  channel: "lumivox.extension",
  version: 1,
};

describe("Extension Focus protocol", () => {
  it("accepts snapshot reads", () => {
    expect(
      isFocusRequest({
        ...envelope,
        type: "FOCUS_GET",
      }),
    ).toBe(true);
  });

  it("accepts a correctly identified transition", () => {
    expect(
      isFocusRequest({
        ...envelope,
        type: "FOCUS_TRANSITION",
        action: "pause",
        sessionId: "11111111-1111-4111-8111-111111111111",
        expectedSegmentId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(true);
  });

  it("rejects transitions without segment preconditions", () => {
    expect(
      isFocusRequest({
        ...envelope,
        type: "FOCUS_TRANSITION",
        action: "pause",
        sessionId: "11111111-1111-4111-8111-111111111111",
        expectedSegmentId: "",
      }),
    ).toBe(false);
  });

  it("rejects unapproved actions", () => {
    expect(
      isFocusRequest({
        ...envelope,
        type: "FOCUS_TRANSITION",
        action: "delete_all_sessions",
        sessionId: "11111111-1111-4111-8111-111111111111",
        expectedSegmentId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(false);
  });

  it("rejects incompatible versions", () => {
    expect(
      isFocusRequest({
        ...envelope,
        version: 99,
        type: "FOCUS_GET",
      }),
    ).toBe(false);
  });

  it("accepts a defined idle response", () => {
    expect(isFocusResponse(focusResult("idle", null))).toBe(true);
  });

  it("rejects malformed active responses", () => {
    expect(
      isFocusResponse({
        ...envelope,
        type: "FOCUS_RESULT",
        state: "active",
        snapshot: { session: null },
      }),
    ).toBe(false);
  });
});
