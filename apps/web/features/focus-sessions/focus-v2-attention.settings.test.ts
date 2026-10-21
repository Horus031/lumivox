import { describe, expect, it } from "vitest";
import { DEFAULT_FOCUS_V2_ATTENTION_SETTINGS as defaults, parseFocusV2AttentionSettings } from "./focus-v2-attention.settings";

describe("Focus V2 attention consent settings", () => {
  it("defaults to no monitoring and no notifications", () => {
    expect(parseFocusV2AttentionSettings(null)).toEqual(defaults);
  });
  it("rejects unsupported values and clamps by falling back", () => {
    expect(parseFocusV2AttentionSettings({ notificationsEnabled: "true", pageAwayPromptEnabled: 1, minimumAwaySeconds: 9999 })).toEqual(defaults);
  });
  it("accepts explicit choices only", () => {
    expect(parseFocusV2AttentionSettings({ notificationsEnabled: true, pageAwayPromptEnabled: true, minimumAwaySeconds: 90 })).toEqual({
      notificationsEnabled: true, pageAwayPromptEnabled: true, minimumAwaySeconds: 90,
    });
  });
});
