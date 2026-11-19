import { createHash } from "node:crypto";

export function hashUnsubscribeToken(token: unknown): string | null {
  // Require a canonical base64url encoding of 32 random bytes.
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 32 || bytes.toString("base64url") !== token) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}
