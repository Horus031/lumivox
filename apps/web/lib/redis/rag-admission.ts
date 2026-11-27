import "server-only";

import { createHash } from "node:crypto";
import { getRedisClient } from "./redis";
import { checkRateLimit, formatRateLimitMessage } from "./rate-limit";

export const ADMISSION_SCRIPT = `
local request_key = KEYS[1]
local quota_key = KEYS[2]

local fingerprint = ARGV[1]
local request_id = ARGV[2]
local limit = tonumber(ARGV[3])
local window_ms = tonumber(ARGV[4])
local retention_ms = tonumber(ARGV[5])

local existing = redis.call("GET", request_key)

if existing then
  if existing ~= fingerprint then
    return {"conflict", "0", "0"}
  end

  return {"replay", "0", "0"}
end

local now = redis.call("TIME")

local now_ms =
  tonumber(now[1]) * 1000
  + math.floor(tonumber(now[2]) / 1000)

redis.call(
  "ZREMRANGEBYSCORE",
  quota_key,
  "-inf",
  now_ms - window_ms
)

local count = redis.call("ZCARD", quota_key)

if count >= limit then
  local oldest = redis.call(
    "ZRANGE",
    quota_key,
    0,
    0,
    "WITHSCORES"
  )

  local reset = now_ms + window_ms

  if #oldest >= 2 then
    reset = tonumber(oldest[2]) + window_ms
  end

  return {"limited", "0", tostring(reset)}
end

redis.call(
  "ZADD",
  quota_key,
  now_ms,
  request_id
)

redis.call(
  "PEXPIRE",
  quota_key,
  window_ms
)

redis.call(
  "SET",
  request_key,
  fingerprint,
  "PX",
  retention_ms
)

return {
  "admitted",
  tostring(limit - count - 1),
  tostring(now_ms + window_ms)
}
`;

type Operation = "ask" | "new_chat";
type AdmissionResult = { status: "admitted" | "replay" | "conflict" | "limited" | "unavailable"; reset?: number };

function resourceNamespace() {
  const namespace = process.env.RAG_RESOURCE_NAMESPACE?.trim();
  if (namespace && /^[a-zA-Z0-9_-]+$/.test(namespace)
    && !(process.env.VERCEL_ENV === "production" && namespace.toLowerCase() === "local")) return namespace;
}

export function createRagRequestFingerprint(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function canonicalRagDocumentIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.toLowerCase()))].sort();
}

export async function admitRagOperation({
  userId, clientRequestId, operation, fingerprint,
}: {
  userId: string; clientRequestId: string; operation: Operation; fingerprint: string;
}): Promise<AdmissionResult> {
  try {
    const redis = getRedisClient();
    const namespace = resourceNamespace();
    if (!redis || !namespace) return { status: "unavailable" };
    const prefix = `lumivox:rag:admission:{${namespace}:${userId}:${operation}}`;
    const result = await redis.eval<unknown[]>(ADMISSION_SCRIPT, [
      `${prefix}:request:${clientRequestId}`, `${prefix}:quota`,
    ], [fingerprint, clientRequestId, operation === "ask" ? 10 : 5, 600_000, 86_400_000]);
    if (!Array.isArray(result) || result.length !== 3) return { status: "unavailable" };
    const [status, , rawReset] = result;
    if (status === "admitted" || status === "replay" || status === "conflict") return { status };
    const reset = Number(rawReset);
    return status === "limited" && Number.isSafeInteger(reset) && reset > 0
      ? { status, reset } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export async function checkRagAdmission(
  userId: string, operation: Operation, clientRequestId: string, canonicalPayload: unknown,
) {
  const unavailable = {
    success: false as const, code: "RAG_RESOURCE_CONTROL_UNAVAILABLE",
    message: "RAG resource control is temporarily unavailable.", retrySameRequest: true,
  };
  const namespace = resourceNamespace();
  if (!namespace) return unavailable;
  const transport = await checkRateLimit({
    key: `rag-transport:${namespace}:${operation}:${userId}`, limit: operation === "ask" ? 60 : 30,
    window: "1 m", mode: "fail-closed",
  });
  if (!transport.success) {
    return transport.message ? unavailable : {
      success: false as const, code: "RAG_RATE_LIMITED",
      message: formatRateLimitMessage(transport.reset), retrySameRequest: true,
    };
  }
  const admission = await admitRagOperation({
    userId, operation, clientRequestId, fingerprint: createRagRequestFingerprint(canonicalPayload),
  });
  if (admission.status === "admitted" || admission.status === "replay") return null;
  if (admission.status === "conflict") return {
    success: false as const, code: "RAG_IDEMPOTENCY_CONFLICT",
    message: "The request ID already has a different payload.", retrySameRequest: false,
  };
  if (admission.status === "limited" && admission.reset !== undefined) return {
    success: false as const, code: "RAG_RATE_LIMITED",
    message: formatRateLimitMessage(admission.reset), retrySameRequest: true,
  };
  return unavailable;
}
