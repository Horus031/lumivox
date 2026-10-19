export const FOCUS_V2_ATTENTION_STORAGE_KEY = "lumivox.focus-v2.attention.v1";

export type FocusV2AttentionSettings = {
  notificationsEnabled: boolean;
  pageAwayPromptEnabled: boolean;
  minimumAwaySeconds: number;
};

export const DEFAULT_FOCUS_V2_ATTENTION_SETTINGS: FocusV2AttentionSettings = {
  notificationsEnabled: false,
  pageAwayPromptEnabled: false,
  minimumAwaySeconds: 30,
};

export function parseFocusV2AttentionSettings(value: unknown): FocusV2AttentionSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_FOCUS_V2_ATTENTION_SETTINGS };
  }
  const source = value as Record<string, unknown>;
  return {
    notificationsEnabled: source.notificationsEnabled === true,
    pageAwayPromptEnabled: source.pageAwayPromptEnabled === true,
    minimumAwaySeconds:
      typeof source.minimumAwaySeconds === "number" &&
      Number.isInteger(source.minimumAwaySeconds) &&
      source.minimumAwaySeconds >= 15 && source.minimumAwaySeconds <= 600
        ? source.minimumAwaySeconds : DEFAULT_FOCUS_V2_ATTENTION_SETTINGS.minimumAwaySeconds,
  };
}
