import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
  getApprovedSiteOrigin,
  isCheckSiteRequest,
  isSiteReadyResponse,
  type CheckSiteResponse,
  type SiteHelloRequest,
  type SiteConnectionState,
} from "./shared/protocol";

declare const __LUMIVOX_ALLOWED_ORIGINS__: readonly string[];

function result(
  state: SiteConnectionState,
  origin?: string,
): CheckSiteResponse {
  return {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "CHECK_SITE_RESULT",
    state,
    ...(origin ? { origin } : {}),
  };
}

async function checkActiveWebsite(): Promise<CheckSiteResponse> {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tab = tabs[0];

  if (!tab || tab.id === undefined) {
    return result("no_active_tab");
  }

  const origin = tab.url
    ? getApprovedSiteOrigin(tab.url, __LUMIVOX_ALLOWED_ORIGINS__)
    : null;

  if (!origin) {
    return result("not_lumivox");
  }

  const request: SiteHelloRequest = {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "SITE_HELLO",
  };

  try {
    const response: unknown = await chrome.tabs.sendMessage(tab.id, request);

    if (!isSiteReadyResponse(response) || response.origin !== origin) {
      return result("unavailable");
    }

    return result("ready", origin);
  } catch {
    return result("unavailable");
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (
      sender.id !== chrome.runtime.id ||
      sender.url !== chrome.runtime.getURL("popup.html") ||
      !isCheckSiteRequest(message)
    ) {
      return false;
    }

    void checkActiveWebsite()
      .then(sendResponse)
      .catch(() => {
        sendResponse(result("unavailable"));
      });

    return true;
  },
);
