export const PROTOCOL_CHANNEL = "lumivox.extension" as const;
export const PROTOCOL_VERSION = 1 as const;

type Envelope = {
  channel: typeof PROTOCOL_CHANNEL;
  version: typeof PROTOCOL_VERSION;
};

export type CheckSiteRequest = Envelope & {
  type: "CHECK_SITE";
};

export type SiteHelloRequest = Envelope & {
  type: "SITE_HELLO";
};

export type SiteReadyResponse = Envelope & {
  type: "SITE_READY";
  origin: string;
};

export type SiteConnectionState =
  | "ready"
  | "not_lumivox"
  | "unavailable"
  | "no_active_tab";

export type CheckSiteResponse = Envelope & {
  type: "CHECK_SITE_RESULT";
  state: SiteConnectionState;
  origin?: string;
};

function isRecord(
  input: unknown,
): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input)
  );
}

function hasEnvelope(
  input: unknown,
  type: string,
): input is Record<string, unknown> {
  return (
    isRecord(input) &&
    input.channel === PROTOCOL_CHANNEL &&
    input.version === PROTOCOL_VERSION &&
    input.type === type
  );
}

export function isCheckSiteRequest(
  input: unknown,
): input is CheckSiteRequest {
  return hasEnvelope(input, "CHECK_SITE");
}

export function isSiteHelloRequest(
  input: unknown,
): input is SiteHelloRequest {
  return hasEnvelope(input, "SITE_HELLO");
}

export function isSiteReadyResponse(
  input: unknown,
): input is SiteReadyResponse {
  return (
    hasEnvelope(input, "SITE_READY") &&
    typeof input.origin === "string"
  );
}

export function isCheckSiteResponse(
  input: unknown,
): input is CheckSiteResponse {
  if (!hasEnvelope(input, "CHECK_SITE_RESULT")) {
    return false;
  }

  const validStates: SiteConnectionState[] = [
    "ready",
    "not_lumivox",
    "unavailable",
    "no_active_tab",
  ];

  return (
    validStates.includes(
      input.state as SiteConnectionState,
    ) &&
    (
      input.origin === undefined ||
      typeof input.origin === "string"
    )
  );
}

export function getApprovedSiteOrigin(
  url: string,
  approvedOrigins: readonly string[],
): string | null {
  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return null;
    }

    return approvedOrigins.includes(parsed.origin)
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}