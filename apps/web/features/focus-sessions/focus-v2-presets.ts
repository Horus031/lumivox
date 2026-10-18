import type { FocusV2Preferences } from "./focus-v2-preferences";

export const FOCUS_V2_PRESETS = {
  classic: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    roundCount: 4,
    longBreakEvery: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
  },
  balanced: {
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 20,
    roundCount: 4,
    longBreakEvery: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
  },
  deepWork: {
    focusMinutes: 90,
    shortBreakMinutes: 15,
    longBreakMinutes: 30,
    roundCount: 2,
    longBreakEvery: 2,
    autoStartBreaks: false,
    autoStartFocus: false,
  },
} as const satisfies Record<string, FocusV2Preferences>;

export type FocusV2PresetName = keyof typeof FOCUS_V2_PRESETS;

export const FOCUS_V2_PRESET_ORDER: FocusV2PresetName[] = [
  "classic", "balanced", "deepWork",
];
