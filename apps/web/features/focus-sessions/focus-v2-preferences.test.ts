import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCUS_V2_PREFERENCES,
  focusV2PreferencesSchema,
  isMatchingFocusV2Preferences,
} from "./focus-v2-preferences";
import { FOCUS_V2_PRESETS } from "./focus-v2-presets";
import { buildFocusV2Schedule } from "./focus-v2-config.schemas";

describe("Focus V2 presets and reusable preferences", () => {
  it("keeps the default aligned with the Classic preset", () => {
    expect(DEFAULT_FOCUS_V2_PREFERENCES).toEqual(FOCUS_V2_PRESETS.classic);
  });

  it("supports all three full configurations without storing taskId", () => {
    for (const preset of Object.values(FOCUS_V2_PRESETS)) {
      expect(focusV2PreferencesSchema.safeParse(preset).success).toBe(true);
      const schedule = buildFocusV2Schedule({ taskId: "", ...preset });
      expect(schedule.segments).toHaveLength(preset.roundCount * 2 - 1);
      expect(schedule.plannedFocusMinutes).toBe(preset.focusMinutes * preset.roundCount);
    }
  });

  it("rejects unexpected task identity in saved preferences", () => {
    expect(focusV2PreferencesSchema.safeParse({
      ...DEFAULT_FOCUS_V2_PREFERENCES,
      taskId: "11111111-1111-4111-8111-111111111111",
    }).success).toBe(false);
  });

  it("detects matching and modified configurations", () => {
    expect(isMatchingFocusV2Preferences(
      DEFAULT_FOCUS_V2_PREFERENCES, FOCUS_V2_PRESETS.classic,
    )).toBe(true);
    expect(isMatchingFocusV2Preferences(
      DEFAULT_FOCUS_V2_PREFERENCES, FOCUS_V2_PRESETS.deepWork,
    )).toBe(false);
  });

  it("creates the correct deep work schedule", () => {
    const schedule = buildFocusV2Schedule({ taskId: "", ...FOCUS_V2_PRESETS.deepWork });
    expect(schedule.plannedFocusMinutes).toBe(180);
    expect(schedule.plannedBreakMinutes).toBe(15);
    expect(schedule.plannedTotalMinutes).toBe(195);
  });
});
