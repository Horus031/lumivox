export const FOCUS_V2_AUDIO_STORAGE_KEY = "lumivox.focus-v2.audio.v1";

export const FOCUS_V2_AUDIO_SOUNDS = [
  "white", "pink", "brown", "rain", "ocean", "ambient_pad",
] as const;

export type FocusV2AudioSound = (typeof FOCUS_V2_AUDIO_SOUNDS)[number];

export type FocusV2AudioSettings = {
  sound: FocusV2AudioSound;
  volume: number;
  muted: boolean;
  cuesEnabled: boolean;
  cueVolume: number;
  playDuringBreak: boolean;
};

export const DEFAULT_FOCUS_V2_AUDIO_SETTINGS: FocusV2AudioSettings = {
  sound: "brown",
  volume: 35,
  muted: false,
  cuesEnabled: true,
  cueVolume: 50,
  playDuringBreak: false,
};

export function clampAudioPercent(input: number): number {
  if (!Number.isFinite(input)) return 0;
  return Math.max(0, Math.min(100, Math.round(input)));
}

export function parseFocusV2AudioSettings(input: unknown): FocusV2AudioSettings {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_FOCUS_V2_AUDIO_SETTINGS };
  }
  const record = input as Record<string, unknown>;
  const defaults = DEFAULT_FOCUS_V2_AUDIO_SETTINGS;
  return {
    sound: typeof record.sound === "string" &&
      FOCUS_V2_AUDIO_SOUNDS.some((sound) => sound === record.sound)
      ? (record.sound as FocusV2AudioSound) : defaults.sound,
    volume: typeof record.volume === "number" ? clampAudioPercent(record.volume) : defaults.volume,
    muted: typeof record.muted === "boolean" ? record.muted : defaults.muted,
    cuesEnabled: typeof record.cuesEnabled === "boolean" ? record.cuesEnabled : defaults.cuesEnabled,
    cueVolume: typeof record.cueVolume === "number" ? clampAudioPercent(record.cueVolume) : defaults.cueVolume,
    playDuringBreak: typeof record.playDuringBreak === "boolean" ? record.playDuringBreak : defaults.playDuringBreak,
  };
}

export function shouldPlayFocusV2Ambient(
  active: boolean,
  phase: string,
  segmentKind: string | null,
  settings: FocusV2AudioSettings,
): boolean {
  if (!active || phase !== "running") return false;
  return segmentKind === "focus" ||
    (settings.playDuringBreak && (segmentKind === "short_break" || segmentKind === "long_break"));
}
