import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
  getApprovedSiteOrigin,
  isSiteHelloRequest,
  type SiteReadyResponse,
} from "./shared/protocol";

declare const __LUMIVOX_ALLOWED_ORIGINS__: readonly string[];

const currentOrigin = getApprovedSiteOrigin(
  window.location.href,
  __LUMIVOX_ALLOWED_ORIGINS__,
);

if (currentOrigin) {
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (sender.id !== chrome.runtime.id || !isSiteHelloRequest(message)) {
        return false;
      }

      const response: SiteReadyResponse = {
        channel: PROTOCOL_CHANNEL,
        version: PROTOCOL_VERSION,
        type: "SITE_READY",
        origin: currentOrigin,
      };

      sendResponse(response);
      return false;
    },
  );
}
