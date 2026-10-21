import {
  classifyPotentialDistraction,
  finishObservation,
  type AttentionObservation,
  type AttentionCandidate,
} from "./attention-rules";
import {
  attentionResult,
  type AttentionRequest,
  type AttentionResponse,
} from "./shared/attention-protocol";
import { handleFocusRequest } from "./focus-service";
import { projectFocus } from "./focus-clock";

const ENABLED_KEY = "lumivox.attention.enabled.v1";
const OBSERVATION_KEY = "lumivox.attention.observation.v1";
const CANDIDATE_KEY = "lumivox.attention.candidate.v1";

type ActiveFocus = {
  sessionId: string;
  segmentId: string;
  totalPausedSeconds: number;
};

function isObservation(value: unknown): value is AttentionObservation {
  if (typeof value !== "object" || value === null) return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.sessionId === "string" &&
    typeof v.segmentId === "string" &&
    typeof v.tabId === "number" &&
    typeof v.startedAtMs === "number" &&
    Number.isFinite(v.startedAtMs) &&
    typeof v.pausedSecondsAtStart === "number" &&
    Number.isFinite(v.pausedSecondsAtStart) &&
    v.pausedSecondsAtStart >= 0 &&
    (v.category === "social_media" || v.category === "messaging")
  );
}

function isCandidate(value: unknown): value is AttentionCandidate {
  if (typeof value !== "object" || value === null) return false;

  const v = value as Record<string, unknown>;

  return (
    (v.category === "social_media" || v.category === "messaging") &&
    typeof v.durationSeconds === "number" &&
    Number.isInteger(v.durationSeconds) &&
    v.durationSeconds >= 30 &&
    v.durationSeconds <= 900
  );
}

async function hasTabsPermission(): Promise<boolean> {
  return chrome.permissions.contains({
    permissions: ["tabs"],
  });
}

async function enabled(): Promise<boolean> {
  const value = await chrome.storage.local.get(ENABLED_KEY);

  return value[ENABLED_KEY] === true && (await hasTabsPermission());
}

async function clearTemporaryState(): Promise<void> {
  await chrome.storage.session.remove([OBSERVATION_KEY, CANDIDATE_KEY]);
}

export async function disableAttention(): Promise<void> {
  await chrome.storage.local.set({
    [ENABLED_KEY]: false,
  });

  await clearTemporaryState();
}

async function activeFocus(): Promise<ActiveFocus | null> {
  const response = await handleFocusRequest({
    channel: "lumivox.extension",
    version: 1,
    type: "FOCUS_GET",
  });

  if (response.state !== "active" || !response.snapshot) return null;

  const snapshot = response.snapshot;

  const serverOffsetMs = Date.parse(snapshot.serverTime) - Date.now();

  const projection = projectFocus(snapshot, Date.now() + serverOffsetMs);

  if (
    projection.phase !== "running" ||
    projection.current?.segment_kind !== "focus" ||
    projection.isDue
  )
    return null;

  return {
    sessionId: snapshot.session.id,
    segmentId: projection.current.id,
    totalPausedSeconds: projection.current.total_paused_seconds,
  };
}

async function currentFocusedTab(): Promise<chrome.tabs.Tab | null> {
  const focusedWindow = await chrome.windows.getLastFocused();

  // An unfocused Chrome window is not evidence of distraction.
  if (!focusedWindow.focused || focusedWindow.id === undefined) return null;

  const tabs = await chrome.tabs.query({
    active: true,
    windowId: focusedWindow.id,
  });

  return tabs[0] ?? null;
}

async function getObservation(): Promise<AttentionObservation | null> {
  const stored = await chrome.storage.session.get(OBSERVATION_KEY);

  const value: unknown = stored[OBSERVATION_KEY];

  return isObservation(value) ? value : null;
}

async function getCandidate(): Promise<AttentionCandidate | null> {
  const stored = await chrome.storage.session.get(CANDIDATE_KEY);

  const value: unknown = stored[CANDIDATE_KEY];

  return isCandidate(value) ? value : null;
}

async function observeCurrentTab(): Promise<void> {
  if (!(await enabled())) {
    await clearTemporaryState();
    return;
  }

  const tab = await currentFocusedTab();

  // Chrome lost focus or selected tab is unknown.
  // Discard, rather than inventing a duration.
  if (!tab || tab.id === undefined || !tab.url) {
    await chrome.storage.session.remove(OBSERVATION_KEY);
    return;
  }

  const category = classifyPotentialDistraction(tab.url);

  const previous = await getObservation();

  if (!previous && !category) return;

  const focus = await activeFocus();

  const continuing =
    previous !== null &&
    focus !== null &&
    previous.sessionId === focus.sessionId &&
    previous.segmentId === focus.segmentId &&
    previous.tabId === tab.id &&
    previous.category === category &&
    previous.pausedSecondsAtStart === focus.totalPausedSeconds;

  if (continuing) return;

  if (previous) {
    const candidate = finishObservation(previous, Date.now(), focus);

    await chrome.storage.session.remove(OBSERVATION_KEY);

    if (candidate && !(await getCandidate())) {
      await chrome.storage.session.set({
        [CANDIDATE_KEY]: candidate,
      });
    }
  }

  if (category && focus) {
    const observation: AttentionObservation = {
      category,
      sessionId: focus.sessionId,
      segmentId: focus.segmentId,
      tabId: tab.id,
      startedAtMs: Date.now(),
      pausedSecondsAtStart: focus.totalPausedSeconds,
    };

    await chrome.storage.session.set({
      [OBSERVATION_KEY]: observation,
    });
  }
}

async function status(): Promise<AttentionResponse> {
  const permission = await hasTabsPermission();
  const isEnabled = await enabled();

  return attentionResult(
    isEnabled,
    permission,
    isEnabled ? await getCandidate() : null,
  );
}

export async function handleAttentionRequest(
  request: AttentionRequest,
): Promise<AttentionResponse> {
  try {
    switch (request.type) {
      case "ATTENTION_STATUS":
        return await status();

      case "ATTENTION_ENABLE":
        if (!(await hasTabsPermission())) {
          return attentionResult(
            false,
            false,
            null,
            "Chrome chưa cấp quyền tabs.",
          );
        }

        await chrome.storage.local.setAccessLevel({
          accessLevel: "TRUSTED_CONTEXTS",
        });

        await chrome.storage.local.set({
          [ENABLED_KEY]: true,
        });

        await clearTemporaryState();
        queueObservation();

        return await status();

      case "ATTENTION_DISABLE":
        await disableAttention();
        return await status();

      case "ATTENTION_DISMISS":
        await chrome.storage.session.remove(CANDIDATE_KEY);
        return await status();
    }
  } catch {
    return attentionResult(
      false,
      false,
      null,
      "Không thể cập nhật trạng thái theo dõi.",
    );
  }
}

// Serialize observations to avoid concurrent event handlers
// overwriting each other's temporary state.
let pending: Promise<void> = Promise.resolve();

export function queueObservation(): void {
  pending = pending
    .catch(() => {})
    .then(observeCurrentTab)
    .catch(() => {
      // Unknown state cannot safely become a distraction.
      return chrome.storage.session.remove(OBSERVATION_KEY);
    });
}

export function registerAttentionListeners(): void {
  chrome.tabs.onActivated.addListener(() => {
    queueObservation();
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (
      tab.active &&
      (changeInfo.url !== undefined || changeInfo.status === "complete")
    ) {
      queueObservation();
    }
  });

  chrome.tabs.onRemoved.addListener(() => {
    queueObservation();
  });

  chrome.windows.onFocusChanged.addListener(() => {
    queueObservation();
  });

  chrome.permissions.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes("tabs")) {
      void disableAttention();
    }
  });
}
