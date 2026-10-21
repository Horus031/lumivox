import { PROTOCOL_CHANNEL, PROTOCOL_VERSION } from "./shared/protocol";

import {
  isAttentionResponse,
  type AttentionRequest,
  type AttentionResponse,
} from "./shared/attention-protocol";

declare const __LUMIVOX_API_ORIGIN__: string;

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing attention UI: ${id}`);
  return el as T;
}

async function send(
  type: AttentionRequest["type"],
): Promise<AttentionResponse> {
  const response: unknown = await chrome.runtime.sendMessage({
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    type,
  });

  if (!isAttentionResponse(response)) {
    throw new Error("Invalid Attention response");
  }

  return response;
}

export function initializeAttentionPopup(): void {
  const status = required("attention-status");
  const error = required("attention-error");
  const candidatePanel = required("attention-candidate");
  const candidateText = required("attention-candidate-text");

  const enableButton = required<HTMLButtonElement>("attention-enable");
  const disableButton = required<HTMLButtonElement>("attention-disable");
  const refreshButton = required<HTMLButtonElement>("attention-refresh");
  const dismissButton = required<HTMLButtonElement>("attention-dismiss");
  const openButton = required<HTMLButtonElement>("attention-open-focus");

  let busy = false;

  const controls = [
    enableButton,
    disableButton,
    refreshButton,
    dismissButton,
    openButton,
  ];

  function setBusy(value: boolean) {
    busy = value;

    for (const button of controls) {
      button.disabled = value;
    }
  }

  function render(response: AttentionResponse) {
    status.textContent = response.enabled
      ? "Đang bật — chỉ quan sát khi Focus đang chạy"
      : "Đang tắt — không theo dõi tab";

    error.textContent = response.error ?? "";

    enableButton.hidden = response.enabled;
    disableButton.hidden = !response.enabled && !response.permissionGranted;

    const candidate = response.candidate;
    candidatePanel.hidden = candidate === null;

    if (candidate) {
      const group =
        candidate.category === "social_media" ? "mạng xã hội" : "nhắn tin";

      candidateText.textContent =
        `Có thể bạn đã dành khoảng ` +
        `${candidate.durationSeconds} giây trên một ` +
        `website ${group} trong giờ Focus. ` +
        `Đây chỉ là gợi ý, không phải kết luận.`;
    } else {
      candidateText.textContent = "";
    }
  }

  async function refresh(): Promise<void> {
    try {
      render(await send("ATTENTION_STATUS"));
    } catch {
      error.textContent = "Không thể kết nối Attention Service.";
    }
  }

  enableButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);
    error.textContent = "";

    // Call request() directly within the click gesture.
    void (async () => {
      try {
        const granted = await chrome.permissions.request({
          permissions: ["tabs"],
        });

        if (!granted) {
          error.textContent = "Bạn chưa cấp quyền. Tính năng vẫn tắt.";
          return;
        }

        render(await send("ATTENTION_ENABLE"));
      } catch {
        error.textContent = "Không thể yêu cầu quyền Chrome.";
      } finally {
        setBusy(false);
      }
    })();
  });

  disableButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);

    void (async () => {
      try {
        // Disable observation before revoking capability.
        await send("ATTENTION_DISABLE");

        await chrome.permissions.remove({
          permissions: ["tabs"],
        });

        await refresh();
      } catch {
        error.textContent =
          "Chưa thể thu hồi quyền. Kiểm tra chrome://extensions.";
      } finally {
        setBusy(false);
      }
    })();
  });

  refreshButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);
    void refresh().finally(() => setBusy(false));
  });

  dismissButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);

    void send("ATTENTION_DISMISS")
      .then(render)
      .catch(() => {
        error.textContent = "Không thể xóa gợi ý.";
      })
      .finally(() => setBusy(false));
  });

  openButton.addEventListener("click", () => {
    void chrome.tabs.create({
      url: `${__LUMIVOX_API_ORIGIN__}/en/focus`,
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "session" && "lumivox.attention.candidate.v1" in changes) {
      void refresh();
    }
  });

  window.addEventListener("lumivox-auth-changed", () => {
    void refresh();
  });

  void refresh();
}
