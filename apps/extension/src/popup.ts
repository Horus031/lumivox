import {
  PROTOCOL_CHANNEL,
  PROTOCOL_VERSION,
  isCheckSiteResponse,
  type CheckSiteResponse,
} from "./shared/protocol";

import {
  isAuthResponse,
  type AuthRequest,
  type AuthResponse,
} from "./shared/auth-protocol";

import { initializeFocusPopup } from "./focus-popup";

declare const __LUMIVOX_API_ORIGIN__: string;

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);

  if (!value) {
    throw new Error(`Missing element: ${id}`);
  }

  return value as T;
}

function makeAuthRequest(
  payload:
    | { type: "AUTH_STATUS" }
    | { type: "AUTH_LOGOUT" }
    | {
        type: "AUTH_LOGIN";
        email: string;
        password: string;
      },
): AuthRequest {
  return {
    channel: PROTOCOL_CHANNEL,
    version: PROTOCOL_VERSION,
    ...payload,
  };
}

async function sendAuth(request: AuthRequest): Promise<AuthResponse> {
  const response: unknown = await chrome.runtime.sendMessage(request);

  if (!isAuthResponse(response)) {
    throw new Error("Invalid Auth response");
  }

  return response;
}

document.addEventListener("DOMContentLoaded", () => {
  const siteStatus = element("site-status");
  const siteDetail = element("site-detail");
  const authStatus = element("auth-status");
  const authMessage = element("auth-message");

  const loginForm = element<HTMLFormElement>("login-form");
  const emailInput = element<HTMLInputElement>("email");
  const passwordInput = element<HTMLInputElement>("password");

  const accountView = element("account-view");
  const accountEmail = element("account-email");

  const refreshButton = element<HTMLButtonElement>("refresh");
  const openButton = element<HTMLButtonElement>("open-site");
  const logoutButton = element<HTMLButtonElement>("logout");

  let busy = false;

  function renderSite(response: CheckSiteResponse) {
    switch (response.state) {
      case "ready":
        siteStatus.textContent = "Website bridge đã sẵn sàng";
        siteDetail.textContent = response.origin ?? "";
        break;

      case "not_lumivox":
        siteStatus.textContent = "Chưa mở trang Lumivox";
        siteDetail.textContent = "";
        break;

      case "no_active_tab":
        siteStatus.textContent = "Không tìm thấy tab";
        siteDetail.textContent = "";
        break;

      case "unavailable":
        siteStatus.textContent = "Website bridge chưa sẵn sàng";
        siteDetail.textContent = "Thử reload tab Lumivox.";
        break;
    }
  }

  function renderAuth(response: AuthResponse) {
    authMessage.textContent = response.message ?? "";

    if (response.state === "signed_in" && response.user) {
      authStatus.textContent = "Đã đăng nhập";
      accountEmail.textContent = response.user.email;

      loginForm.hidden = true;
      accountView.hidden = false;
      passwordInput.value = "";
      window.dispatchEvent(new Event("lumivox-auth-changed"));
      return;
    }

    accountView.hidden = true;
    loginForm.hidden = false;

    authStatus.textContent =
      response.state === "unavailable"
        ? "Không thể xác minh tài khoản"
        : "Chưa đăng nhập";
  }

  async function refreshSite() {
    try {
      const response: unknown = await chrome.runtime.sendMessage({
        channel: PROTOCOL_CHANNEL,
        version: PROTOCOL_VERSION,
        type: "CHECK_SITE",
      });

      if (!isCheckSiteResponse(response)) {
        throw new Error("Invalid response");
      }

      renderSite(response);
    } catch {
      siteStatus.textContent = "Lỗi kết nối";
      siteDetail.textContent = "";
    }
  }

  async function refreshAuth() {
    try {
      const response = await sendAuth(makeAuthRequest({ type: "AUTH_STATUS" }));

      renderAuth(response);
    } catch {
      renderAuth({
        channel: PROTOCOL_CHANNEL,
        version: PROTOCOL_VERSION,
        type: "AUTH_RESULT",
        state: "unavailable",
        message: "Không thể liên hệ Service Worker.",
      });
    }
  }

  function setBusy(value: boolean) {
    busy = value;
    refreshButton.disabled = value;
    logoutButton.disabled = value;

    for (const control of Array.from(loginForm.elements)) {
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLButtonElement
      ) {
        control.disabled = value;
      }
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    setBusy(true);
    authStatus.textContent = "Đang đăng nhập...";

    void (async () => {
      try {
        const response = await sendAuth(
          makeAuthRequest({
            type: "AUTH_LOGIN",
            email,
            password,
          }),
        );

        renderAuth(response);
      } catch {
        authMessage.textContent = "Đăng nhập không khả dụng.";
      } finally {
        passwordInput.value = "";
        setBusy(false);
      }
    })();
  });

  logoutButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);

    void (async () => {
      try {
        const response = await sendAuth(
          makeAuthRequest({ type: "AUTH_LOGOUT" }),
        );

        renderAuth(response);
      } catch {
        authMessage.textContent = "Không thể đăng xuất.";
      } finally {
        setBusy(false);
      }
    })();
  });

  refreshButton.addEventListener("click", () => {
    if (busy) return;

    setBusy(true);

    void Promise.all([refreshSite(), refreshAuth()]).finally(() =>
      setBusy(false),
    );
  });

  openButton.addEventListener("click", () => {
    void chrome.tabs.create({
      url: `${__LUMIVOX_API_ORIGIN__}/en/focus`,
    });
  });

  initializeFocusPopup();

  void Promise.all([refreshSite(), refreshAuth()]);
});
