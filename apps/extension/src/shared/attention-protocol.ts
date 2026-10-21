import { PROTOCOL_CHANNEL, PROTOCOL_VERSION } from "./protocol";
import type { AttentionCandidate } from "../attention-rules";

export type AttentionRequest = {
  channel: typeof PROTOCOL_CHANNEL;
  version: typeof PROTOCOL_VERSION;
  type:
    | "ATTENTION_STATUS"
    | "ATTENTION_ENABLE"
    | "ATTENTION_DISABLE"
    | "ATTENTION_DISMISS";
};

export type AttentionResponse = {
  channel: typeof PROTOCOL_CHANNEL;
  version: typeof PROTOCOL_VERSION;
  type: "ATTENTION_RESULT";
  enabled: boolean;
  permissionGranted: boolean;
  candidate: AttentionCandidate | null;
  error?: string;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function isAttentionRequest(input: unknown): input is AttentionRequest {
  if (!isRecord(input)) return false;

  return (
    input.channel === PROTOCOL_CHANNEL &&
    input.version === PROTOCOL_VERSION &&
    [
      "ATTENTION_STATUS",
      "ATTENTION_ENABLE",
      "ATTENTION_DISABLE",
      "ATTENTION_DISMISS",
    ].includes(String(input.type))
  );
}

export function isAttentionResponse(
  input: unknown,
): input is AttentionResponse {
  if (
    !isRecord(input) ||
    input.channel !== PROTOCOL_CHANNEL ||
    input.version !== PROTOCOL_VERSION ||
    input.type !== "ATTENTION_RESULT" ||
    typeof input.enabled !== "boolean" ||
    typeof input.permissionGranted !== "boolean"
  ) {
    return false;
  }

  if (input.error !== undefined && typeof input.error !== "string")
    return false;

  if (input.candidate === null) return true;
  if (!isRecord(input.candidate)) return false;

  const candidate = input.candidate;

  return (
    ["social_media", "messaging"].includes(String(candidate.category)) &&
    Number.isInteger(candidate.durationSeconds) &&
    (candidate.durationSeconds as number) >= 0 &&
    (candidate.durationSeconds as number) <= 900
  );
}

export function attentionResult(
  enabled: boolean,
  permissionGranted: boolean,
  candidate: AttentionCandidate | null,
  error?: string,
): AttentionResponse {
  return {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "ATTENTION_RESULT",
    enabled,
    permissionGranted,
    candidate,
    ...(error ? { error } : {}),
  };
}
