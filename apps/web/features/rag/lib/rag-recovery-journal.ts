import { z } from "zod";

const recoveryReferenceSchema = z.object({
  version: z.literal(1),

  protocol: z.literal("rag-v2"),

  operation: z.enum([
    "ask",
    "new_chat",
  ]),

  clientRequestId: z.uuid(),

  focusSessionId: z.uuid(),

  sessionId: z.uuid().nullable(),

  createdAt: z.number().int().nonnegative(),
});

export type RagRecoveryReference = z.infer<
  typeof recoveryReferenceSchema
>;

const MAX_REFERENCE_AGE_MS =
  24 * 60 * 60 * 1000;

function storageKey(
  accountScope: string,
  focusSessionId: string,
): string {
  return [
    "lumivox",
    "rag-recovery",
    "v1",
    accountScope,
    focusSessionId,
  ].join(":");
}

export function writeRecoveryReference(
  accountScope: string,
  reference: RagRecoveryReference,
): boolean {
  try {
    const parsed =
      recoveryReferenceSchema.parse(reference);

    sessionStorage.setItem(
      storageKey(
        accountScope,
        parsed.focusSessionId,
      ),
      JSON.stringify(parsed),
    );

    return true;
  } catch {
    return false;
  }
}

export function readRecoveryReference(
  accountScope: string,
  focusSessionId: string,
): RagRecoveryReference | null {
  try {
    const key = storageKey(
      accountScope,
      focusSessionId,
    );

    const raw = sessionStorage.getItem(key);

    if (!raw) return null;

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      sessionStorage.removeItem(key);
      return null;
    }
    const result = recoveryReferenceSchema.safeParse(decoded);

    if (!result.success) {
      sessionStorage.removeItem(key);
      return null;
    }

    const reference = result.data;

    const age =
      Date.now() - reference.createdAt;

    if (
      reference.focusSessionId !== focusSessionId
      || age < 0
      || age > MAX_REFERENCE_AGE_MS
    ) {
      sessionStorage.removeItem(key);
      return null;
    }

    return reference;
  } catch {
    return null;
  }
}

export function clearRecoveryReference(
  accountScope: string,
  focusSessionId: string,
  expectedRequestId: string,
): void {
  try {
    const current = readRecoveryReference(
      accountScope,
      focusSessionId,
    );

    if (
      current?.clientRequestId
      !== expectedRequestId
    ) {
      return;
    }

    sessionStorage.removeItem(
      storageKey(
        accountScope,
        focusSessionId,
      ),
    );
  } catch {
    // Storage may be unavailable.
  }
}
