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

import {
  authResult,
  isAuthRequest,
} from "./shared/auth-protocol";

import { handleAuthRequest } from "./auth-service";

declare const __LUMIVOX_ALLOWED_ORIGINS__:
  readonly string[];

function siteResult(
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

async function checkActiveWebsite():
  Promise<CheckSiteResponse> {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  const tab = tabs[0];

  if (!tab || tab.id === undefined) {
    return siteResult("no_active_tab");
  }

  const origin = tab.url
    ? getApprovedSiteOrigin(
        tab.url,
        __LUMIVOX_ALLOWED_ORIGINS__,
      )
    : null;

  if (!origin) {
    return siteResult("not_lumivox");
  }

  const request: SiteHelloRequest = {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type: "SITE_HELLO",
  };

  try {
    const response: unknown =
      await chrome.tabs.sendMessage(tab.id, request);

    if (
      !isSiteReadyResponse(response) ||
      response.origin !== origin
    ) {
      return siteResult("unavailable");
    }

    return siteResult("ready", origin);
  } catch {
    return siteResult("unavailable");
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    const isPopup =
      sender.id === chrome.runtime.id &&
      sender.url ===
        chrome.runtime.getURL("popup.html");

    if (!isPopup) {
      return false;
    }

    if (isCheckSiteRequest(message)) {
      void checkActiveWebsite()
        .then(sendResponse)
        .catch(() => {
          sendResponse(siteResult("unavailable"));
        });

      return true;
    }

    if (isAuthRequest(message)) {
      void handleAuthRequest(message)
        .then(sendResponse)
        .catch(() => {
          sendResponse(
            authResult(
              "unavailable",
              undefined,
              "Lỗi xác thực.",
            ),
          );
        });

      return true;
    }

    return false;
  },
);