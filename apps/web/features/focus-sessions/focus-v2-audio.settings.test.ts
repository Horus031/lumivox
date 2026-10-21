import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCUS_V2_AUDIO_SETTINGS as defaults,
  clampAudioPercent,
  parseFocusV2AudioSettings,
  shouldPlayFocusV2Ambient,
} from "./focus-v2-audio.settings";

describe("Focus V2 audio settings", () => {
  it("loads defaults when storage is empty or corrupt", () => {
    expect(parseFocusV2AudioSettings(null)).toEqual(defaults);
    expect(parseFocusV2AudioSettings("invalid")).toEqual(defaults);
  });
  it("validates selected sounds, booleans and volume without losing valid fields", () => {
    const result = parseFocusV2AudioSettings({ sound: "unknown", volume: 250,
      muted: true, cuesEnabled: false, cueVolume: -20, playDuringBreak: "yes" });
    expect(result).toEqual({ ...defaults, volume: 100, cueVolume: 0,
      muted: true, cuesEnabled: false });
    expect(parseFocusV2AudioSettings({ sound: "ambient_pad" }).sound).toBe("ambient_pad");
    expect(clampAudioPercent(Number.NaN)).toBe(0);
  });
  it("plays only during permitted active focus or breaks", () => {
    expect(shouldPlayFocusV2Ambient(true, "running", "focus", defaults)).toBe(true);
    expect(shouldPlayFocusV2Ambient(true, "running", "short_break", defaults)).toBe(false);
    expect(shouldPlayFocusV2Ambient(true, "running", "long_break", { ...defaults, playDuringBreak: true })).toBe(true);
    for (const phase of ["paused", "awaiting_next", "completed", "cancelled", "invalid"]) {
      expect(shouldPlayFocusV2Ambient(true, phase, "focus", defaults)).toBe(false);
    }
    expect(shouldPlayFocusV2Ambient(false, "running", "focus", defaults)).toBe(false);
  });
});
