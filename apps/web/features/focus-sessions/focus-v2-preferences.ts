import { z } from "zod";

import {
  DEFAULT_FOCUS_V2_CONFIG,
  focusV2ConfigSchema,
} from "./focus-v2-config.schemas";

// A saved preference is reusable across tasks and never stores task identity.
export const focusV2PreferencesSchema = focusV2ConfigSchema.omit({
  taskId: true,
});

export type FocusV2Preferences = z.infer<typeof focusV2PreferencesSchema>;

const defaultPreferences = {
  focusMinutes: DEFAULT_FOCUS_V2_CONFIG.focusMinutes,
  shortBreakMinutes: DEFAULT_FOCUS_V2_CONFIG.shortBreakMinutes,
  longBreakMinutes: DEFAULT_FOCUS_V2_CONFIG.longBreakMinutes,
  roundCount: DEFAULT_FOCUS_V2_CONFIG.roundCount,
  longBreakEvery: DEFAULT_FOCUS_V2_CONFIG.longBreakEvery,
  autoStartBreaks: DEFAULT_FOCUS_V2_CONFIG.autoStartBreaks,
  autoStartFocus: DEFAULT_FOCUS_V2_CONFIG.autoStartFocus,
};

export const DEFAULT_FOCUS_V2_PREFERENCES: FocusV2Preferences =
  focusV2PreferencesSchema.parse(defaultPreferences);

export function isMatchingFocusV2Preferences(
  first: FocusV2Preferences,
  second: FocusV2Preferences,
): boolean {
  return (
    first.focusMinutes === second.focusMinutes &&
    first.shortBreakMinutes === second.shortBreakMinutes &&
    first.longBreakMinutes === second.longBreakMinutes &&
    first.roundCount === second.roundCount &&
    first.longBreakEvery === second.longBreakEvery &&
    first.autoStartBreaks === second.autoStartBreaks &&
    first.autoStartFocus === second.autoStartFocus
  );
}
