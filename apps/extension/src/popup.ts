import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
  isCheckSiteResponse,
  type CheckSiteResponse,
} from "./shared/protocol";

const LUMIVOX_FOCUS_URL = "https://www.lumivox.it.com/en/focus";

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing popup element: ${id}`);
  }

  return element;
}

document.addEventListener("DOMContentLoaded", () => {
  const status = requiredElement("site-status");
  const detail = requiredElement("site-detail");
  const refreshButton = requiredElement("refresh");
  const openButton = requiredElement("open-site");

  function render(response: CheckSiteResponse): void {
    switch (response.state) {
      case "ready":
        status.textContent = "Website bridge đã sẵn sàng";
        detail.textContent = `Đã xác minh origin: ${response.origin}`;
        return;

      case "not_lumivox":
        status.textContent = "Chưa mở trang Lumivox";
        detail.textContent = "Mở Lumivox rồi kiểm tra lại.";
        return;

      case "no_active_tab":
        status.textContent = "Không tìm thấy tab";
        detail.textContent = "Hãy mở một tab trình duyệt.";
        return;

      case "unavailable":
        status.textContent = "Chưa thể kết nối";
        detail.textContent = "Thử tải lại trang Lumivox và kiểm tra lại.";
        return;
    }
  }

  async function refresh(): Promise<void> {
    status.textContent = "Đang kiểm tra...";
    detail.textContent = "";

    try {
      const response: unknown = await chrome.runtime.sendMessage({
        channel: PROTOCOL_CHANNEL,
        version: PROTOCOL_VERSION,
        type: "CHECK_SITE",
      });

      if (!isCheckSiteResponse(response)) {
        throw new Error("Invalid response");
      }

      render(response);
    } catch {
      status.textContent = "Lỗi kết nối Extension";
      detail.textContent =
        "Hãy kiểm tra Service Worker trong chrome://extensions.";
    }
  }

  refreshButton.addEventListener("click", () => {
    void refresh();
  });

  openButton.addEventListener("click", () => {
    void chrome.tabs.create({
      url: LUMIVOX_FOCUS_URL,
    });
  });

  void refresh();
});
