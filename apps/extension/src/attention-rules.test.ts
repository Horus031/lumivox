import { describe, expect, it } from "vitest";

import {
  classifyPotentialDistraction,
  finishObservation,
  type AttentionObservation,
} from "./attention-rules";

const initial: AttentionObservation = {
  category: "social_media",
  sessionId: "session-a",
  segmentId: "segment-a",
  tabId: 10,
  startedAtMs: 1_000,
  pausedSecondsAtStart: 0,
};

const sameFocus = {
  sessionId: "session-a",
  segmentId: "segment-a",
  totalPausedSeconds: 0,
};

describe("Attention classification", () => {
  it("classifies supported social media domains", () => {
    expect(
      classifyPotentialDistraction("https://www.facebook.com/groups/example"),
    ).toBe("social_media");
  });

  it("classifies messaging websites", () => {
    expect(classifyPotentialDistraction("https://web.whatsapp.com/")).toBe(
      "messaging",
    );
  });

  it("does not classify unrelated study websites", () => {
    expect(
      classifyPotentialDistraction("https://docs.google.com/document/"),
    ).toBeNull();
  });

  it("rejects deceptive subdomains", () => {
    expect(
      classifyPotentialDistraction("https://facebook.com.attacker.example/"),
    ).toBeNull();
  });

  it("does not classify Chrome internal URLs", () => {
    expect(classifyPotentialDistraction("chrome://extensions")).toBeNull();
  });

  it("only produces the category, not the URL", () => {
    const result = classifyPotentialDistraction(
      "https://instagram.com/private?secret=example",
    );

    expect(result).toBe("social_media");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});

describe("Attention observation", () => {
  it("creates a candidate after 45 seconds", () => {
    expect(finishObservation(initial, 46_000, sameFocus)).toEqual({
      category: "social_media",
      durationSeconds: 45,
    });
  });

  it("rejects short visits", () => {
    expect(finishObservation(initial, 10_000, sameFocus)).toBeNull();
  });

  it("rejects a changed Focus segment", () => {
    expect(
      finishObservation(initial, 46_000, {
        ...sameFocus,
        segmentId: "segment-b",
      }),
    ).toBeNull();
  });

  it("rejects a session from another user context", () => {
    expect(
      finishObservation(initial, 46_000, {
        ...sameFocus,
        sessionId: "session-b",
      }),
    ).toBeNull();
  });

  it("rejects pause/resume changes", () => {
    expect(
      finishObservation(initial, 46_000, {
        ...sameFocus,
        totalPausedSeconds: 12,
      }),
    ).toBeNull();
  });

  it("rejects overly long observations", () => {
    expect(
      finishObservation(initial, 1_000 + 16 * 60 * 1_000, sameFocus),
    ).toBeNull();
  });

  it("rejects observation without active Focus", () => {
    expect(finishObservation(initial, 46_000, null)).toBeNull();
  });
});
