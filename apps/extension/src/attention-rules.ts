export type AttentionCategory = "social_media" | "messaging";

export type AttentionObservation = {
  category: AttentionCategory;
  sessionId: string;
  segmentId: string;
  tabId: number;
  startedAtMs: number;
  pausedSecondsAtStart: number;
};

export type AttentionCandidate = {
  category: AttentionCategory;
  durationSeconds: number;
};

export const MIN_ATTENTION_SECONDS = 30;
export const MAX_OBSERVATION_SECONDS = 15 * 60;

const siteGroups: Record<AttentionCategory, readonly string[]> = {
  social_media: [
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "reddit.com",
    "x.com",
    "twitter.com",
  ],
  messaging: ["messenger.com", "web.whatsapp.com", "discord.com"],
};

function matchesDomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function classifyPotentialDistraction(
  url: string,
): AttentionCategory | null {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const category of ["social_media", "messaging"] as const) {
    if (
      siteGroups[category].some((domain) => matchesDomain(hostname, domain))
    ) {
      return category;
    }
  }

  return null;
}

export function finishObservation(
  previous: AttentionObservation,
  atMs: number,
  currentFocus: {
    sessionId: string;
    segmentId: string;
    totalPausedSeconds: number;
  } | null,
): AttentionCandidate | null {
  if (
    !currentFocus ||
    currentFocus.sessionId !== previous.sessionId ||
    currentFocus.segmentId !== previous.segmentId ||
    currentFocus.totalPausedSeconds !== previous.pausedSecondsAtStart
  ) {
    return null;
  }

  const seconds = Math.floor((atMs - previous.startedAtMs) / 1000);

  if (seconds < MIN_ATTENTION_SECONDS || seconds > MAX_OBSERVATION_SECONDS) {
    return null;
  }

  return {
    category: previous.category,
    durationSeconds: seconds,
  };
}
