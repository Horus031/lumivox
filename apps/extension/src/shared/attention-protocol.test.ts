import { describe, expect, it } from "vitest";

import {
  attentionResult,
  isAttentionRequest,
  isAttentionResponse,
} from "./attention-protocol";

const envelope = {
  channel: "lumivox.extension",
  version: 1,
};

describe("Attention message protocol", () => {
  it("accepts supported commands", () => {
    for (const type of [
      "ATTENTION_STATUS",
      "ATTENTION_ENABLE",
      "ATTENTION_DISABLE",
      "ATTENTION_DISMISS",
    ]) {
      expect(isAttentionRequest({ ...envelope, type })).toBe(true);
    }
  });

  it("rejects unknown commands", () => {
    expect(
      isAttentionRequest({
        ...envelope,
        type: "UPLOAD_ALL_URLS",
      }),
    ).toBe(false);
  });

  it("rejects incompatible versions", () => {
    expect(
      isAttentionRequest({
        ...envelope,
        version: 99,
        type: "ATTENTION_STATUS",
      }),
    ).toBe(false);
  });

  it("accepts local-only candidates", () => {
    const response = attentionResult(true, true, {
      category: "social_media",
      durationSeconds: 45,
    });

    expect(isAttentionResponse(response)).toBe(true);
    expect(response.candidate).not.toHaveProperty("url");
    expect(response.candidate).not.toHaveProperty("title");
  });

  it("rejects malformed candidate durations", () => {
    expect(
      isAttentionResponse({
        ...envelope,
        type: "ATTENTION_RESULT",
        enabled: true,
        permissionGranted: true,
        candidate: {
          category: "social_media",
          durationSeconds: -10,
        },
      }),
    ).toBe(false);
  });

  it("supports disabled state without candidate", () => {
    expect(isAttentionResponse(attentionResult(false, false, null))).toBe(true);
  });

  it("allows explicit confirmation", () => {
    expect(
      isAttentionRequest({
        channel: "lumivox.extension",
        version: 1,
        type: "ATTENTION_CONFIRM",
      }),
    ).toBe(true);
  });

  it("accepts a confirmed save response", () => {
    expect(
      isAttentionResponse(attentionResult(true, true, null, undefined, true)),
    ).toBe(true);
  });

  it("does not allow arbitrary saved values", () => {
    expect(
      isAttentionResponse({
        channel: "lumivox.extension",
        version: 1,
        type: "ATTENTION_RESULT",
        enabled: true,
        permissionGranted: true,
        candidate: null,
        saved: "yes",
      }),
    ).toBe(false);
  });
});
