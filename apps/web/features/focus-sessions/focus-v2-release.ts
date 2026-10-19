/**
 * Phase 9 rollout contract.
 *
 * FOCUS_V2_ENABLED protects the V2 runtime (load, transitions, analytics).
 * Never turn it off while any V2 session is active in that environment.
 *
 * FOCUS_V2_CREATION_ENABLED=false stops NEW sessions, while keeping the
 * existing runtime available so users can resume/complete/cancel sessions.
 * Unset creation flag preserves behaviour of Phases 3–8.
 */
export type FocusV2ReleaseMode = "off" | "drain" | "on";

export type FocusV2ReleaseEnvironment = {
  FOCUS_V2_ENABLED?: string;
  FOCUS_V2_CREATION_ENABLED?: string;
};

function getFocusV2ReleaseEnvironment(): FocusV2ReleaseEnvironment {
  return {
    FOCUS_V2_ENABLED: process.env.FOCUS_V2_ENABLED,
    FOCUS_V2_CREATION_ENABLED: process.env.FOCUS_V2_CREATION_ENABLED,
  };
}

export function getFocusV2ReleaseMode(
  env: FocusV2ReleaseEnvironment = getFocusV2ReleaseEnvironment(),
): FocusV2ReleaseMode {
  if (env.FOCUS_V2_ENABLED !== "true") return "off";
  if (env.FOCUS_V2_CREATION_ENABLED === "false") return "drain";
  return "on";
}

export function isFocusV2RuntimeEnabled(
  env: FocusV2ReleaseEnvironment = getFocusV2ReleaseEnvironment(),
): boolean {
  return getFocusV2ReleaseMode(env) !== "off";
}

export function isFocusV2CreationEnabled(
  env: FocusV2ReleaseEnvironment = getFocusV2ReleaseEnvironment(),
): boolean {
  return getFocusV2ReleaseMode(env) === "on";
}
