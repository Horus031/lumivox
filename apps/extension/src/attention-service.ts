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
import { getExtensionAuthClient } from "./auth-client";

const ENABLED_KEY = "lumivox.attention.enabled.v1";
const OBSERVATION_KEY = "lumivox.attention.observation.v1";
const CANDIDATE_KEY = "lumivox.attention.candidate.v1";
declare const __LUMIVOX_API_ORIGIN__: string;

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

async function getCandidate(): Promise<StoredAttentionCandidate | null> {
  const stored = await chrome.storage.session.get(CANDIDATE_KEY);

  const value: unknown = stored[CANDIDATE_KEY];

  if (!isStoredCandidate(value)) {
    return null;
  }

  const age = Date.now() - value.createdAtMs;

  if (age < 0 || age > CANDIDATE_TTL_MS) {
    await chrome.storage.session.remove(CANDIDATE_KEY);
    return null;
  }

  return value;
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
      const client = await getExtensionAuthClient();
      const { data, error } = await client.auth.getSession();

      if (!error && data.session) {
        const storedCandidate: StoredAttentionCandidate = {
          ...candidate,
          eventId: crypto.randomUUID(),
          ownerId: data.session.user.id,
          sessionId: previous.sessionId,
          segmentId: previous.segmentId,
          createdAtMs: Date.now(),
        };

        await chrome.storage.session.set({
          [CANDIDATE_KEY]: storedCandidate,
        });
      }
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

  const candidate = isEnabled ? await getCandidate() : null;

  if (candidate) {
    const client = await getExtensionAuthClient();
    const { data, error } = await client.auth.getSession();

    if (error || !data.session || data.session.user.id !== candidate.ownerId) {
      await clearTemporaryState();

      return attentionResult(isEnabled, permission, null);
    }
  }

  return attentionResult(
    isEnabled,
    permission,
    candidate
      ? {
          category: candidate.category,
          durationSeconds: candidate.durationSeconds,
        }
      : null,
  );
}

let pendingConfirmation: Promise<AttentionResponse> | null = null;

async function confirmCandidate(): Promise<AttentionResponse> {
  if (!(await enabled())) {
    return attentionResult(
      false,
      await hasTabsPermission(),
      null,
      "Attention Monitoring đang tắt.",
    );
  }

  const candidate = await getCandidate();

  if (!candidate) {
    return attentionResult(
      true,
      await hasTabsPermission(),
      null,
      "Không có gợi ý hợp lệ để xác nhận.",
    );
  }

  const client = await getExtensionAuthClient();
  const { data, error } = await client.auth.getSession();

  if (error || !data.session || data.session.user.id !== candidate.ownerId) {
    await clearTemporaryState();
    return attentionResult(
      await enabled(),
      await hasTabsPermission(),
      null,
      "Tài khoản đã thay đổi hoặc phiên đăng nhập không hợp lệ.",
    );
  }

  try {
    const response = await fetch(
      `${__LUMIVOX_API_ORIGIN__}/api/extension/distractions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          eventId: candidate.eventId,
          sessionId: candidate.sessionId,
          segmentId: candidate.segmentId,
          distractionType: candidate.category,
          durationSeconds: candidate.durationSeconds,
        }),
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 401) {
      await clearTemporaryState();
      return attentionResult(
        await enabled(),
        await hasTabsPermission(),
        null,
        "Bạn cần đăng nhập lại.",
      );
    }

    if (response.status === 409) {
      // The focus segment may have changed before confirmation.
      await chrome.storage.session.remove(CANDIDATE_KEY);
      return attentionResult(
        await enabled(),
        await hasTabsPermission(),
        null,
        "Phiên học đã thay đổi. Gợi ý không còn hợp lệ.",
      );
    }

    if (!response.ok) {
      // Unknown outcome: retain the SAME event ID.
      return attentionResult(
        await enabled(),
        await hasTabsPermission(),
        {
          category: candidate.category,
          durationSeconds: candidate.durationSeconds,
        },
        "Chưa xác nhận được việc lưu. Bạn có thể thử lại.",
      );
    }

    const payload: unknown = await response.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      !("saved" in payload) ||
      payload.saved !== true
    ) {
      return attentionResult(
        await enabled(),
        await hasTabsPermission(),
        {
          category: candidate.category,
          durationSeconds: candidate.durationSeconds,
        },
        "Server chưa xác nhận sự kiện đã lưu.",
      );
    }

    // Avoid deleting a newer candidate created during the request.
    const latest = await getCandidate();

    if (latest?.eventId === candidate.eventId) {
      await chrome.storage.session.remove(CANDIDATE_KEY);
    }

    return attentionResult(
      await enabled(),
      await hasTabsPermission(),
      null,
      undefined,
      true,
    );
  } catch {
    // Timeout is NOT proof of failure; keep candidate for retry.
    return attentionResult(
      await enabled(),
      await hasTabsPermission(),
      {
        category: candidate.category,
        durationSeconds: candidate.durationSeconds,
      },
      "Mất kết nối. Gợi ý được giữ lại để thử lại.",
    );
  }
}

function confirmOnce(): Promise<AttentionResponse> {
  if (!pendingConfirmation) {
    pendingConfirmation = confirmCandidate().finally(() => {
      pendingConfirmation = null;
    });
  }

  return pendingConfirmation;
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

      case "ATTENTION_CONFIRM":
        return await confirmOnce();
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

type StoredAttentionCandidate = AttentionCandidate & {
  eventId: string;
  ownerId: string;
  sessionId: string;
  segmentId: string;
  createdAtMs: number;
};

const CANDIDATE_TTL_MS = 10 * 60 * 1000;

function isStoredCandidate(value: unknown): value is StoredAttentionCandidate {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;

  const v = value as Record<string, unknown>;

  return (
    isCandidate(value) &&
    typeof v.eventId === "string" &&
    /^[0-9a-f-]{36}$/i.test(v.eventId) &&
    typeof v.ownerId === "string" &&
    typeof v.sessionId === "string" &&
    typeof v.segmentId === "string" &&
    typeof v.createdAtMs === "number" &&
    Number.isFinite(v.createdAtMs)
  );
}
